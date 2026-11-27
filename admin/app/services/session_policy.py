"""Device-class session policy.

Every account may hold at most THREE live sessions - one per device class:

    mobile  (phone: Android / iOS)
    tablet  (iPad, Android tablet, ...)
    desktop (PC / laptop / Mac)

Signing in on a class that already has a live session closes the older one, so
the limit holds no matter how many devices a user (or an attacker holding a
password) signs in from. The newest login always wins.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Optional

DeviceClass = Literal["mobile", "tablet", "desktop"]
DEVICE_CLASSES: tuple[str, ...] = ("mobile", "tablet", "desktop")
MAX_SESSIONS = len(DEVICE_CLASSES)  # one live session per class
LABELS = {"mobile": "phone", "tablet": "tablet", "desktop": "computer"}

# Android tablets omit the "Mobile" token; Samsung tablets are SM-T* / SM-X*.
_TABLET = re.compile(r"ipad|tablet|playbook|kindle|silk/|sm-t\d|sm-x\d|nexus 7|nexus 9", re.I)
_MOBILE = re.compile(r"iphone|ipod|windows phone|iemobile|blackberry|bb10|opera mini|webos|\bmobile\b", re.I)


def classify_device(user_agent: Optional[str], hint: Optional[str] = None) -> str:
    """Return mobile | tablet | desktop.

    `hint` is an optional client-supplied class. iPadOS 13+ reports itself as a
    Mac, so the server cannot see it is a tablet from the User-Agent alone. A
    hint can only choose one of the three classes, so it can never raise the
    total above three sessions.
    """
    if hint in DEVICE_CLASSES:
        return hint  # type: ignore[return-value]
    ua = user_agent or ""
    low = ua.lower()
    if "android" in low:
        return "tablet" if (_TABLET.search(ua) or "mobile" not in low) else "mobile"
    if _TABLET.search(ua):
        return "tablet"
    if _MOBILE.search(ua):
        return "mobile"
    return "desktop"


def session_class(session: dict[str, Any]) -> str:
    """Class of a stored session (older sessions have no device_type yet)."""
    stored = session.get("device_type")
    return stored if stored in DEVICE_CLASSES else classify_device(session.get("user_agent"))


def ended_message(session: Optional[dict[str, Any]]) -> str:
    """Human message for a session that was closed."""
    if session and session.get("revoked_reason") == "device_limit":
        label = LABELS.get(session_class(session), "device")
        return f"You were signed out because your account was signed in on another {label}."
    return "Session not found or revoked"


def _ts(session: dict[str, Any]) -> float:
    created = session.get("created_at")
    if not isinstance(created, datetime):
        return 0.0
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.timestamp()


def pick_losers(sessions: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Newest session per class survives; every other live session is a loser.

    Ordering is deterministic (created_at, then _id), so two simultaneous logins
    on the same class converge on the same single survivor instead of closing
    each other.
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    for s in sessions:
        groups.setdefault(session_class(s), []).append(s)
    losers: list[dict[str, Any]] = []
    for items in groups.values():
        items.sort(key=lambda s: (_ts(s), str(s.get("_id"))), reverse=True)
        losers.extend(items[1:])
    return losers


async def enforce_session_limits(db: Any, user_id: str, now: Optional[datetime] = None) -> list[str]:
    """Close surplus live sessions. Returns the `sid`s that were closed."""
    now = now or datetime.now(timezone.utc)
    live = [s async for s in db.sessions.find({"user_id": user_id, "revoked": False})]
    losers = pick_losers(live)
    if not losers:
        return []
    await db.sessions.update_many(
        {"_id": {"$in": [s["_id"] for s in losers]}, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now, "revoked_reason": "device_limit"}},
    )
    await db.user_activity_logs.insert_one(
        {
            "user_id": user_id,
            "event_type": "auth",
            "action": "session_replaced",
            "resource_type": "session",
            "resource_id": str(losers[0]["_id"]),
            "timestamp": now,
            "metadata": {"closed": len(losers), "device_types": sorted({session_class(s) for s in losers})},
        }
    )
    return [s["sid"] for s in losers if s.get("sid")]
