from importlib import import_module
from types import SimpleNamespace

import pytest
from bson import ObjectId


users_router = import_module("app.api.v1.users.router")


class UserCursor:
    def __init__(self, users):
        self.users = users

    def limit(self, _limit):
        return self

    def __aiter__(self):
        self.iterator = iter(self.users)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration:
            raise StopAsyncIteration


class UserCollection:
    def __init__(self, users):
        self.users = users
        self.query = None

    def find(self, query):
        self.query = query
        return UserCursor(self.users)


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["07", "+2547"])
async def test_phone_prefix_search_matches_local_and_international_forms(
    monkeypatch, query
):
    collection = UserCollection([])
    monkeypatch.setattr(
        users_router,
        "get_database",
        lambda: SimpleNamespace(users=collection),
    )

    await users_router.search_users(query, user={"id": str(ObjectId())})

    regexes = [
        item[field]["$regex"]
        for item in collection.query["$or"]
        for field in ("phone_number", "phone")
        if field in item
    ]
    assert any("07" in regex for regex in regexes)
    assert any("2547" in regex for regex in regexes)


@pytest.mark.asyncio
async def test_exact_phone_search_marks_match_without_returning_phone(monkeypatch):
    user_id = ObjectId()
    collection = UserCollection(
        [
            {
                "_id": user_id,
                "username": "member",
                "display_name": "Member",
                "phone_number": "+254712345678",
            }
        ]
    )
    monkeypatch.setattr(
        users_router,
        "get_database",
        lambda: SimpleNamespace(users=collection),
    )

    result = await users_router.search_users(
        "0712345678",
        user={"id": str(ObjectId())},
    )

    assert result["data"][0]["phone_match"] is True
    assert "phone_number" not in result["data"][0]
