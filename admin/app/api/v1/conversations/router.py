"""Conversation list and private chat creation."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.api.deps import get_current_user
from app.schemas.messaging import CreatePrivateConversationRequest
from app.services.messaging_service import MessagingService
from app.core.exceptions import success_response
from app.core.database import get_database

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("")
async def list_conversations(
    limit: int = Query(50, ge=1, le=100),
    cursor: Optional[str] = None,
    lean: bool = Query(False, description="Skip profile photos for fast first paint"),
    user: dict = Depends(get_current_user),
):
    data = await MessagingService.list_conversations(user["id"], limit, cursor, lean=lean)
    return success_response("Conversations", data)


@router.post("/private")
async def create_private_conversation(
    body: CreatePrivateConversationRequest,
    user: dict = Depends(get_current_user),
):
    username = (body.participant_username or "").strip() or None
    peer_id = getattr(body, "peer_user_id", None) or None
    if not username and not peer_id:
        from app.core.exceptions import ValidationError
        raise ValidationError("participant_username or peer_user_id required")
    conv = await MessagingService.get_or_create_private_conversation(
        user["id"], username, peer_id
    )
    return success_response("Conversation ready", conv)


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    conv = await MessagingService.get_conversation(conversation_id, user["id"])
    return success_response("Conversation", conv)


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    """Delete the whole conversation thread for the current user.

    Marks membership hidden and hard-deletes messages + receipts for private
    chats so the thread is gone from the database.
    """
    await MessagingService.delete_conversation(conversation_id, user["id"])
    return success_response("Conversation deleted")


@router.patch("/{conversation_id}/pin")
async def pin_conversation(conversation_id: str, body: dict, user: dict = Depends(get_current_user)):
    from bson import ObjectId
    db = get_database()
    uid = user["id"]
    pinned = bool(body.get("pinned", True))
    now = datetime.now(timezone.utc)
    await db.conversation_members.update_one(
        {"conversation_id": conversation_id, "user_id": uid},
        {"$set": {"pinned": pinned, "pinned_at": now if pinned else None, "updated_at": now},
         "$setOnInsert": {"conversation_id": conversation_id, "user_id": uid, "created_at": now, "hidden": False}},
        upsert=True,
    )
    if ObjectId.is_valid(conversation_id):
        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {f"conversation_settings.{uid}.pinned": pinned, "updated_at": now}},
        )
    return success_response("Pin updated", {"conversation_id": conversation_id, "pinned": pinned})
