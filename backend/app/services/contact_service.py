"""Contact management service."""
from datetime import datetime, timezone
from typing import List, Optional
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


class ContactService:
    @staticmethod
    async def send_request(from_user_id: str, to_username: str, message: Optional[str] = None) -> dict:
        db = get_database()
        target = await db.users.find_one({"username": to_username.lower().strip()})
        if not target:
            raise NotFoundError("User not found")
        to_user_id = str(target["_id"])
        if to_user_id == from_user_id:
            raise ValidationError("Cannot send contact request to yourself")

        # Already contacts?
        existing = await db.contacts.find_one(
            {"owner_user_id": from_user_id, "contact_user_id": to_user_id}
        )
        if existing and existing.get("contact_status") == ContactStatus.ACCEPTED.value:
            raise ConflictError("Already in contacts")

        # Blocked?
        blocked = await db.blocked_users.find_one(
            {"blocker_id": to_user_id, "blocked_id": from_user_id}
        )
        if blocked:
            raise ForbiddenError("Cannot send request")

        # Existing pending request
        existing_req = await db.contact_requests.find_one(
            {
                "from_user_id": from_user_id,
                "to_user_id": to_user_id,
                "status": ContactRequestStatus.PENDING.value,
            }
        )
        if existing_req:
            raise ConflictError("Request already pending")

        # Reverse pending?
        reverse = await db.contact_requests.find_one(
            {
                "from_user_id": to_user_id,
                "to_user_id": from_user_id,
                "status": ContactRequestStatus.PENDING.value,
            }
        )
        if reverse:
            # Auto-accept mutual
            return await ContactService.accept_request(str(reverse["_id"]), from_user_id)

        now = datetime.now(timezone.utc)
        doc = {
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "message": message,
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
            "created_at": now.isoformat(),
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

        # Create bidirectional contacts
        for owner, contact in (
            (req["from_user_id"], req["to_user_id"]),
            (req["to_user_id"], req["from_user_id"]),
        ):
            await db.contacts.update_one(
                {"owner_user_id": owner, "contact_user_id": contact},
                {
                    "$set": {
                        "contact_status": ContactStatus.ACCEPTED.value,
                        "updated_at": now,
                    },
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
        cursor = db.contacts.find(
            {"owner_user_id": user_id, "contact_status": ContactStatus.ACCEPTED.value}
        ).sort("created_at", -1)
        results = []
        async for c in cursor:
            contact_user = await db.users.find_one({"_id": ObjectId(c["contact_user_id"])})
            if not contact_user:
                continue
            results.append(
                {
                    "id": str(c["_id"]),
                    "contact_user_id": c["contact_user_id"],
                    "username": contact_user["username"],
                    "display_name": contact_user["display_name"],
                    "profile_photo": contact_user.get("profile_photo"),
                    "nickname": c.get("nickname"),
                    "contact_status": c["contact_status"],
                    "created_at": c["created_at"].isoformat() if c.get("created_at") else None,
                }
            )
        return results

    @staticmethod
    async def list_incoming_requests(user_id: str) -> List[dict]:
        db = get_database()
        cursor = db.contact_requests.find(
            {"to_user_id": user_id, "status": ContactRequestStatus.PENDING.value}
        ).sort("created_at", -1)
        results = []
        async for r in cursor:
            from_user = await db.users.find_one({"_id": ObjectId(r["from_user_id"])})
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
                    "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                }
            )
        return results

    @staticmethod
    async def list_outgoing_requests(user_id: str) -> List[dict]:
        db = get_database()
        cursor = db.contact_requests.find(
            {"from_user_id": user_id, "status": ContactRequestStatus.PENDING.value}
        ).sort("created_at", -1)
        results = []
        async for r in cursor:
            to_user = await db.users.find_one({"_id": ObjectId(r["to_user_id"])})
            results.append(
                {
                    "id": str(r["_id"]),
                    "from_user_id": r["from_user_id"],
                    "to_user_id": r["to_user_id"],
                    "to_username": to_user["username"] if to_user else None,
                    "to_display_name": to_user["display_name"] if to_user else None,
                    "message": r.get("message"),
                    "status": r["status"],
                    "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
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
        # Optionally remove reverse; keep simple one-way remove for now

    @staticmethod
    async def block_user(blocker_id: str, blocked_user_id: str) -> None:
        db = get_database()
        if blocker_id == blocked_user_id:
            raise ValidationError("Cannot block yourself")
        if not ObjectId.is_valid(blocked_user_id):
            raise ValidationError("Invalid user id")
        target = await db.users.find_one({"_id": ObjectId(blocked_user_id)})
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
        # Remove from contacts both ways
        await db.contacts.delete_many(
            {
                "$or": [
                    {"owner_user_id": blocker_id, "contact_user_id": blocked_user_id},
                    {"owner_user_id": blocked_user_id, "contact_user_id": blocker_id},
                ]
            }
        )
        # Cancel pending requests
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
