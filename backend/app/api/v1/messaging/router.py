"""Message send, history, edit, delete, receipts, reactions."""
from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from app.api.deps import get_current_user
from app.schemas.messaging import (
    SendMessageRequest,
    EditMessageRequest,
    ReactMessageRequest,
)
from app.services.messaging_service import MessagingService
from app.core.exceptions import success_response

router = APIRouter(prefix="/messages", tags=["Messaging"])


@router.post(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    user: dict = Depends(get_current_user),
):
    msg = await MessagingService.send_message(
        conversation_id=conversation_id,
        sender_id=user["id"],
        content=body.content,
        message_type=body.message_type,
        reply_to_message_id=body.reply_to_message_id,
        media_attachments=body.media_attachments,
        idempotency_key=body.idempotency_key,
    )
    return success_response("Message sent", msg)


@router.get("/conversations/{conversation_id}")
async def get_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=100),
    before_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    data = await MessagingService.get_messages(
        conversation_id, user["id"], limit, before_id
    )
    return success_response("Messages", data)


@router.patch("/{message_id}")
async def edit_message(
    message_id: str,
    body: EditMessageRequest,
    user: dict = Depends(get_current_user),
):
    msg = await MessagingService.edit_message(message_id, user["id"], body.content)
    return success_response("Message edited", msg)


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    user: dict = Depends(get_current_user),
):
    await MessagingService.delete_message(message_id, user["id"])
    return success_response("Message deleted")


@router.post("/{message_id}/forward")
async def forward_message(
    message_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    to_cid = (body or {}).get("conversation_id") or (body or {}).get("to_conversation_id")
    msg = await MessagingService.forward_message(message_id, user["id"], to_cid)
    return success_response("Message forwarded", msg)


@router.post("/{message_id}/delivered")
async def mark_delivered(
    message_id: str,
    user: dict = Depends(get_current_user),
):
    await MessagingService.mark_delivered(message_id, user["id"])
    return success_response("Marked delivered")


@router.post("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    up_to_message_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    count = await MessagingService.mark_read(
        conversation_id, user["id"], up_to_message_id
    )
    return success_response("Marked read", {"updated": count})


@router.post("/{message_id}/reactions")
async def add_reaction(
    message_id: str,
    body: ReactMessageRequest,
    user: dict = Depends(get_current_user),
):
    result = await MessagingService.react_to_message(
        message_id, user["id"], body.emoji
    )
    return success_response("Reaction added", result)


@router.delete("/{message_id}/reactions/{emoji}")
async def remove_reaction(
    message_id: str,
    emoji: str,
    user: dict = Depends(get_current_user),
):
    await MessagingService.remove_reaction(message_id, user["id"], emoji)
    return success_response("Reaction removed")
