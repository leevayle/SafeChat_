"""Contact request/response schemas."""
from typing import Optional, List
from pydantic import BaseModel, Field


class ContactRequestCreate(BaseModel):
    to_username: str = Field(..., min_length=3, max_length=32)
    message: Optional[str] = Field(None, max_length=256)


class ContactNicknameUpdate(BaseModel):
    nickname: Optional[str] = Field(None, max_length=64)


class ContactResponse(BaseModel):
    id: str
    contact_user_id: str
    username: str
    display_name: str
    profile_photo: Optional[str] = None
    nickname: Optional[str] = None
    contact_status: str
    created_at: str


class ContactRequestResponse(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    from_username: Optional[str] = None
    from_display_name: Optional[str] = None
    from_profile_photo: Optional[str] = None
    message: Optional[str] = None
    status: str
    created_at: str
