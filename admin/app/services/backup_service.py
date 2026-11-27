"""
SafeChat database backup service.

Exports selected collections (or the full DB) into a single gzip-compressed
JSON archive under storage/backups/. Supports a point-in-time cutoff so the
live cluster can keep accepting writes while the snapshot only includes
documents at or before `until`.
"""
from __future__ import annotations

import asyncio
import gzip
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from bson import ObjectId

logger = logging.getLogger(__name__)

# Resolve storage relative to backend root (…/backend/storage/backups)
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
BACKUP_DIR = _BACKEND_ROOT / "storage" / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Named scopes → collection names (None = every collection in the DB)
BACKUP_SCOPES: Dict[str, Optional[List[str]]] = {
    "full": None,
    "messages": ["messages"],
    "conversations": ["conversations", "messages"],
    "users": ["users"],
    "contacts": ["contacts", "save_requests"],
    "support": ["support_tickets", "support_replies", "tickets"],
    "payments": ["payments", "payment_intents", "subscriptions"],
    "status": ["status", "statuses", "status_views"],
    "groups": ["groups", "group_messages", "group_members"],
    "audit": ["audit_logs", "admin_audit", "audit"],
    "notes": ["notes", "self_notes"],
}

# Fields used for point-in-time filtering
_DATE_FIELDS = (
    "created_at",
    "updated_at",
    "sent_at",
    "timestamp",
    "paid_at",
    "last_message_at",
    "expires_at",
)

