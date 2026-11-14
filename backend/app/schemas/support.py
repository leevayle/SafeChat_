"""Support ticket request validation."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=1000)

    @field_validator("subject", "body")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text cannot be blank")
        return value


class TicketReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Reply cannot be blank")
        return value


class TicketStatusUpdate(BaseModel):
    status: Literal["in_progress", "closed"]
    reason: str = Field(min_length=3, max_length=500)
