"""Support ticket endpoints keep submissions attached to the signed-in user."""
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.api.v1.support import router as support_router
from app.core.exceptions import NotFoundError
from app.schemas.support import TicketCreate, TicketReplyCreate


class FakeTicketCollection:
    def __init__(self):
        self.inserted = None
        self.lookup = None

    async def insert_one(self, document):
        self.inserted = document
        return SimpleNamespace(inserted_id=ObjectId())

    async def find_one(self, query):
        self.lookup = query
        return None


@pytest.mark.asyncio
async def test_new_ticket_is_saved_under_authenticated_user(monkeypatch):
    collection = FakeTicketCollection()
    async def no_assignment(*_args, **_kwargs):
        return []

    monkeypatch.setattr(
        support_router, "get_database", lambda: SimpleNamespace(support_tickets=collection)
    )
    monkeypatch.setattr(support_router, "assign_pending_support_tickets", no_assignment)

    result = await support_router.create_ticket(
        TicketCreate(subject="Login issue", body="I cannot sign in"),
        user={"id": "authenticated-user"},
    )

    assert collection.inserted["user_id"] == "authenticated-user"
    assert collection.inserted["status"] == "pending"
    assert collection.inserted["replies"] == []
    assert result["data"]["subject"] == "Login issue"
    assert result["data"]["status"] == "open"


@pytest.mark.asyncio
async def test_user_cannot_reply_to_another_users_ticket(monkeypatch):
    collection = FakeTicketCollection()
    monkeypatch.setattr(
        support_router, "get_database", lambda: SimpleNamespace(support_tickets=collection)
    )

    with pytest.raises(NotFoundError):
        await support_router.reply_to_ticket(
            str(ObjectId()),
            TicketReplyCreate(body="Any update?"),
            user={"id": "authenticated-user"},
        )

    assert collection.lookup["user_id"] == "authenticated-user"
