"""Group models."""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class GroupInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    group_name: str
    group_description: Optional[str] = None
    group_photo: Optional[str] = None
    creator_id: str
    admin_ids: List[str] = Field(default_factory=list)
    member_ids: List[str] = Field(default_factory=list)
    group_permissions: Dict[str, Any] = Field(
        default_factory=lambda: {
            "only_admins_can_post": False,
            "only_admins_can_add_members": False,
            "only_admins_can_edit_info": True,
        }
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        populate_by_name = True
