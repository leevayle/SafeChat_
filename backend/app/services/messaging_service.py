"""Conversation and messaging service."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from bson import ObjectId
from app.core.database import get_database
from app.core.exceptions import (
    NotFoundError,
    ForbiddenError,
    ConflictError,
    ValidationError,
)
from app.models.messaging import ConversationType, MessageType, DeliveryStatus
from app.core.security import generate_idempotency_key
import logging

logger = logging.getLogger(__name__)

def _utc_iso(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v if v.endswith("Z") or "+" in v[10:] else (v + "Z" if "T" in v else v)
    if getattr(v, "tzinfo", None) is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"



class MessagingService:
    @staticmethod
    async def get_or_create_private_conversation(
        user_id: str, other_username: str
    ) -> dict:
        db = get_database()
        other = await db.users.find_one({"username": other_username.lower().strip()})
        if not other:
            raise NotFoundError("User not found")
        other_id = str(other["_id"])
        if other_id == user_id:
            raise ValidationError("Cannot create conversation with yourself")

        # Check block either direction
        blocked = await db.blocked_users.find_one(
            {
                "$or": [
                    {"blocker_id": user_id, "blocked_id": other_id},
                    {"blocker_id": other_id, "blocked_id": user_id},
                ]
            }
        )
        if blocked:
            raise ForbiddenError("Cannot message this user")

        participants = sorted([user_id, other_id])
        existing = await db.conversations.find_one(
            {
                "conversation_type": ConversationType.PRIVATE.value,
                "participant_ids": participants,
            }
        )
        if existing:
            return await MessagingService._serialize_conversation(existing, user_id)

        now = datetime.now(timezone.utc)
        doc = {
            "conversation_type": ConversationType.PRIVATE.value,
            "participant_ids": participants,
            "group_id": None,
            "created_at": now,
            "updated_at": now,
            "last_message_at": None,
            "last_message_id": None,
            "conversation_settings": {},
        }
        result = await db.conversations.insert_one(doc)
        doc["_id"] = result.inserted_id
        return await MessagingService._serialize_conversation(doc, user_id)

    @staticmethod
    async def list_conversations(
        user_id: str,
        limit: int = 50,
        cursor: Optional[str] = None,
        lean: bool = False,
    ) -> dict:
        """List conversations. lean=True omits profile photos for a fast first paint."""
        db = get_database()
        query: Dict[str, Any] = {"participant_ids": user_id}
        if cursor and ObjectId.is_valid(cursor):
            pass  # simple limit for now

        cursor_q = (
            db.conversations.find(query)
            .sort([("last_message_at", -1), ("updated_at", -1)])
            .limit(min(limit, 100))
        )
        items = []
        async for conv in cursor_q:
            items.append(
                await MessagingService._serialize_conversation(conv, user_id, lean=lean)
            )
        return {"conversations": items, "next_cursor": None}

    @staticmethod
    async def get_conversation(conversation_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(conversation_id):
            raise ValidationError("Invalid conversation id")
        conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
        if not conv:
            raise NotFoundError("Conversation not found")
        if user_id not in conv.get("participant_ids", []):
            raise ForbiddenError("Not a participant")
        return await MessagingService._serialize_conversation(conv, user_id)

    @staticmethod
    async def send_message(
        conversation_id: str,
        sender_id: str,
        content: Optional[str] = None,
        message_type: str = "text",
        reply_to_message_id: Optional[str] = None,
        media_attachments: Optional[List[Dict]] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        db = get_database()
        if not ObjectId.is_valid(conversation_id):
            raise ValidationError("Invalid conversation id")
        conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
        if not conv:
            raise NotFoundError("Conversation not found")
        if sender_id not in conv.get("participant_ids", []):
            raise ForbiddenError("Not a participant")

        # Idempotency
        if idempotency_key:
            existing = await db.messages.find_one({"idempotency_key": idempotency_key})
            if existing:
                return await MessagingService._serialize_message(existing)

        try:
            mt = MessageType(message_type)
        except ValueError:
            raise ValidationError(f"Invalid message_type: {message_type}")

        if mt == MessageType.TEXT and not content:
            raise ValidationError("Text messages require content")

        reply_to_text = None
        if reply_to_message_id:
            if not ObjectId.is_valid(reply_to_message_id):
                raise ValidationError("Invalid reply_to_message_id")
            reply = await db.messages.find_one(
                {"_id": ObjectId(reply_to_message_id), "conversation_id": conversation_id}
            )
            if not reply:
                raise NotFoundError("Reply target message not found")
            # Snapshot preview so both sides can render without a second fetch
            if reply.get("deleted_at"):
                reply_to_text = "Original message"
            else:
                body = (reply.get("content") or "").strip()
                if body:
                    # Strip status-reply encoding markers for preview
                    if body.startswith("⟦status⟧"):
                        import re
                        m = re.match(r"⟦status⟧(.*?)⟦t⟧(.*?)⟦/⟧(.*)", body, re.DOTALL)
                        body = (m.group(3) if m else body) or "Status"
                    reply_to_text = body[:180]
                elif reply.get("media_attachments"):
                    reply_to_text = "📷 Photo"
                else:
                    reply_to_text = "Message"

        now = datetime.now(timezone.utc)
        msg = {
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "message_type": mt.value,
            "content": content,
            "media_attachments": media_attachments or [],
            "reply_to_message_id": reply_to_message_id,
            "reply_to_text": reply_to_text,
            "forwarded_from": None,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
            "delivery_status": DeliveryStatus.SENT.value,
            "idempotency_key": idempotency_key or generate_idempotency_key(),
            "edited": False,
        }
        result = await db.messages.insert_one(msg)
        msg_id = str(result.inserted_id)
        msg["_id"] = result.inserted_id

        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {
                "$set": {
                    "last_message_at": now,
                    "last_message_id": msg_id,
                    "updated_at": now,
                }
            },
        )

        # Receipts for other participants
        for pid in conv["participant_ids"]:
            if pid != sender_id:
                await db.message_receipts.update_one(
                    {"message_id": msg_id, "user_id": pid},
                    {
                        "$setOnInsert": {
                            "message_id": msg_id,
                            "user_id": pid,
                            "conversation_id": conversation_id,
                            "delivered_at": None,
                            "read_at": None,
                            "created_at": now,
                        }
                    },
                    upsert=True,
                )

        await db.user_activity_logs.insert_one(
            {
                "user_id": sender_id,
                "event_type": "message",
                "action": "sent",
                "resource_type": "message",
                "resource_id": msg_id,
                "timestamp": now,
                "metadata": {"conversation_id": conversation_id},
            }
        )
        serialized = await MessagingService._serialize_message(msg)
        # Live push to other participants (minimal packet)
        try:
            from app.websocket.manager import manager, packet_msg
            await manager.send_users(
                list(conv.get("participant_ids") or []),
                packet_msg(conversation_id, serialized),
                exclude=sender_id,
            )
        except Exception:
            logger.debug("ws fan-out failed for msg %s", msg_id, exc_info=True)
        return serialized

    @staticmethod
    async def get_messages(
        conversation_id: str,
        user_id: str,
        limit: int = 50,
        before_id: Optional[str] = None,
    ) -> dict:
        db = get_database()
        if not ObjectId.is_valid(conversation_id):
            raise ValidationError("Invalid conversation id")
        conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
        if not conv:
            raise NotFoundError("Conversation not found")
        if user_id not in conv.get("participant_ids", []):
            raise ForbiddenError("Not a participant")

        query: Dict[str, Any] = {
            "conversation_id": conversation_id,
            # Soft-deleted messages stay in history as placeholders
        }
        if before_id and ObjectId.is_valid(before_id):
            query["_id"] = {"$lt": ObjectId(before_id)}

        cursor = (
            db.messages.find(query)
            .sort("created_at", -1)
            .limit(min(limit, 100))
        )
        messages = []
        now = datetime.now(timezone.utc)
        async for m in cursor:
            mid = str(m["_id"])
            # Opening the thread = delivered for the other party's messages
            if m.get("sender_id") != user_id:
                await db.message_receipts.update_one(
                    {"message_id": mid, "user_id": user_id},
                    {
                        "$set": {"delivered_at": now},
                        "$setOnInsert": {
                            "message_id": mid,
                            "user_id": user_id,
                            "conversation_id": conversation_id,
                            "read_at": None,
                            "created_at": now,
                        },
                    },
                    upsert=True,
                )
            messages.append(await MessagingService._serialize_message(m, viewer_id=user_id))
        messages.reverse()  # chronological
        next_cursor = messages[0]["id"] if messages and len(messages) == limit else None
        return {"messages": messages, "next_cursor": next_cursor}

    @staticmethod
    async def edit_message(message_id: str, user_id: str, content: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(message_id):
            raise ValidationError("Invalid message id")
        msg = await db.messages.find_one({"_id": ObjectId(message_id)})
        if not msg or msg.get("deleted_at"):
            raise NotFoundError("Message not found")
        if msg["sender_id"] != user_id:
            raise ForbiddenError("Can only edit your own messages")
        if msg["message_type"] != MessageType.TEXT.value:
            raise ValidationError("Only text messages can be edited")

        now = datetime.now(timezone.utc)
        await db.messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"content": content, "updated_at": now, "edited": True}},
        )
        msg["content"] = content
        msg["updated_at"] = now
        msg["edited"] = True
        serialized = await MessagingService._serialize_message(msg)
        # Fan-out edit so recipients update in place
        try:
            from app.websocket.manager import manager, packet_edit
            conv_id = str(msg["conversation_id"])
            payload = packet_edit(conv_id, str(msg["_id"]), content, user_id)
            for pid in (await db.conversations.find_one({"_id": ObjectId(conv_id)}) or {}).get("participant_ids", []):
                if str(pid) != str(user_id):
                    await manager.send_user(str(pid), payload)
        except Exception:
            pass
        return serialized

    @staticmethod
    async def delete_message(message_id: str, user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(message_id):
            raise ValidationError("Invalid message id")
        msg = await db.messages.find_one({"_id": ObjectId(message_id)})
        if not msg or msg.get("deleted_at"):
            raise NotFoundError("Message not found")
        if msg["sender_id"] != user_id:
            raise ForbiddenError("Can only delete your own messages")

        now = datetime.now(timezone.utc)
        await db.messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"deleted_at": now, "content": None, "updated_at": now}},
        )

    @staticmethod
    async def mark_delivered(message_id: str, user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(message_id):
            raise ValidationError("Invalid message id")
        now = datetime.now(timezone.utc)
        await db.message_receipts.update_one(
            {"message_id": message_id, "user_id": user_id},
            {"$set": {"delivered_at": now}},
            upsert=True,
        )
        # Promote aggregate status if not already read
        msg = await db.messages.find_one({"_id": ObjectId(message_id)})
        if not msg:
            return
        current = msg.get("delivery_status")
        if current != DeliveryStatus.READ.value:
            await db.messages.update_one(
                {"_id": ObjectId(message_id)},
                {"$set": {"delivery_status": DeliveryStatus.DELIVERED.value, "updated_at": now}},
            )
        # Notify sender only
        try:
            from app.websocket.manager import manager, packet_rcpt
            sender_id = msg.get("sender_id")
            conv_id = msg.get("conversation_id")
            if sender_id and sender_id != user_id and conv_id:
                await manager.send_user(
                    sender_id,
                    packet_rcpt(conv_id, message_id, DeliveryStatus.DELIVERED.value),
                )
        except Exception:
            logger.debug("ws delivered notify failed for %s", message_id, exc_info=True)

    @staticmethod
    async def mark_read(conversation_id: str, user_id: str, up_to_message_id: Optional[str] = None) -> int:
        db = get_database()
        if not ObjectId.is_valid(conversation_id):
            raise ValidationError("Invalid conversation id")
        conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
        if not conv or user_id not in conv.get("participant_ids", []):
            raise ForbiddenError("Not a participant")

        now = datetime.now(timezone.utc)
        query: Dict[str, Any] = {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "read_at": None,
        }
        if up_to_message_id and ObjectId.is_valid(up_to_message_id):
            # mark all up to that message (by creation order is complex; mark all for simplicity)
            pass
        result = await db.message_receipts.update_many(
            query, {"$set": {"read_at": now, "delivered_at": now}}
        )
        # Flip message.delivery_status so sender ticks update on poll
        if result.modified_count or result.matched_count:
            msg_ids = []
            async for r in db.message_receipts.find(
                {"conversation_id": conversation_id, "user_id": user_id, "read_at": {"$ne": None}}
            ):
                msg_ids.append(r["message_id"])
            if msg_ids:
                oids = [ObjectId(i) for i in msg_ids if ObjectId.is_valid(i)]
                if oids:
                    await db.messages.update_many(
                        {"_id": {"$in": oids}, "sender_id": {"$ne": user_id}},
                        {"$set": {"delivery_status": DeliveryStatus.READ.value}},
                    )
                    # Live receipt packets to each distinct sender
                    try:
                        from app.websocket.manager import manager, packet_rcpt
                        async for m in db.messages.find(
                            {"_id": {"$in": oids}, "sender_id": {"$ne": user_id}},
                            {"sender_id": 1, "conversation_id": 1},
                        ):
                            sid = m.get("sender_id")
                            cid = m.get("conversation_id") or conversation_id
                            mid = str(m["_id"])
                            if sid:
                                await manager.send_user(
                                    sid,
                                    packet_rcpt(cid, mid, DeliveryStatus.READ.value),
                                )
                    except Exception:
                        logger.debug("ws read notify failed", exc_info=True)
        return result.modified_count

    @staticmethod
    async def forward_message(
        message_id: str,
        user_id: str,
        to_conversation_id: str,
    ) -> dict:
        """Copy a message into another conversation the user belongs to."""
        db = get_database()
        if not ObjectId.is_valid(message_id) or not ObjectId.is_valid(to_conversation_id):
            raise ValidationError("Invalid id")
        src = await db.messages.find_one({"_id": ObjectId(message_id), "deleted_at": None})
        if not src:
            raise NotFoundError("Message not found")
        src_conv = await db.conversations.find_one({"_id": ObjectId(src["conversation_id"])})
        if not src_conv or user_id not in src_conv.get("participant_ids", []):
            raise ForbiddenError("Not a participant")
        dest = await db.conversations.find_one({"_id": ObjectId(to_conversation_id)})
        if not dest or user_id not in dest.get("participant_ids", []):
            raise ForbiddenError("Not a participant of destination")

        now = datetime.now(timezone.utc)
        msg = {
            "conversation_id": to_conversation_id,
            "sender_id": user_id,
            "message_type": src.get("message_type") or "text",
            "content": src.get("content"),
            "media_attachments": src.get("media_attachments") or [],
            "reply_to_message_id": None,
            "forwarded_from": {
                "message_id": message_id,
                "conversation_id": src["conversation_id"],
                "sender_id": src.get("sender_id"),
            },
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
            "delivery_status": DeliveryStatus.SENT.value,
            "edited": False,
            "idempotency_key": None,
        }
        result = await db.messages.insert_one(msg)
        msg_id = str(result.inserted_id)
        await db.conversations.update_one(
            {"_id": ObjectId(to_conversation_id)},
            {
                "$set": {
                    "last_message_id": msg_id,
                    "last_message_at": now,
                    "updated_at": now,
                }
            },
        )
        for pid in dest["participant_ids"]:
            if pid != user_id:
                await db.message_receipts.update_one(
                    {"message_id": msg_id, "user_id": pid},
                    {
                        "$setOnInsert": {
                            "message_id": msg_id,
                            "user_id": pid,
                            "conversation_id": to_conversation_id,
                            "delivered_at": None,
                            "read_at": None,
                            "created_at": now,
                        }
                    },
                    upsert=True,
                )
        msg["_id"] = result.inserted_id
        return await MessagingService._serialize_message(msg, viewer_id=user_id)

    @staticmethod
    async def react_to_message(message_id: str, user_id: str, emoji: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(message_id):
            raise ValidationError("Invalid message id")
        msg = await db.messages.find_one({"_id": ObjectId(message_id), "deleted_at": None})
        if not msg:
            raise NotFoundError("Message not found")
        conv = await db.conversations.find_one({"_id": ObjectId(msg["conversation_id"])})
        if not conv or user_id not in conv.get("participant_ids", []):
            raise ForbiddenError("Not a participant")

        now = datetime.now(timezone.utc)
        # One reaction per user: remove previous then set new
        await db.message_reactions.delete_many({"message_id": message_id, "user_id": user_id})
        await db.message_reactions.insert_one(
            {
                "message_id": message_id,
                "user_id": user_id,
                "emoji": emoji,
                "created_at": now,
            }
        )
        try:
            from app.websocket.manager import manager, packet_react
            conv_id = str(msg["conversation_id"])
            payload = packet_react(conv_id, message_id, emoji, user_id, removed=False)
            for pid in (conv or {}).get("participant_ids", []):
                await manager.send_user(str(pid), payload)
        except Exception:
            pass
        return {"message_id": message_id, "emoji": emoji, "user_id": user_id}

    @staticmethod
    async def remove_reaction(message_id: str, user_id: str, emoji: str) -> None:
        db = get_database()
        msg = await db.messages.find_one({"_id": ObjectId(message_id)}) if ObjectId.is_valid(message_id) else None
        await db.message_reactions.delete_one(
            {"message_id": message_id, "user_id": user_id, "emoji": emoji}
        )
        if msg:
            try:
                from app.websocket.manager import manager, packet_react
                conv_id = str(msg["conversation_id"])
                payload = packet_react(conv_id, message_id, emoji, user_id, removed=True)
                conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
                for pid in (conv or {}).get("participant_ids", []):
                    await manager.send_user(str(pid), payload)
            except Exception:
                pass

    @staticmethod
    async def _serialize_message(msg: dict, viewer_id: Optional[str] = None) -> dict:
        db = get_database()
        sender = await db.users.find_one({"_id": ObjectId(msg["sender_id"])}) if msg.get("sender_id") and ObjectId.is_valid(msg["sender_id"]) else None
        msg_id = str(msg["_id"])
        status = msg.get("delivery_status", DeliveryStatus.SENT.value)

        # Derive status from receipts so the sender sees delivered/read ticks
        if viewer_id and msg.get("sender_id") == viewer_id:
            receipts = []
            async for r in db.message_receipts.find({"message_id": msg_id}):
                receipts.append(r)
            if receipts:
                if any(r.get("read_at") for r in receipts):
                    status = DeliveryStatus.READ.value
                elif any(r.get("delivered_at") for r in receipts):
                    status = DeliveryStatus.DELIVERED.value
                else:
                    status = DeliveryStatus.SENT.value
            # Keep message document roughly in sync for list previews
            if status != msg.get("delivery_status"):
                await db.messages.update_one(
                    {"_id": msg["_id"]},
                    {"$set": {"delivery_status": status}},
                )

        return {
            "id": msg_id,
            "conversation_id": msg["conversation_id"],
            "sender_id": msg["sender_id"],
            "sender_username": sender["username"] if sender else None,
            "sender_display_name": sender["display_name"] if sender else None,
            "message_type": msg["message_type"],
            "content": None if msg.get("deleted_at") else msg.get("content"),
            "media_attachments": [] if msg.get("deleted_at") else (msg.get("media_attachments") or []),
            "reply_to_message_id": msg.get("reply_to_message_id"),
            "reply_to_text": msg.get("reply_to_text"),
            "forwarded_from": msg.get("forwarded_from"),
            "created_at": _utc_iso(msg.get("created_at")),
            "updated_at": msg["updated_at"].isoformat() if msg.get("updated_at") else None,
            "deleted_at": msg["deleted_at"].isoformat() if msg.get("deleted_at") else None,
            "deleted": bool(msg.get("deleted_at")),
            "delivery_status": status,
            "edited": msg.get("edited", False),
            "reactions": msg.get("_reactions") or [],
        }

    @staticmethod
    async def _serialize_conversation(
        conv: dict, viewer_id: str, lean: bool = False
    ) -> dict:
        db = get_database()
        participants = []
        # lean: only id + display_name (no photo bytes / heavy fields) for first paint
        user_projection = (
            {"username": 1, "display_name": 1}
            if lean
            else {"username": 1, "display_name": 1, "profile_photo": 1}
        )
        for pid in conv.get("participant_ids", []):
            if not ObjectId.is_valid(pid):
                continue
            u = await db.users.find_one({"_id": ObjectId(pid)}, user_projection)
            if u:
                participants.append(
                    {
                        "id": str(u["_id"]),
                        "username": u["username"],
                        "display_name": u["display_name"],
                        "profile_photo": None if lean else u.get("profile_photo"),
                    }
                )

        last_message = None
        if conv.get("last_message_id") and ObjectId.is_valid(conv["last_message_id"]):
            m = await db.messages.find_one({"_id": ObjectId(conv["last_message_id"])})
            if m and not m.get("deleted_at"):
                lm_status = m.get("delivery_status", DeliveryStatus.SENT.value)
                if m.get("sender_id") == viewer_id:
                    mid = str(m["_id"])
                    receipts = [r async for r in db.message_receipts.find({"message_id": mid})]
                    if any(r.get("read_at") for r in receipts):
                        lm_status = DeliveryStatus.READ.value
                    elif any(r.get("delivered_at") for r in receipts):
                        lm_status = DeliveryStatus.DELIVERED.value
                last_message = {
                    "id": str(m["_id"]),
                    "content": m.get("content"),
                    "message_type": m.get("message_type"),
                    "sender_id": m.get("sender_id"),
                    "created_at": m["created_at"].isoformat() if m.get("created_at") else None,
                    "delivery_status": lm_status,
                }

        # Unread count
        unread = await db.message_receipts.count_documents(
            {
                "conversation_id": str(conv["_id"]),
                "user_id": viewer_id,
                "read_at": None,
            }
        )

        settings = conv.get("conversation_settings") or {}
        user_settings = settings.get(viewer_id, {})

        return {
            "id": str(conv["_id"]),
            "conversation_type": conv["conversation_type"],
            "participant_ids": conv.get("participant_ids", []),
            "participants": participants,
            "group_id": conv.get("group_id"),
            "last_message": last_message,
            "last_message_at": conv["last_message_at"].isoformat()
            if conv.get("last_message_at")
            else None,
            "unread_count": unread,
            "created_at": conv["created_at"].isoformat() if conv.get("created_at") else None,
            "settings": user_settings,
        }
