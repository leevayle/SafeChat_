"""Auth request/response schemas."""
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator
import re


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    display_name: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None

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
    username: str
    password: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


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
