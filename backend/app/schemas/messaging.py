"""Messaging request/response schemas."""
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    content: Optional[str] = Field(None, max_length=10000)
    message_type: str = Field(default="text")
    reply_to_message_id: Optional[str] = None
    media_attachments: Optional[List[Dict[str, Any]]] = None
    idempotency_key: Optional[str] = Field(None, max_length=64)


class EditMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class ReactMessageRequest(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=32)


class ForwardMessageRequest(BaseModel):
    target_conversation_id: str


class CreatePrivateConversationRequest(BaseModel):
    participant_username: str = Field(..., min_length=3, max_length=32)


class ConversationSettingsUpdate(BaseModel):
    muted: Optional[bool] = None
    archived: Optional[bool] = None
    pinned: Optional[bool] = None


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_username: Optional[str] = None
    sender_display_name: Optional[str] = None
    message_type: str
    content: Optional[str] = None
    media_attachments: List[Dict[str, Any]] = []
    reply_to_message_id: Optional[str] = None
    forwarded_from: Optional[str] = None
    created_at: str
    updated_at: str
    deleted_at: Optional[str] = None
    delivery_status: str
    edited: bool = False


class ConversationResponse(BaseModel):
    id: str
    conversation_type: str
    participant_ids: List[str]
    participants: Optional[List[Dict[str, Any]]] = None
    group_id: Optional[str] = None
    last_message: Optional[Dict[str, Any]] = None
    last_message_at: Optional[str] = None
    unread_count: int = 0
    created_at: str
    settings: Dict[str, Any] = {}