# In-memory job registry (single process)
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = asyncio.Lock()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_until(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _json_default(obj: Any) -> Any:
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        if obj.tzinfo is None:
            obj = obj.replace(tzinfo=timezone.utc)
        return obj.isoformat()
    if isinstance(obj, bytes):
        return {"$binary": obj.hex()}
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _time_query(until: Optional[datetime]) -> Dict[str, Any]:
    """Documents with any known date field <= until, or no date fields at all."""
    if until is None:
        return {}
    ors: List[Dict[str, Any]] = [{field: {"$lte": until}} for field in _DATE_FIELDS]
    # Include reference docs that never had timestamps (e.g. some config rows)
    ors.append(
        {
            "$and": [{field: {"$exists": False}} for field in _DATE_FIELDS],
        }
    )
    return {"$or": ors}


async def _set_job(job_id: str, **patch: Any) -> None:
    async with _jobs_lock:
        cur = _jobs.get(job_id) or {}
        cur.update(patch)
        cur["updated_at"] = _utc_now().isoformat()
        _jobs[job_id] = cur


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    return _jobs.get(job_id)


def list_jobs(limit: int = 20) -> List[Dict[str, Any]]:
    items = sorted(
        _jobs.values(),
        key=lambda j: j.get("started_at") or "",
        reverse=True,
    )
    return items[:limit]


def list_backup_files() -> List[Dict[str, Any]]:
    """Scan storage/backups for completed archive files."""
    out: List[Dict[str, Any]] = []
    if not BACKUP_DIR.exists():
        return out
    for path in sorted(BACKUP_DIR.glob("*.json.gz"), reverse=True):
        stat = path.stat()
        meta_path = path.with_suffix("").with_suffix(".meta.json")  # file.json.gz → file.meta.json
        # Prefer sibling .meta.json named without .json.gz
        meta_path = Path(str(path)[: -len(".json.gz")] + ".meta.json")
        meta: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
        out.append(
            {
                "filename": path.name,
                "path": str(path),
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "scope": meta.get("scope"),
                "until": meta.get("until"),
                "collections": meta.get("collections"),
                "document_count": meta.get("document_count"),
                "job_id": meta.get("job_id"),
            }
        )
    return out


def backup_file_path(filename: str) -> Optional[Path]:
    # Prevent path traversal
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        return None
    if not re.match(r"^safechat-[\w\-.]+\.json\.gz$", filename):
        return None
    path = BACKUP_DIR / filename
    if not path.is_file():
        return None
    return path


def delete_backup_file(filename: str) -> bool:
    path = backup_file_path(filename)
    if not path:
        return False
    path.unlink(missing_ok=True)
    meta = Path(str(path)[: -len(".json.gz")] + ".meta.json")
    meta.unlink(missing_ok=True)
    return True


async def start_backup(
    *,
    scope: str = "full",
    until: Optional[str] = None,
    triggered_by: str = "admin",
) -> Dict[str, Any]:
    scope = (scope or "full").strip().lower()
    if scope not in BACKUP_SCOPES:
        raise ValueError(f"Unknown scope '{scope}'. Choose: {', '.join(BACKUP_SCOPES)}")

    until_dt = _parse_until(until)
    job_id = uuid.uuid4().hex[:12]
    stamp = _utc_now().strftime("%Y%m%d-%H%M%S")
    filename = f"safechat-{scope}-{stamp}-{job_id}.json.gz"

    job = {
        "id": job_id,
        "status": "queued",
        "scope": scope,
        "until": until_dt.isoformat() if until_dt else None,
        "filename": filename,
        "progress": 0,
        "phase": "queued",
        "message": "Queued",
        "document_count": 0,
        "collections_done": [],
        "error": None,
        "started_at": _utc_now().isoformat(),
        "finished_at": None,
        "triggered_by": triggered_by,
        "size_bytes": None,
    }
    async with _jobs_lock:
        _jobs[job_id] = job

    until_label = until_dt.isoformat() if until_dt else "now"
    start_msg = f"Backup started by {triggered_by} upto {until_label} (scope={scope}, job={job_id})"
    logger.info(start_msg)
    print(start_msg, flush=True)

    asyncio.create_task(
        _run_backup(job_id=job_id, scope=scope, until_dt=until_dt, filename=filename)
    )
    return job


async def _run_backup(
    *,
    job_id: str,
    scope: str,
    until_dt: Optional[datetime],
    filename: str,
) -> None:
    from app.core.database import get_database

    await _set_job(job_id, status="running", phase="preparing", message="Preparing backup…", progress=2)
    try:
        db = get_database()
        wanted = BACKUP_SCOPES[scope]
        if wanted is None:
            collections = sorted(await db.list_collection_names())
        else:
            existing = set(await db.list_collection_names())
            collections = [c for c in wanted if c in existing]

        if not collections:
            await _set_job(
                job_id,
                status="failed",
                phase="failed",
                message="No matching collections found",
                error="No collections",
                finished_at=_utc_now().isoformat(),
                progress=100,
            )
            return

        query = _time_query(until_dt)
        archive_path = BACKUP_DIR / filename
        total_docs = 0
        collection_stats: Dict[str, int] = {}
        done: List[str] = []

        await _set_job(
            job_id,
            phase="exporting",
            message=f"Exporting {len(collections)} collection(s)…",
            progress=5,
        )

        # Stream into gzip file as a JSON object built collection-by-collection
        # Structure: { meta, collections: { name: [docs…] } }
        # Use bson.json_util for safe ObjectId/datetime encoding, then re-pack.
        meta = {
            "job_id": job_id,
            "scope": scope,
            "until": until_dt.isoformat() if until_dt else None,
            "created_at": _utc_now().isoformat(),
            "database": getattr(db, "name", None),
            "format": "safechat-backup-v1",
        }

        # Write via temp then rename
        tmp_path = archive_path.with_suffix(archive_path.suffix + ".partial")

        def _write_archive(payload: dict) -> int:
            with gzip.open(tmp_path, "wt", encoding="utf-8") as fh:
                json.dump(payload, fh, default=_json_default, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp_path, archive_path)
            return archive_path.stat().st_size

        # Prefer streaming per collection into memory-friendly batches
        collections_data: Dict[str, List[Any]] = {}
        n_cols = max(len(collections), 1)

        for idx, name in enumerate(collections):
            await _set_job(
                job_id,
                phase="exporting",
                message=f"Exporting `{name}`…",
                progress=min(90, 5 + int(85 * idx / n_cols)),
            )
            coll = db[name]
            batch: List[Any] = []
            cursor = coll.find(query).batch_size(200)
            count = 0
            async for doc in cursor:
                # Normalize ObjectId for JSON
                if "_id" in doc and isinstance(doc["_id"], ObjectId):
                    doc["_id"] = str(doc["_id"])
                batch.append(doc)
                count += 1
                if count % 500 == 0:
                    await _set_job(
                        job_id,
                        message=f"Exporting `{name}` ({count} docs)…",
                        document_count=total_docs + count,
                    )
            collections_data[name] = batch
            collection_stats[name] = count
            total_docs += count
            done.append(name)
            await _set_job(
                job_id,
                collections_done=list(done),
                document_count=total_docs,
            )

        payload = {
            "meta": {**meta, "collections": collection_stats, "document_count": total_docs},
            "collections": collections_data,
        }

        await _set_job(job_id, phase="writing", message="Compressing archive…", progress=92)
        size = await asyncio.to_thread(_write_archive, payload)

        meta_path = Path(str(archive_path)[: -len(".json.gz")] + ".meta.json")
        meta_path.write_text(
            json.dumps(
                {
                    **meta,
                    "collections": collection_stats,
                    "document_count": total_docs,
                    "size_bytes": size,
                    "filename": filename,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        finished = _utc_now().isoformat()
        await _set_job(
            job_id,
            status="completed",
            phase="completed",
            message=f"Backup ready ({total_docs} documents)",
            progress=100,
            document_count=total_docs,
            size_bytes=size,
            finished_at=finished,
            collections_done=done,
        )
        done_msg = f"Backup complete {finished} (job={job_id}, file={filename}, docs={total_docs}, size={size})"
        logger.info(done_msg)
        print(done_msg, flush=True)
    except Exception as exc:
        logger.exception("Backup %s failed", job_id)
        await _set_job(
            job_id,
            status="failed",
            phase="failed",
            message=str(exc),
            error=str(exc),
            progress=100,
            finished_at=_utc_now().isoformat(),
        )


async def run_scheduled_backup(scope: str = "full") -> Dict[str, Any]:
    """Entry point for cron / Task Scheduler — full DB up to now."""
    until = _utc_now().isoformat()
    job = await start_backup(scope=scope, until=until, triggered_by="scheduler")
    # Wait until terminal state (for scripts that want a blocking exit code)
    while True:
        cur = get_job(job["id"])
        if not cur or cur.get("status") in ("completed", "failed"):
            return cur or job
        await asyncio.sleep(0.5)
