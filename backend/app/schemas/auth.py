"""Auth request/response schemas."""
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator
import re


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    display_name: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    profile_photo: Optional[str] = None
    bio: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,32}$", v):
            raise ValueError(
                "Username must be 3-32 chars, lowercase letters, numbers, underscores only"
            )
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    """Accept username or phone_number (E.164) plus password."""
    username: Optional[str] = None
    phone_number: Optional[str] = None
    password: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None

    @model_validator(mode="after")
    def need_identity(self):
        if not (self.username or self.phone_number):
            raise ValueError("username or phone_number is required")
        return self


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class UserPublic(BaseModel):
    id: str
    username: str
    display_name: str
    profile_photo: Optional[str] = None
    bio: Optional[str] = None
    account_role: str
    account_status: str
    last_seen: Optional[str] = None
