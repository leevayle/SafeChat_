"""Group management service."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from bson import ObjectId
from app.core.database import get_database
from app.core.exceptions import (
    NotFoundError,
    ForbiddenError,
    ValidationError,
    ConflictError,
)
from app.models.messaging import ConversationType
import logging

logger = logging.getLogger(__name__)


class GroupService:
    @staticmethod
    async def create_group(
        creator_id: str,
        group_name: str,
        group_description: Optional[str] = None,
        member_usernames: Optional[List[str]] = None,
    ) -> dict:
        db = get_database()
        member_ids = [creator_id]
        if member_usernames:
            unames = [u.lower().strip() for u in member_usernames if u]
            if unames:
                async for u in db.users.find({"username": {"$in": unames}}, {"_id": 1}):
                    uid = str(u["_id"])
                    if uid not in member_ids:
                        member_ids.append(uid)

        now = datetime.now(timezone.utc)
        group_doc = {
            "group_name": group_name,
            "group_description": group_description,
            "group_photo": None,
            "creator_id": creator_id,
            "admin_ids": [creator_id],
            "member_ids": member_ids,
            "group_permissions": {
                "only_admins_can_post": False,
                "only_admins_can_add_members": False,
                "only_admins_can_edit_info": True,
            },
            "created_at": now,
            "updated_at": now,
        }
        result = await db.groups.insert_one(group_doc)
        group_id = str(result.inserted_id)

        # Create linked group conversation
        conv = {
            "conversation_type": ConversationType.GROUP.value,
            "participant_ids": member_ids,
            "group_id": group_id,
            "created_at": now,
            "updated_at": now,
            "last_message_at": None,
            "last_message_id": None,
            "conversation_settings": {},
        }
        conv_result = await db.conversations.insert_one(conv)

        await db.user_activity_logs.insert_one(
            {
                "user_id": creator_id,
                "event_type": "group",
                "action": "created",
                "resource_type": "group",
                "resource_id": group_id,
                "timestamp": now,
                "metadata": {"member_count": len(member_ids)},
            }
        )

        return {
            "id": group_id,
            "group_name": group_name,
            "group_description": group_description,
            "creator_id": creator_id,
            "admin_ids": [creator_id],
            "member_ids": member_ids,
            "conversation_id": str(conv_result.inserted_id),
            "created_at": now.isoformat(),
        }

    @staticmethod
    async def get_group(group_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        if user_id not in group.get("member_ids", []):
            raise ForbiddenError("Not a member")
        return await GroupService._serialize(group)

    @staticmethod
    async def list_my_groups(user_id: str) -> List[dict]:
        db = get_database()
        cursor = db.groups.find({"member_ids": user_id}).sort("updated_at", -1)
        results = []
        async for g in cursor:
            results.append(await GroupService._serialize(g))
        return results

    @staticmethod
    async def update_group(
        group_id: str, user_id: str, updates: Dict[str, Any]
    ) -> dict:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        if user_id not in group.get("admin_ids", []):
            raise ForbiddenError("Only admins can update group")
        if not updates:
            return await GroupService._serialize(group)

        updates["updated_at"] = datetime.now(timezone.utc)
        await db.groups.update_one({"_id": ObjectId(group_id)}, {"$set": updates})
        group.update(updates)
        return await GroupService._serialize(group)

    @staticmethod
    async def add_members(group_id: str, actor_id: str, usernames: List[str]) -> dict:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        perms = group.get("group_permissions") or {}
        if perms.get("only_admins_can_add_members") and actor_id not in group.get(
            "admin_ids", []
        ):
            raise ForbiddenError("Only admins can add members")
        if actor_id not in group.get("member_ids", []):
            raise ForbiddenError("Not a member")

        new_ids = []
        unames = [u.lower().strip() for u in usernames if u]
        if unames:
            async for u in db.users.find({"username": {"$in": unames}}, {"_id": 1}):
                uid = str(u["_id"])
                if uid not in group["member_ids"] and uid not in new_ids:
                    new_ids.append(uid)

        if not new_ids:
            raise ValidationError("No new members to add")

        now = datetime.now(timezone.utc)
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$addToSet": {"member_ids": {"$each": new_ids}},
                "$set": {"updated_at": now},
            },
        )
        # Sync conversation participants
        conv = await db.conversations.find_one({"group_id": group_id})
        if conv:
            await db.conversations.update_one(
                {"_id": conv["_id"]},
                {
                    "$addToSet": {"participant_ids": {"$each": new_ids}},
                    "$set": {"updated_at": now},
                },
            )
        return {"added": new_ids}

    @staticmethod
    async def remove_member(group_id: str, actor_id: str, target_user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        if actor_id not in group.get("admin_ids", []) and actor_id != target_user_id:
            raise ForbiddenError("Only admins can remove members")
        if target_user_id == group["creator_id"] and actor_id != target_user_id:
            raise ForbiddenError("Cannot remove the group creator")
        if target_user_id not in group.get("member_ids", []):
            raise NotFoundError("User is not a member")

        now = datetime.now(timezone.utc)
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$pull": {
                    "member_ids": target_user_id,
                    "admin_ids": target_user_id,
                },
                "$set": {"updated_at": now},
            },
        )
        conv = await db.conversations.find_one({"group_id": group_id})
        if conv:
            await db.conversations.update_one(
                {"_id": conv["_id"]},
                {
                    "$pull": {"participant_ids": target_user_id},
                    "$set": {"updated_at": now},
                },
            )

    @staticmethod
    async def leave_group(group_id: str, user_id: str) -> None:
        await GroupService.remove_member(group_id, user_id, user_id)

    @staticmethod
    async def promote_admin(group_id: str, actor_id: str, target_user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        if actor_id not in group.get("admin_ids", []):
            raise ForbiddenError("Only admins can promote")
        if target_user_id not in group.get("member_ids", []):
            raise NotFoundError("User is not a member")
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$addToSet": {"admin_ids": target_user_id},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )

    @staticmethod
    async def demote_admin(group_id: str, actor_id: str, target_user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        if actor_id not in group.get("admin_ids", []):
            raise ForbiddenError("Only admins can demote")
        if target_user_id == group["creator_id"]:
            raise ForbiddenError("Cannot demote the creator")
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$pull": {"admin_ids": target_user_id},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )

    @staticmethod
    async def delete_group(group_id: str, user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(group_id):
            raise ValidationError("Invalid group id")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise NotFoundError("Group not found")
        if user_id != group["creator_id"] and user_id not in group.get("admin_ids", []):
            raise ForbiddenError("Only creator/admins can delete")
        await db.groups.delete_one({"_id": ObjectId(group_id)})
        await db.conversations.delete_many({"group_id": group_id})

    @staticmethod
    async def _serialize(group: dict) -> dict:
        return {
            "id": str(group["_id"]),
            "group_name": group["group_name"],
            "group_description": group.get("group_description"),
            "group_photo": group.get("group_photo"),
            "creator_id": group["creator_id"],
            "admin_ids": group.get("admin_ids", []),
            "member_ids": group.get("member_ids", []),
            "group_permissions": group.get("group_permissions", {}),
            "created_at": group["created_at"].isoformat()
            if group.get("created_at")
            else None,
            "updated_at": group["updated_at"].isoformat()
            if group.get("updated_at")
            else None,
        }
