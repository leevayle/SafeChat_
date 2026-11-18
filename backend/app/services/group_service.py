"""Group management service."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import secrets
import string
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

def _gen_invite_code(length: int = 10) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


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
        pending_ids: List[str] = []
        if member_usernames:
            unames = [u.lower().strip() for u in member_usernames if u]
            if unames:
                async for u in db.users.find({"username": {"$in": unames}}, {"_id": 1}):
                    uid = str(u["_id"])
                    if uid != creator_id and uid not in pending_ids:
                        pending_ids.append(uid)

        invite_code = _gen_invite_code()
        for _ in range(5):
            if not await db.groups.find_one({"invite_code": invite_code}, {"_id": 1}):
                break
            invite_code = _gen_invite_code()

        now = datetime.now(timezone.utc)
        group_doc = {
            "group_name": group_name,
            "group_description": group_description,
            "group_photo": None,
            "creator_id": creator_id,
            "admin_ids": [creator_id],
            "member_ids": member_ids,
            "pending_member_ids": pending_ids,
            "invite_code": invite_code,
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
        await db.conversations.insert_one(conv)

        for uid in pending_ids:
            await db.group_invites.insert_one({
                "group_id": group_id, "user_id": uid, "invited_by": creator_id,
                "status": "pending", "created_at": now, "updated_at": now,
            })

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

        group_doc["_id"] = result.inserted_id
        return await GroupService._serialize(group_doc)

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

        set_doc: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if "group_name" in updates and updates["group_name"] is not None:
            set_doc["group_name"] = updates["group_name"]
        if "group_description" in updates:
            set_doc["group_description"] = updates["group_description"]
        if "group_photo" in updates:
            set_doc["group_photo"] = updates["group_photo"]
        if "group_permissions" in updates and isinstance(updates["group_permissions"], dict):
            current = dict(group.get("group_permissions") or {})
            current.update(updates["group_permissions"])
            set_doc["group_permissions"] = current
        await db.groups.update_one({"_id": ObjectId(group_id)}, {"$set": set_doc})
        group.update(set_doc)
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

        member_ids = [str(m) for m in (group.get("member_ids") or [])]
        pending_ids = [str(m) for m in (group.get("pending_member_ids") or [])]
        new_ids = []
        unames = [u.lower().strip() for u in usernames if u]
        if unames:
            async for u in db.users.find({"username": {"$in": unames}}, {"_id": 1}):
                uid = str(u["_id"])
                if uid not in member_ids and uid not in pending_ids and uid not in new_ids:
                    new_ids.append(uid)
        if not new_ids:
            raise ValidationError("No new members to invite")
        now = datetime.now(timezone.utc)
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {"$addToSet": {"pending_member_ids": {"$each": new_ids}}, "$set": {"updated_at": now}},
        )
        invited = []
        for uid in new_ids:
            existing = await db.group_invites.find_one({"group_id": group_id, "user_id": uid, "status": "pending"})
            if existing:
                invite_id = str(existing["_id"])
            else:
                ins = await db.group_invites.insert_one({"group_id": group_id, "user_id": uid, "invited_by": actor_id, "status": "pending", "created_at": now, "updated_at": now})
                invite_id = str(ins.inserted_id)
            invited.append({"user_id": uid, "invite_id": invite_id})
        return {"invited": invited, "added": []}

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
    async def list_my_invites(user_id: str) -> List[dict]:
        db = get_database()
        out = []
        async for inv in db.group_invites.find({"user_id": user_id, "status": "pending"}).sort("created_at", -1):
            gid = str(inv.get("group_id") or "")
            if not ObjectId.is_valid(gid):
                continue
            group = await db.groups.find_one({"_id": ObjectId(gid)})
            if not group:
                continue
            inviter = None
            iid = str(inv.get("invited_by") or "")
            if ObjectId.is_valid(iid):
                inviter = await db.users.find_one({"_id": ObjectId(iid)}, {"username": 1, "display_name": 1, "profile_photo": 1})
            out.append({
                "id": str(inv["_id"]), "group_id": gid,
                "group_name": group.get("group_name"), "group_photo": group.get("group_photo"),
                "group_description": group.get("group_description"), "invite_code": group.get("invite_code"),
                "invited_by": {"id": iid, "username": (inviter or {}).get("username") or "", "display_name": (inviter or {}).get("display_name") or (inviter or {}).get("username") or "", "profile_photo": (inviter or {}).get("profile_photo")} if inviter else {"id": iid},
                "created_at": inv["created_at"].isoformat() if inv.get("created_at") else None, "status": inv.get("status") or "pending",
            })
        return out

    @staticmethod
    async def accept_invite(invite_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(invite_id):
            raise ValidationError("Invalid invite id")
        inv = await db.group_invites.find_one({"_id": ObjectId(invite_id)})
        if not inv:
            raise NotFoundError("Invite not found")
        if str(inv.get("user_id")) != user_id:
            raise ForbiddenError("Not your invite")
        if inv.get("status") != "pending":
            raise ConflictError("Invite is no longer pending")
        group_id = str(inv.get("group_id"))
        now = datetime.now(timezone.utc)
        await db.groups.update_one({"_id": ObjectId(group_id)}, {"$addToSet": {"member_ids": user_id}, "$pull": {"pending_member_ids": user_id}, "$set": {"updated_at": now}})
        conv = await db.conversations.find_one({"group_id": group_id})
        if conv:
            await db.conversations.update_one({"_id": conv["_id"]}, {"$addToSet": {"participant_ids": user_id}, "$set": {"updated_at": now}})
        await db.group_invites.update_one({"_id": ObjectId(invite_id)}, {"$set": {"status": "accepted", "updated_at": now}})
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        return await GroupService._serialize(group)

    @staticmethod
    async def reject_invite(invite_id: str, user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(invite_id):
            raise ValidationError("Invalid invite id")
        inv = await db.group_invites.find_one({"_id": ObjectId(invite_id)})
        if not inv:
            raise NotFoundError("Invite not found")
        if str(inv.get("user_id")) != user_id:
            raise ForbiddenError("Not your invite")
        if inv.get("status") != "pending":
            raise ConflictError("Invite is no longer pending")
        group_id = str(inv.get("group_id"))
        now = datetime.now(timezone.utc)
        await db.group_invites.update_one({"_id": ObjectId(invite_id)}, {"$set": {"status": "rejected", "updated_at": now}})
        if ObjectId.is_valid(group_id):
            await db.groups.update_one({"_id": ObjectId(group_id)}, {"$pull": {"pending_member_ids": user_id}, "$set": {"updated_at": now}})

    @staticmethod
    async def join_by_code(user_id: str, code: str) -> dict:
        db = get_database()
        code = (code or "").strip().lower()
        if len(code) < 5:
            raise ValidationError("Invalid invite code")
        group = await db.groups.find_one({"invite_code": code})
        if not group:
            raise NotFoundError("Invite link not found")
        gid = str(group["_id"])
        if user_id in [str(m) for m in (group.get("member_ids") or [])]:
            return await GroupService._serialize(group)
        now = datetime.now(timezone.utc)
        await db.group_invites.update_many({"group_id": gid, "user_id": user_id, "status": "pending"}, {"$set": {"status": "accepted", "updated_at": now}})
        await db.groups.update_one({"_id": group["_id"]}, {"$addToSet": {"member_ids": user_id}, "$pull": {"pending_member_ids": user_id}, "$set": {"updated_at": now}})
        conv = await db.conversations.find_one({"group_id": gid})
        if conv:
            await db.conversations.update_one({"_id": conv["_id"]}, {"$addToSet": {"participant_ids": user_id}, "$set": {"updated_at": now}})
        group = await db.groups.find_one({"_id": group["_id"]})
        return await GroupService._serialize(group)

    @staticmethod
    async def _serialize(group: dict) -> dict:
        db = get_database()
        gid = str(group["_id"])
        if not group.get("invite_code"):
            code = _gen_invite_code()
            await db.groups.update_one({"_id": group["_id"]}, {"$set": {"invite_code": code}})
            group["invite_code"] = code
        conv = await db.conversations.find_one(
            {"group_id": gid},
            {"_id": 1, "last_message_at": 1, "last_message_id": 1},
        )
        last_message = None
        if conv and conv.get("last_message_id") and ObjectId.is_valid(
            str(conv.get("last_message_id"))
        ):
            m = await db.messages.find_one({"_id": ObjectId(str(conv["last_message_id"]))})
            if m and not m.get("deleted_at"):
                last_message = {
                    "id": str(m["_id"]),
                    "content": m.get("content"),
                    "sender_id": m.get("sender_id"),
                    "created_at": m["created_at"].isoformat()
                    if m.get("created_at")
                    else None,
                    "message_type": m.get("message_type"),
                }

        members = []
        admin_ids = [str(a) for a in (group.get("admin_ids") or [])]
        creator_id = str(group.get("creator_id") or "")
        for mid in group.get("member_ids") or []:
            mid_s = str(mid)
            if not ObjectId.is_valid(mid_s):
                continue
            u = await db.users.find_one(
                {"_id": ObjectId(mid_s)},
                {"username": 1, "display_name": 1, "profile_photo": 1},
            )
            if not u:
                continue
            uid = str(u["_id"])
            members.append(
                {
                    "id": uid,
                    "username": u.get("username") or "",
                    "display_name": u.get("display_name") or u.get("username") or "",
                    "profile_photo": u.get("profile_photo"),
                    "is_admin": uid in admin_ids or uid == creator_id,
                }
            )

        invite_code = group.get("invite_code") or ""
        pending_ids = [str(x) for x in (group.get("pending_member_ids") or [])]
        # Mark pending members in list if present as members already
        for m in members:
            if m["id"] in pending_ids:
                m["pending"] = True
                m["active"] = False
            else:
                m["pending"] = False
                m["active"] = True
        return {
            "id": gid,
            "group_name": group["group_name"],
            "group_description": group.get("group_description"),
            "group_photo": group.get("group_photo"),
            "creator_id": creator_id,
            "admin_ids": admin_ids,
            "member_ids": [str(m) for m in (group.get("member_ids") or [])],
            "pending_member_ids": pending_ids,
            "members": members,
            "conversation_id": str(conv["_id"]) if conv else None,
            "last_message": last_message,
            "last_message_at": conv["last_message_at"].isoformat()
            if conv and conv.get("last_message_at")
            else None,
            "invite_code": invite_code,
            "invite_link": f"safechat.app/join/{invite_code}" if invite_code else None,
            "group_permissions": group.get(
                "group_permissions",
                {
                    "only_admins_can_post": False,
                    "only_admins_can_add_members": False,
                    "only_admins_can_edit_info": True,
                },
            ),
            "created_at": group["created_at"].isoformat()
            if group.get("created_at")
            else None,
            "updated_at": group["updated_at"].isoformat()
            if group.get("updated_at")
            else None,
        }
