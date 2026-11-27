"""Call history endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.exceptions import success_response, ValidationError, NotFoundError

router = APIRouter(prefix="/calls", tags=["Calls"])


def _utc_iso(v=None) -> str:
    d = v or datetime.now(timezone.utc)
    if getattr(d, "tzinfo", None) is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class CallLogBody(BaseModel):
    peer_id: str
    kind: str = Field("audio", pattern="^(audio|video)$")
    direction: str = Field("out", pattern="^(in|out|missed)$")
    status: str = Field("completed", pattern="^(completed|missed|declined|failed|cancelled)$")
    duration_seconds: int = Field(0, ge=0)
    call_id: Optional[str] = None


@router.get("")
async def list_calls(user: dict = Depends(get_current_user)):
    """Recent call history for the current user (newest first)."""
    db = get_database()
    uid = user["id"]
    rows = (
        await db.call_logs.find({"user_id": uid})
        .sort("created_at", -1)
        .to_list(length=100)
    )
    peer_ids = list({r["peer_id"] for r in rows if r.get("peer_id")})
    users = {}
    contacts = {}
    oids = [ObjectId(i) for i in peer_ids if ObjectId.is_valid(i)]
    if oids:
        async for u in db.users.find(
            {"_id": {"$in": oids}},
            {"username": 1, "display_name": 1, "profile_photo": 1, "phone_number": 1},
        ):
            users[str(u["_id"])] = u
        async for c in db.contacts.find(
            {"owner_user_id": uid, "contact_user_id": {"$in": peer_ids}}
        ):
            contacts[c["contact_user_id"]] = c

    out = []
    for r in rows:
        pid = r.get("peer_id") or ""
        u = users.get(pid) or {}
        c = contacts.get(pid) or {}
        share_phone = bool(c.get("share_phone") or c.get("phone_shared"))
        # Prefer saved nickname; phone only when contact shared it
        phone = ""
        if share_phone:
            phone = c.get("phone_number") or u.get("phone_number") or ""
        name = (
            c.get("nickname")
            or c.get("saved_name")
            or u.get("display_name")
            or u.get("username")
            or "Unknown"
        )
        username = u.get("username") or ""
        created = r.get("created_at")
        out.append(
            {
                "id": str(r["_id"]),
                "contactId": pid,
                "peer_id": pid,
                "name": name,
                "username": username,
                "phone": phone if share_phone else "",
                "show_phone": share_phone,
                "photo": u.get("profile_photo"),
                "kind": r.get("kind") or "audio",
                "direction": r.get("direction") or "out",
                "status": r.get("status") or "completed",
                "duration_seconds": int(r.get("duration_seconds") or 0),
                "call_id": r.get("call_id"),
                "created_at": _utc_iso(created) if created else None,
                "time": _utc_iso(created) if created else None,
            }
        )
    return success_response("Calls", {"calls": out})


@router.post("")
async def log_call(body: CallLogBody, user: dict = Depends(get_current_user)):
    """Store a call history entry for the current user."""
    db = get_database()
    if not body.peer_id:
        raise ValidationError("peer_id required")
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user["id"],
        "peer_id": body.peer_id,
        "kind": body.kind,
        "direction": body.direction,
        "status": body.status,
        "duration_seconds": body.duration_seconds,
        "call_id": body.call_id,
        "created_at": now,
    }
    result = await db.call_logs.insert_one(doc)
    return success_response(
        "Call logged",
        {
            "id": str(result.inserted_id),
            "contactId": body.peer_id,
            "kind": body.kind,
            "direction": body.direction,
            "status": body.status,
            "duration_seconds": body.duration_seconds,
            "created_at": _utc_iso(now),
        },
    )
