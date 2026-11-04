"""Status schemas."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class CreateStatusRequest(BaseModel):
    content: Optional[str] = Field(None, max_length=1000)
    status_type: str = Field(default="text")
    media_attachments: Optional[List[Dict[str, Any]]] = None
    visibility: str = Field(default="contacts")
    selected_viewer_ids: Optional[List[str]] = None
    expires_in_hours: int = Field(default=24, ge=1, le=168)
    # solid_1..solid_4 | gradient_1..gradient_4
    background: Optional[str] = Field(default="solid_1", max_length=32)
