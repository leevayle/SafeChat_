"""Conversation and message models."""
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict
from enum import Enum
from pydantic import BaseModel, Field


class ConversationType(str, Enum):
    PRIVATE = "private"
    GROUP = "group"


class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    VOICE = "voice"
    VIDEO = "video"
    SYSTEM = "system"


class DeliveryStatus(str, Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class ConversationInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    conversation_type: ConversationType
    participant_ids: List[str]
    group_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_message_at: Optional[datetime] = None
    last_message_id: Optional[str] = None
    conversation_settings: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class MessageInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    conversation_id: str
    sender_id: str
    message_type: MessageType = MessageType.TEXT
    content: Optional[str] = None
    media_attachments: List[Dict[str, Any]] = Field(default_factory=list)
    reply_to_message_id: Optional[str] = None
    forwarded_from: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[datetime] = None
    delivery_status: DeliveryStatus = DeliveryStatus.SENT
    idempotency_key: Optional[str] = None
    edited: bool = False

    class Config:
        populate_by_name = True
