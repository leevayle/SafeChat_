"""User notes / checklists / reminders — synced across devices."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId

from app.core.database import get_database
from app.core.exceptions import NotFoundError, ValidationError


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if getattr(v, "tzinfo", None) is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class NotesService:
    COLLECTION = "user_notes"
    VALID_KINDS = {"note", "checklist", "reminder"}

    @staticmethod
    def _serialize(doc: dict) -> dict:
        return {
            "id": str(doc["_id"]),
            "kind": doc.get("kind") or "note",
            "title": doc.get("title") or "",
            "body": doc.get("body") or "",
            "items": doc.get("items") or [],
            "remind_at": _iso(doc.get("remind_at")),
            "pinned": bool(doc.get("pinned")),
            "color": doc.get("color"),
            "created_at": _iso(doc.get("created_at")),
            "updated_at": _iso(doc.get("updated_at")),
        }

    @staticmethod
    async def list_notes(user_id: str, kind: Optional[str] = None) -> List[dict]:
        db = get_database()
        q: Dict[str, Any] = {"user_id": user_id, "deleted_at": None}
        if kind and kind in NotesService.VALID_KINDS:
            q["kind"] = kind
        cursor = db[NotesService.COLLECTION].find(q).sort(
            [("pinned", -1), ("updated_at", -1)]
        )
        out = []
        async for doc in cursor:
            out.append(NotesService._serialize(doc))
        return out

    @staticmethod
    async def create_note(user_id: str, payload: dict) -> dict:
        kind = (payload.get("kind") or "note").strip().lower()
        if kind not in NotesService.VALID_KINDS:
            raise ValidationError("Invalid note kind")
        now = _utc_now()
        items = payload.get("items") or []
        if kind == "checklist" and not isinstance(items, list):
            items = []
        # normalize items
        clean_items = []
        for it in items:
            if not isinstance(it, dict):
                continue
            clean_items.append(
                {
                    "id": str(it.get("id") or ObjectId()),
                    "text": str(it.get("text") or ""),
                    "done": bool(it.get("done")),
                }
            )
        doc = {
            "user_id": user_id,
            "kind": kind,
            "title": str(payload.get("title") or "")[:200],
            "body": str(payload.get("body") or "")[:20000],
            "items": clean_items if kind == "checklist" else [],
            "remind_at": payload.get("remind_at") or payload.get("remindAt"),
            "pinned": bool(payload.get("pinned")),
            "color": payload.get("color"),
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        # client-supplied id for migration / optimistic UI
        client_id = payload.get("id")
        if client_id and ObjectId.is_valid(str(client_id)):
            doc["_id"] = ObjectId(str(client_id))
        db = get_database()
        try:
            result = await db[NotesService.COLLECTION].insert_one(doc)
            doc["_id"] = result.inserted_id
        except Exception:
            # collision on client id — update instead
            if client_id and ObjectId.is_valid(str(client_id)):
                await db[NotesService.COLLECTION].update_one(
                    {"_id": ObjectId(str(client_id)), "user_id": user_id},
                    {"$set": {**doc, "updated_at": now}},
                )
                doc["_id"] = ObjectId(str(client_id))
            else:
                raise
        return NotesService._serialize(doc)

    @staticmethod
    async def update_note(user_id: str, note_id: str, payload: dict) -> dict:
        if not ObjectId.is_valid(note_id):
            raise ValidationError("Invalid note id")
        db = get_database()
        existing = await db[NotesService.COLLECTION].find_one(
            {"_id": ObjectId(note_id), "user_id": user_id, "deleted_at": None}
        )
        if not existing:
            raise NotFoundError("Note not found")

        updates: Dict[str, Any] = {"updated_at": _utc_now()}
        if "title" in payload:
            updates["title"] = str(payload.get("title") or "")[:200]
        if "body" in payload:
            updates["body"] = str(payload.get("body") or "")[:20000]
        if "pinned" in payload:
            updates["pinned"] = bool(payload.get("pinned"))
        if "color" in payload:
            updates["color"] = payload.get("color")
        if "remind_at" in payload or "remindAt" in payload:
            updates["remind_at"] = payload.get("remind_at") or payload.get("remindAt")
        if "items" in payload and isinstance(payload.get("items"), list):
            clean_items = []
            for it in payload["items"]:
                if not isinstance(it, dict):
                    continue
                clean_items.append(
                    {
                        "id": str(it.get("id") or ObjectId()),
                        "text": str(it.get("text") or ""),
                        "done": bool(it.get("done")),
                    }
                )
            updates["items"] = clean_items
        if "kind" in payload:
            kind = str(payload.get("kind") or "").lower()
            if kind in NotesService.VALID_KINDS:
                updates["kind"] = kind

        await db[NotesService.COLLECTION].update_one(
            {"_id": ObjectId(note_id)}, {"$set": updates}
        )
        doc = await db[NotesService.COLLECTION].find_one({"_id": ObjectId(note_id)})
        return NotesService._serialize(doc)

    @staticmethod
    async def delete_note(user_id: str, note_id: str) -> None:
        if not ObjectId.is_valid(note_id):
            raise ValidationError("Invalid note id")
        db = get_database()
        res = await db[NotesService.COLLECTION].update_one(
            {"_id": ObjectId(note_id), "user_id": user_id, "deleted_at": None},
            {"$set": {"deleted_at": _utc_now(), "updated_at": _utc_now()}},
        )
        if res.matched_count == 0:
            raise NotFoundError("Note not found")

    @staticmethod
    async def bulk_upsert(user_id: str, notes: List[dict]) -> List[dict]:
        """Migrate local notes to server (idempotent by id when valid ObjectId)."""
        out = []
        for n in notes or []:
            try:
                nid = str(n.get("id") or "")
                if nid and ObjectId.is_valid(nid):
                    db = get_database()
                    existing = await db[NotesService.COLLECTION].find_one(
                        {"_id": ObjectId(nid), "user_id": user_id}
                    )
                    if existing and not existing.get("deleted_at"):
                        out.append(await NotesService.update_note(user_id, nid, n))
                        continue
                out.append(await NotesService.create_note(user_id, n))
            except Exception:
                continue
        return out
