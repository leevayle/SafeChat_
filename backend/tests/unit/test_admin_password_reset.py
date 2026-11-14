"""Password resets invalidate access tokens issued before the reset."""
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.core.exceptions import UnauthorizedError
from app.services import auth_service


@pytest.mark.asyncio
async def test_password_reset_invalidates_preexisting_access_tokens(monkeypatch):
    user_id = ObjectId()
    user = {
        "_id": user_id,
        "account_status": "active",
        "auth_version": 1,
    }

    class Users:
        async def find_one(self, _query):
            return user

    monkeypatch.setattr(
        auth_service,
        "get_database",
        lambda: SimpleNamespace(users=Users()),
    )
    monkeypatch.setattr(
        auth_service,
        "decode_token",
        lambda _token: {
            "type": "access",
            "sub": str(user_id),
            "auth_version": 0,
        },
    )

    with pytest.raises(UnauthorizedError, match="Password was reset"):
        await auth_service.AuthService.get_user_from_access_token("old-token")
