"""Conversation list and private chat creation."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.api.deps import get_current_user
from app.schemas.messaging import CreatePrivateConversationRequest
from app.services.messaging_service import MessagingService
from app.core.exceptions import success_response

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
    conv = await MessagingService.get_or_create_private_conversation(
        user["id"], body.participant_username
    )
    return success_response("Conversation ready", conv)


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    conv = await MessagingService.get_conversation(conversation_id, user["id"])
    return success_response("Conversation", conv)
