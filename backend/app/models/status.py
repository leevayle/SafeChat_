"""Status (stories) models."""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class StatusType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"


class StatusVisibility(str, Enum):
    CONTACTS = "contacts"
    CLOSE_FRIENDS = "close_friends"
    EVERYONE = "everyone"
    SELECTED = "selected"


class StatusInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    owner_user_id: str
    content: Optional[str] = None
    media_attachments: List[Dict[str, Any]] = Field(default_factory=list)
    visibility: StatusVisibility = StatusVisibility.CONTACTS
    selected_viewer_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(hours=24)
    )
    status_type: StatusType = StatusType.TEXT

    class Config:
        populate_by_name = True
