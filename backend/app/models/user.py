"""User-related document models (Pydantic + Mongo helpers)."""
from datetime import datetime, timezone
from typing import Any, Optional, List
from pydantic import BaseModel, Field, EmailStr, field_validator
from bson import ObjectId
from enum import Enum


class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, _info=None):
        if isinstance(v, ObjectId):
            return str(v)
        if ObjectId.is_valid(v):
            return str(v)
        raise ValueError("Invalid ObjectId")


class AccountStatus(str, Enum):
    ACTIVE = "active"
    DEACTIVATED = "deactivated"
    BANNED = "banned"
    PENDING_REVIEW = "pending_review"
    DELETED = "deleted"


class AccountRole(str, Enum):
    USER = "USER"
    MODERATOR = "MODERATOR"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class PrivacySettings(BaseModel):
    last_seen: str = "contacts"  # everyone | contacts | nobody
    profile_photo: str = "everyone"
    status: str = "contacts"
    read_receipts: bool = True


class NotificationSettings(BaseModel):
    messages: bool = True
    groups: bool = True
    calls: bool = True
    statuses: bool = True
    security: bool = True


class SecuritySettings(BaseModel):
    two_factor_enabled: bool = False
    login_alerts: bool = True


class UserInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    username: str
    display_name: str
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password_hash: str
    profile_photo: Optional[str] = None
    bio: Optional[str] = None
    account_role: AccountRole = AccountRole.USER
    account_status: AccountStatus = AccountStatus.ACTIVE
    verification_status: str = "unverified"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: Optional[datetime] = None
    privacy_settings: PrivacySettings = Field(default_factory=PrivacySettings)
    notification_settings: NotificationSettings = Field(default_factory=NotificationSettings)
    security_settings: SecuritySettings = Field(default_factory=SecuritySettings)
    theme: str = "purple"
    subscription_plan: str = "free"

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class SessionInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    token_hash: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    revoked: bool = False
    revoked_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
