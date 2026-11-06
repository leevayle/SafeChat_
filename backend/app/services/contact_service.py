"""Contact management service — optimized with batched user lookups."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from bson import ObjectId
from app.core.database import get_database
from app.core.exceptions import (
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
)
from app.models.contact import ContactStatus, ContactRequestStatus
import logging

logger = logging.getLogger(__name__)


async def _users_by_ids(db, ids: List[str]) -> Dict[str, dict]:
    """Batch-load users by string ids. Returns map id -> user doc."""
    oids = [ObjectId(i) for i in ids if i and ObjectId.is_valid(i)]
    if not oids:
        return {}
    out: Dict[str, dict] = {}
    async for u in db.users.find(
        {"_id": {"$in": oids}},
        {
            "username": 1,
            "display_name": 1,
            "profile_photo": 1,
            "phone_number": 1,
            "phone": 1,
            "bio": 1,
            "subscription_plan": 1,
            "premium_settings": 1,
            "preferences": 1,
        },
    ):
        out[str(u["_id"])] = u
    return out


def _iso(dt) -> Optional[str]:
    if not dt:
        return None
    if getattr(dt, "tzinfo", None):
        return dt.isoformat().replace("+00:00", "Z")
    return dt.isoformat() + "Z"


class ContactService:
    @staticmethod
    async def send_request(
        from_user_id: str,
        to_username: str,
        message: Optional[str] = None,
        share_phone: bool = False,
        from_nickname: Optional[str] = None,
    ) -> dict:
        db = get_database()
        target = await db.users.find_one({"username": to_username.lower().strip()})
        if not target:
            raise NotFoundError("User not found")
        to_user_id = str(target["_id"])
        if to_user_id == from_user_id:
            raise ValidationError("Cannot send contact request to yourself")

        existing = await db.contacts.find_one(
            {"owner_user_id": from_user_id, "contact_user_id": to_user_id}
        )
        if existing and existing.get("contact_status") == ContactStatus.ACCEPTED.value:
            raise ConflictError("Already in contacts")

        blocked = await db.blocked_users.find_one(
            {"blocker_id": to_user_id, "blocked_id": from_user_id}
        )
        if blocked:
            raise ForbiddenError("Cannot send request")

        existing_req = await db.contact_requests.find_one(
            {
                "from_user_id": from_user_id,
                "to_user_id": to_user_id,
                "status": ContactRequestStatus.PENDING.value,
            }
        )
        if existing_req:
            raise ConflictError("Request already pending")

        # Decline cooldown: after 3 declines, block for 24 hours then reset
        limit = await db.contact_decline_limits.find_one(
            {"from_user_id": from_user_id, "to_user_id": to_user_id}
        )
        if limit:
            count = int(limit.get("decline_count") or 0)
            last = limit.get("last_declined_at")
            if last is not None and getattr(last, "tzinfo", None) is None:
                last = last.replace(tzinfo=timezone.utc)
            if last is not None:
                age_sec = (datetime.now(timezone.utc) - last).total_seconds()
                if age_sec >= 24 * 3600:
                    await db.contact_decline_limits.update_one(
                        {"_id": limit["_id"]},
                        {"$set": {"decline_count": 0, "updated_at": datetime.now(timezone.utc)}},
                    )
                    count = 0
                elif count >= 3:
                    hours_left = max(1, int((24 * 3600 - age_sec) / 3600))
                    raise ForbiddenError(
                        f"Save request limit reached. Try again in about {hours_left}h."
                    )

        reverse = await db.contact_requests.find_one(
            {
                "from_user_id": to_user_id,
                "to_user_id": from_user_id,
                "status": ContactRequestStatus.PENDING.value,
            }
        )
        if reverse:
            return await ContactService.accept_request(str(reverse["_id"]), from_user_id)

        now = datetime.now(timezone.utc)
        # from_nickname is private to the sender — never returned on incoming lists
        nick = (from_nickname or "").strip() or None
        doc = {
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "from_nickname": nick,
            "message": message,
            "share_phone": bool(share_phone),
            "status": ContactRequestStatus.PENDING.value,
            "created_at": now,
            "updated_at": now,
        }
        result = await db.contact_requests.insert_one(doc)
        await db.user_activity_logs.insert_one(
            {
                "user_id": from_user_id,
                "event_type": "contact",
                "action": "request_sent",
                "resource_type": "contact_request",
                "resource_id": str(result.inserted_id),
                "timestamp": now,
                "metadata": {"to_user_id": to_user_id},
            }
        )
        return {
            "id": str(result.inserted_id),
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "status": ContactRequestStatus.PENDING.value,
            "created_at": _iso(now),
        }

    @staticmethod
    async def accept_request(request_id: str, user_id: str) -> dict:
        """Accept a save request and create mutual contact edges atomically.

        Both contact edges must succeed; if either fails the request stays pending
        (or is left unchanged) so we never end up one-sided.
        """
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if req["to_user_id"] != user_id:
            raise ForbiddenError("Not your request to accept")
        status = (req.get("status") or "").lower()
        if status not in (
            ContactRequestStatus.PENDING.value,
            ContactRequestStatus.ACCEPTED.value,
            "pending",
            "accepted",
        ):
            raise ConflictError("Request is not pending")

        now = datetime.now(timezone.utc)
        share_phone = bool(req.get("share_phone"))
        sender_nick = (req.get("from_nickname") or "").strip() or None
        from_id = str(req["from_user_id"])
        to_id = str(req["to_user_id"])

        from_phone = ""
        if share_phone:
            try:
                oid = ObjectId(from_id) if ObjectId.is_valid(from_id) else None
                from_user = await db.users.find_one(
                    {"_id": oid} if oid else {"_id": from_id},
                    {"phone_number": 1, "phone": 1},
                )
                if from_user:
                    from_phone = from_user.get("phone_number") or from_user.get("phone") or ""
            except Exception:
                from_phone = ""

        async def _upsert_edge(owner: str, contact: str, peer_phone: str, nick: Optional[str]):
            set_fields: Dict[str, Any] = {
                "contact_status": ContactStatus.ACCEPTED.value,
                "updated_at": now,
            }
            if peer_phone:
                set_fields["shared_phone"] = peer_phone
            if nick:
                set_fields["nickname"] = nick
            # Never put the same path in both $set and $setOnInsert (Mongo conflict → 500)
            insert_doc: Dict[str, Any] = {
                "owner_user_id": owner,
                "contact_user_id": contact,
                "created_at": now,
            }
            await db.contacts.update_one(
                {"owner_user_id": owner, "contact_user_id": contact},
                {"$set": set_fields, "$setOnInsert": insert_doc},
                upsert=True,
            )

        # 1) Write both edges first. If either fails, abort without accepting.
        try:
            await _upsert_edge(from_id, to_id, "", sender_nick)
            await _upsert_edge(to_id, from_id, from_phone or "", None)
        except Exception as e:
            # Best-effort cleanup of a partial edge
            try:
                await db.contacts.delete_many(
                    {
                        "$or": [
                            {"owner_user_id": from_id, "contact_user_id": to_id},
                            {"owner_user_id": to_id, "contact_user_id": from_id},
                        ],
                        "contact_status": ContactStatus.ACCEPTED.value,
                        "created_at": now,
                    }
                )
            except Exception:
                pass
            raise ValidationError(f"Could not save contact on both sides: {e}")

        # 2) Mark request accepted only after both edges exist
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {
                "$set": {
                    "status": ContactRequestStatus.ACCEPTED.value,
                    "updated_at": now,
                }
            },
        )

        # 3) Side effects (non-fatal)
        try:
            accepter = await db.users.find_one(
                {"_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id},
                {"username": 1, "display_name": 1, "profile_photo": 1},
            )
            uname = (accepter or {}).get("username") or "someone"
            dname = (accepter or {}).get("display_name") or uname
            await db.notifications.insert_one(
                {
                    "user_id": from_id,
                    "type": "contact_accepted",
                    "title": f"{dname} accepted your save request",
                    "body": f"@{uname} accepted your save request, you can now stay in touch.",
                    "actor_id": user_id,
                    "actor_name": dname,
                    "actor_photo": (accepter or {}).get("profile_photo"),
                    "read": False,
                    "created_at": now,
                    "metadata": {"request_id": request_id, "peer_user_id": user_id},
                }
            )
        except Exception:
            pass
        try:
            await db.user_activity_logs.insert_one(
                {
                    "user_id": user_id,
                    "event_type": "contact",
                    "action": "request_accepted",
                    "resource_type": "contact_request",
                    "resource_id": request_id,
                    "timestamp": now,
                    "metadata": {"from_user_id": from_id},
                }
            )
        except Exception:
            pass

        return {"id": request_id, "status": ContactRequestStatus.ACCEPTED.value}

    async def reject_request(request_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if req["to_user_id"] != user_id:
            raise ForbiddenError("Not your request to reject")
        status = (req.get("status") or "").lower()
        if status not in (ContactRequestStatus.PENDING.value, "pending"):
            raise ConflictError("Request is not pending")

        now = datetime.now(timezone.utc)
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": ContactRequestStatus.REJECTED.value, "updated_at": now}},
        )
        # Track decline count for 3-attempt / 24h cooldown rule
        from_id = str(req["from_user_id"])
        to_id = str(req["to_user_id"])
        try:
            await db.contact_decline_limits.update_one(
                {"from_user_id": from_id, "to_user_id": to_id},
                {
                    "$inc": {"decline_count": 1},
                    "$set": {"last_declined_at": now, "updated_at": now},
                    "$setOnInsert": {
                        "from_user_id": from_id,
                        "to_user_id": to_id,
                        "created_at": now,
                    },
                },
                upsert=True,
            )
        except Exception:
            pass
        return {"id": request_id, "status": ContactRequestStatus.REJECTED.value}

    @staticmethod
    async def list_contacts(user_id: str) -> List[dict]:
        db = get_database()
        contacts = (
            await db.contacts.find(
                {
                    "owner_user_id": user_id,
                    "contact_status": {
                        "$in": [
                            ContactStatus.ACCEPTED.value,
                            "accepted",
                            "ACCEPTED",
                        ]
                    },
                }
            )
            .sort("created_at", -1)
            .to_list(length=500)
        )
        if not contacts:
            return []

        peer_ids = [c["contact_user_id"] for c in contacts]
        users = await _users_by_ids(db, peer_ids)

        results = []
        for c in contacts:
            contact_user = users.get(c["contact_user_id"])
            if not contact_user:
                continue
            # Phone only if peer shared it on the save request; username is always unique
            phone = (c.get("shared_phone") or "").strip()
            results.append(
                {
                    "id": str(c["_id"]),
                    "contact_user_id": c["contact_user_id"],
                    "username": contact_user["username"],
                    "display_name": contact_user.get("display_name")
                    or contact_user["username"],
                    "profile_photo": contact_user.get("profile_photo"),
                    "phone_number": phone,
                    "nickname": c.get("nickname"),
                    "contact_status": c["contact_status"],
                    "created_at": _iso(c.get("created_at")),
                    "subscription_plan": contact_user.get("subscription_plan") or "pro",
                    "verified_badge": bool(
                        (contact_user.get("premium_settings") or {}).get("verified_badge", True)
                    )
                    and (contact_user.get("subscription_plan") or "pro") == "premium",
                    "premium_settings": contact_user.get("premium_settings")
                    or {
                        "verified_badge": True,
                        "force_read_receipts": False,
                        "live_typing": True,
                        "status_ads_enabled": True,
                    },
                    "busy": bool((contact_user.get("preferences") or {}).get("busy_enabled")),
                    "busy_message": (contact_user.get("preferences") or {}).get("busy_message")
                    or "",
                    "busy_until": (contact_user.get("preferences") or {}).get("busy_until"),
                }
            )
        return results

    @staticmethod
    async def list_incoming_requests(user_id: str) -> List[dict]:
        db = get_database()
        rows = (
            await db.contact_requests.find(
                {"to_user_id": user_id, "status": ContactRequestStatus.PENDING.value}
            )
            .sort("created_at", -1)
            .to_list(length=200)
        )
        users = await _users_by_ids(db, [r["from_user_id"] for r in rows])
        results = []
        for r in rows:
            from_user = users.get(r["from_user_id"])
            results.append(
                {
                    "id": str(r["_id"]),
                    "from_user_id": r["from_user_id"],
                    "to_user_id": r["to_user_id"],
                    "from_username": from_user["username"] if from_user else None,
                    "from_display_name": from_user["display_name"] if from_user else None,
                    "from_profile_photo": from_user.get("profile_photo") if from_user else None,
                    "message": r.get("message"),
                    "status": r["status"],
                    "created_at": _iso(r.get("created_at")),
                }
            )
        return results

    @staticmethod
    async def list_outgoing_requests(user_id: str) -> List[dict]:
        db = get_database()
        rows = (
            await db.contact_requests.find(
                {
                    "from_user_id": user_id,
                    "status": {
                        "$in": [
                            ContactRequestStatus.PENDING.value,
                            ContactRequestStatus.ACCEPTED.value,
                        ]
                    },
                }
            )
            .sort("created_at", -1)
            .to_list(length=200)
        )
        users = await _users_by_ids(db, [r["to_user_id"] for r in rows])
        results = []
        for r in rows:
            to_user = users.get(r["to_user_id"])
            results.append(
                {
                    "id": str(r["_id"]),
                    "from_user_id": r["from_user_id"],
                    "to_user_id": r["to_user_id"],
                    "to_username": to_user["username"] if to_user else None,
                    "to_display_name": to_user["display_name"] if to_user else None,
                    "to_profile_photo": to_user.get("profile_photo") if to_user else None,
                    "message": r.get("message"),
                    "status": r["status"],
                    "created_at": _iso(r.get("created_at")),
                }
            )
        return results

    @staticmethod
    async def remove_contact(user_id: str, contact_user_id: str) -> None:
        db = get_database()
        result = await db.contacts.delete_one(
            {"owner_user_id": user_id, "contact_user_id": contact_user_id}
        )
        if result.deleted_count == 0:
            raise NotFoundError("Contact not found")

    @staticmethod
    async def block_user(blocker_id: str, blocked_user_id: str) -> None:
        db = get_database()
        if blocker_id == blocked_user_id:
            raise ValidationError("Cannot block yourself")
        if not ObjectId.is_valid(blocked_user_id):
            raise ValidationError("Invalid user id")
        target = await db.users.find_one({"_id": ObjectId(blocked_user_id)}, {"_id": 1})
        if not target:
            raise NotFoundError("User not found")

        now = datetime.now(timezone.utc)
        await db.blocked_users.update_one(
            {"blocker_id": blocker_id, "blocked_id": blocked_user_id},
            {
                "$set": {"created_at": now},
                "$setOnInsert": {"blocker_id": blocker_id, "blocked_id": blocked_user_id},
            },
            upsert=True,
        )
        await db.contacts.delete_many(
            {
                "$or": [
                    {"owner_user_id": blocker_id, "contact_user_id": blocked_user_id},
                    {"owner_user_id": blocked_user_id, "contact_user_id": blocker_id},
                ]
            }
        )
        await db.contact_requests.update_many(
            {
                "$or": [
                    {"from_user_id": blocker_id, "to_user_id": blocked_user_id},
                    {"from_user_id": blocked_user_id, "to_user_id": blocker_id},
                ],
                "status": ContactRequestStatus.PENDING.value,
            },
            {"$set": {"status": ContactRequestStatus.CANCELLED.value, "updated_at": now}},
        )

    @staticmethod
    async def unblock_user(blocker_id: str, blocked_user_id: str) -> None:
        db = get_database()
        result = await db.blocked_users.delete_one(
            {"blocker_id": blocker_id, "blocked_id": blocked_user_id}
        )
        if result.deleted_count == 0:
            raise NotFoundError("Block record not found")

    @staticmethod
    async def update_nickname(user_id: str, contact_user_id: str, nickname: Optional[str]) -> dict:
        db = get_database()
        result = await db.contacts.update_one(
            {"owner_user_id": user_id, "contact_user_id": contact_user_id},
            {"$set": {"nickname": nickname, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise NotFoundError("Contact not found")
        return {"contact_user_id": contact_user_id, "nickname": nickname}
