"""Status (stories) service."""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from bson import ObjectId
from app.core.database import get_database
from app.core.exceptions import (
    NotFoundError,
    ForbiddenError,
    ValidationError,
)
from app.models.status import StatusType, StatusVisibility
from app.models.contact import ContactStatus
import logging

logger = logging.getLogger(__name__)


class StatusService:
    @staticmethod
    async def create_status(
        owner_id: str,
        content: Optional[str] = None,
        status_type: str = "text",
        media_attachments: Optional[List[Dict]] = None,
        visibility: str = "contacts",
        selected_viewer_ids: Optional[List[str]] = None,
        expires_in_hours: int = 24,
    ) -> dict:
        try:
            st = StatusType(status_type)
        except ValueError:
            raise ValidationError(f"Invalid status_type: {status_type}")
        try:
            vis = StatusVisibility(visibility)
        except ValueError:
            raise ValidationError(f"Invalid visibility: {visibility}")

        if st == StatusType.TEXT and not content:
            raise ValidationError("Text status requires content")

        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=min(max(expires_in_hours, 1), 168))
        doc = {
            "owner_user_id": owner_id,
            "content": content,
            "media_attachments": media_attachments or [],
            "visibility": vis.value,
            "selected_viewer_ids": selected_viewer_ids or [],
            "created_at": now,
            "expires_at": expires,
            "status_type": st.value,
        }
        db = get_database()
        result = await db.statuses.insert_one(doc)
        doc["_id"] = result.inserted_id

        await db.user_activity_logs.insert_one(
            {
                "user_id": owner_id,
                "event_type": "status",
                "action": "created",
                "resource_type": "status",
                "resource_id": str(result.inserted_id),
                "timestamp": now,
                "metadata": {},
            }
        )
        return StatusService._serialize(doc)

    @staticmethod
    async def get_feed(viewer_id: str) -> List[dict]:
        """Statuses from contacts that are still valid and visible to viewer."""
        db = get_database()
        now = datetime.now(timezone.utc)

        # Contact user ids
        contact_ids = []
        async for c in db.contacts.find(
            {
                "owner_user_id": viewer_id,
                "contact_status": ContactStatus.ACCEPTED.value,
            }
        ):
            contact_ids.append(c["contact_user_id"])

        # Own statuses + contacts
        owner_filter = {"$in": contact_ids + [viewer_id]}
        # Oldest first so viewers play statuses chronologically (like WhatsApp)
        cursor = db.statuses.find(
            {
                "owner_user_id": owner_filter,
                "expires_at": {"$gt": now},
            }
        ).sort("created_at", 1)

        results = []
        async for s in cursor:
            if await StatusService._can_view(s, viewer_id, contact_ids):
                results.append(await StatusService._with_viewers(s))
        return results

    @staticmethod
    async def get_user_statuses(owner_id: str, viewer_id: str) -> List[dict]:
        db = get_database()
        now = datetime.now(timezone.utc)
        contact_ids = []
        async for c in db.contacts.find(
            {
                "owner_user_id": viewer_id,
                "contact_status": ContactStatus.ACCEPTED.value,
            }
        ):
            contact_ids.append(c["contact_user_id"])

        cursor = db.statuses.find(
            {"owner_user_id": owner_id, "expires_at": {"$gt": now}}
        ).sort("created_at", 1)
        results = []
        async for s in cursor:
            if await StatusService._can_view(s, viewer_id, contact_ids):
                results.append(await StatusService._with_viewers(s))
        return results

    @staticmethod
    async def view_status(status_id: str, viewer_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        now = datetime.now(timezone.utc)
        if s["expires_at"].replace(tzinfo=timezone.utc) < now:
            raise NotFoundError("Status expired")

        contact_ids = []
        async for c in db.contacts.find(
            {
                "owner_user_id": viewer_id,
                "contact_status": ContactStatus.ACCEPTED.value,
            }
        ):
            contact_ids.append(c["contact_user_id"])

        if not await StatusService._can_view(s, viewer_id, contact_ids):
            raise ForbiddenError("Not allowed to view this status")

        # Record view (not for own)
        if s["owner_user_id"] != viewer_id:
            await db.status_views.update_one(
                {"status_id": status_id, "viewer_id": viewer_id},
                {
                    "$setOnInsert": {
                        "status_id": status_id,
                        "viewer_id": viewer_id,
                        "viewed_at": now,
                    }
                },
                upsert=True,
            )
        data = StatusService._serialize(s)
        viewer_ids = []
        async for v in db.status_views.find({"status_id": status_id}):
            viewer_ids.append(v["viewer_id"])
        data["viewer_ids"] = viewer_ids
        data["view_count"] = len(viewer_ids)
        return data

    @staticmethod
    async def delete_status(status_id: str, user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        if s["owner_user_id"] != user_id:
            raise ForbiddenError("Can only delete your own status")
        await db.statuses.delete_one({"_id": ObjectId(status_id)})
        await db.status_views.delete_many({"status_id": status_id})

    @staticmethod
    async def list_viewers(status_id: str, owner_id: str) -> List[dict]:
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        if s["owner_user_id"] != owner_id:
            raise ForbiddenError("Only owner can see viewers")
        results = []
        async for v in db.status_views.find({"status_id": status_id}):
            u = await db.users.find_one({"_id": ObjectId(v["viewer_id"])})
            if u:
                results.append(
                    {
                        "viewer_id": v["viewer_id"],
                        "username": u["username"],
                        "display_name": u["display_name"],
                        "profile_photo": u.get("profile_photo"),
                        "viewed_at": v["viewed_at"].isoformat()
                        if v.get("viewed_at")
                        else None,
                    }
                )
        return results


    @staticmethod
    async def _with_viewers(s: dict) -> dict:
        db = get_database()
        data = StatusService._serialize(s)
        sid = str(s["_id"])
        viewer_ids = []
        async for v in db.status_views.find({"status_id": sid}):
            viewer_ids.append(v["viewer_id"])
        data["viewer_ids"] = viewer_ids
        data["view_count"] = len(viewer_ids)
        u = None
        if ObjectId.is_valid(s.get("owner_user_id", "")):
            u = await db.users.find_one({"_id": ObjectId(s["owner_user_id"])})
        if u:
            data["owner"] = {
                "id": s["owner_user_id"],
                "username": u.get("username"),
                "display_name": u.get("display_name"),
                "profile_photo": u.get("profile_photo"),
            }
        return data

    @staticmethod
    async def _can_view(
        status: dict, viewer_id: str, viewer_contact_ids: List[str]
    ) -> bool:
        owner = status["owner_user_id"]
        if owner == viewer_id:
            return True
        vis = status.get("visibility", StatusVisibility.CONTACTS.value)
        if vis == StatusVisibility.EVERYONE.value:
            return True
        if vis == StatusVisibility.CONTACTS.value:
            return owner in viewer_contact_ids
        if vis == StatusVisibility.SELECTED.value:
            return viewer_id in (status.get("selected_viewer_ids") or [])
        if vis == StatusVisibility.CLOSE_FRIENDS.value:
            # Treat close_friends as contacts for now
            return owner in viewer_contact_ids
        return False

    @staticmethod
    def _serialize(s: dict) -> dict:
        return {
            "id": str(s["_id"]),
            "owner_user_id": s["owner_user_id"],
            "content": s.get("content"),
            "media_attachments": s.get("media_attachments") or [],
            "visibility": s.get("visibility"),
            "status_type": s.get("status_type"),
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
            "expires_at": s["expires_at"].isoformat() if s.get("expires_at") else None,
        }
