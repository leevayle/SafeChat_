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
        doc = {
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
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
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if req["to_user_id"] != user_id:
            raise ForbiddenError("Not your request to accept")
        if req["status"] != ContactRequestStatus.PENDING.value:
            raise ConflictError("Request is not pending")

        now = datetime.now(timezone.utc)
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": ContactRequestStatus.ACCEPTED.value, "updated_at": now}},
        )

        from_user = await db.users.find_one(
            {"_id": ObjectId(req["from_user_id"])},
            {"phone_number": 1, "phone": 1},
        )
        share_phone = bool(req.get("share_phone"))
        from_phone = (
            (from_user.get("phone_number") or from_user.get("phone") or "")
            if from_user and share_phone
            else ""
        )

        for owner, contact, peer_phone in (
            (req["from_user_id"], req["to_user_id"], ""),
            (req["to_user_id"], req["from_user_id"], from_phone),
        ):
            set_fields: Dict[str, Any] = {
                "contact_status": ContactStatus.ACCEPTED.value,
                "updated_at": now,
            }
            if peer_phone:
                set_fields["shared_phone"] = peer_phone
            await db.contacts.update_one(
                {"owner_user_id": owner, "contact_user_id": contact},
                {
                    "$set": set_fields,
                    "$setOnInsert": {
                        "owner_user_id": owner,
                        "contact_user_id": contact,
                        "nickname": None,
                        "created_at": now,
                    },
                },
                upsert=True,
            )

        await db.user_activity_logs.insert_one(
            {
                "user_id": user_id,
                "event_type": "contact",
                "action": "request_accepted",
                "resource_type": "contact_request",
                "resource_id": request_id,
                "timestamp": now,
                "metadata": {"from_user_id": req["from_user_id"]},
            }
        )
        return {"id": request_id, "status": ContactRequestStatus.ACCEPTED.value}

    @staticmethod
    async def reject_request(request_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if req["to_user_id"] != user_id:
            raise ForbiddenError("Not your request to reject")
        if req["status"] != ContactRequestStatus.PENDING.value:
            raise ConflictError("Request is not pending")

        now = datetime.now(timezone.utc)
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": ContactRequestStatus.REJECTED.value, "updated_at": now}},
        )
        return {"id": request_id, "status": ContactRequestStatus.REJECTED.value}

    @staticmethod
    async def list_contacts(user_id: str) -> List[dict]:
        db = get_database()
        contacts = (
            await db.contacts.find(
                {
                    "owner_user_id": user_id,
                    "contact_status": ContactStatus.ACCEPTED.value,
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
            phone = (
                c.get("shared_phone")
                or contact_user.get("phone_number")
                or contact_user.get("phone")
                or ""
            )
            results.append(
                {
                    "id": str(c["_id"]),
                    "contact_user_id": c["contact_user_id"],
                    "username": contact_user["username"],
                    "display_name": contact_user["display_name"],
                    "profile_photo": contact_user.get("profile_photo"),
                    "phone_number": phone,
                    "nickname": c.get("nickname"),
                    "contact_status": c["contact_status"],
                    "created_at": _iso(c.get("created_at")),
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
