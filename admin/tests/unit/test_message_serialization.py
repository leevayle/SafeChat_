from importlib import import_module
from types import SimpleNamespace

import pytest
from bson import ObjectId


messaging_service = import_module("app.services.messaging_service")


class Cursor:
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class Collection:
    def __init__(self, row=None):
        self.row = row

    async def find_one(self, *_args, **_kwargs):
        return self.row

    def find(self, *_args, **_kwargs):
        return Cursor()


@pytest.mark.asyncio
async def test_serialized_message_exposes_idempotency_key_for_client_merge(monkeypatch):
    sender_id = str(ObjectId())
    message = {
        "_id": ObjectId(),
        "conversation_id": str(ObjectId()),
        "sender_id": sender_id,
        "message_type": "text",
        "content": "hello",
        "media_attachments": [],
        "created_at": None,
        "idempotency_key": "local-message-key",
    }
    db = SimpleNamespace(
        users=Collection({"username": "sender", "display_name": "Sender"}),
        message_reactions=Collection(),
    )
    monkeypatch.setattr(messaging_service, "get_database", lambda: db)

    serialized = await messaging_service.MessagingService._serialize_message(message)

    assert serialized["client_key"] == "local-message-key"
