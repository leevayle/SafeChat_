"""Group schemas."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class CreateGroupRequest(BaseModel):
    group_name: str = Field(..., min_length=1, max_length=64)
    group_description: Optional[str] = Field(None, max_length=512)
    member_usernames: List[str] = Field(default_factory=list)


class UpdateGroupRequest(BaseModel):
    group_name: Optional[str] = Field(None, min_length=1, max_length=64)
    group_description: Optional[str] = Field(None, max_length=512)
    group_photo: Optional[str] = None


class AddMembersRequest(BaseModel):
    usernames: List[str] = Field(..., min_length=1)


class GroupPermissionsUpdate(BaseModel):
    only_admins_can_post: Optional[bool] = None
    only_admins_can_add_members: Optional[bool] = None
    only_admins_can_edit_info: Optional[bool] = None
