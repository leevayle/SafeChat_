"""Contact and contact-request models."""
from datetime import datetime, timezone
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


class ContactStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    BLOCKED = "blocked"
    REJECTED = "rejected"


class ContactRequestStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ContactInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    owner_user_id: str
    contact_user_id: str
    nickname: Optional[str] = None
    contact_status: ContactStatus = ContactStatus.ACCEPTED
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        populate_by_name = True


class ContactRequestInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    from_user_id: str
    to_user_id: str
    message: Optional[str] = None
    status: ContactRequestStatus = ContactRequestStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        populate_by_name = True
