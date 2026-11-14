from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.api.v1.auth import router as auth_router
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    PasswordResetCompletionRequest,
)
from app.services import auth_service
from app.core.exceptions import UnauthorizedError


class FakeUsers:
    def __init__(self, user):
        self.user = user

    async def find_one(self, _query):
        return self.user

    async def update_one(self, query, update):
        if query.get("password_reset_nonce") and query["password_reset_nonce"] != self.user.get(
            "password_reset_nonce"
        ):
            return SimpleNamespace(modified_count=0)
        if query.get("password_reset_token_hash") and query[
            "password_reset_token_hash"
        ] != self.user.get("password_reset_token_hash"):
            return SimpleNamespace(modified_count=0)
        for key, value in update.get("$set", {}).items():
            self.user[key] = value
        for key, value in update.get("$inc", {}).items():
            self.user[key] = self.user.get(key, 0) + value
        for key in update.get("$unset", {}):
            self.user.pop(key, None)
        return SimpleNamespace(modified_count=1)


class FakeActivity:
    def __init__(self):
        self.entries = []

    async def insert_one(self, entry):
        self.entries.append(entry)


@pytest.mark.asyncio
async def test_existing_password_cancels_pending_reset_token(monkeypatch):
    user = {
        "_id": ObjectId(),
        "username": "member",
        "display_name": "Member",
        "password_hash": "current-hash",
        "password_reset_token_hash": "temporary-hash",
        "password_reset_nonce": "nonce",
        "password_reset_expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "account_status": "active",
        "auth_version": 1,
    }
    users = FakeUsers(user)
    sessions = []
    activity = FakeActivity()

    class FakeSessions:
        async def insert_one(self, session):
            sessions.append(session)

    database = SimpleNamespace(
        users=users,
        sessions=FakeSessions(),
        user_activity_logs=activity,
    )
    monkeypatch.setattr(auth_service, "get_database", lambda: database)
    monkeypatch.setattr(
        auth_service,
        "verify_password",
        lambda value, hashed: (value, hashed)
        in {("current-password", "current-hash"), ("temporary-password", "temporary-hash")},
    )
    monkeypatch.setattr(auth_service, "create_access_token", lambda **_kwargs: "access")
    monkeypatch.setattr(auth_service, "create_refresh_token", lambda **_kwargs: "refresh")
    monkeypatch.setattr(auth_service, "hash_token", lambda _token: "token-hash")

    result = await auth_service.AuthService.login(
        LoginRequest(username="member", password="current-password")
    )

    assert result[1:3] == ("access", "refresh")
    assert result[3] is None
    assert "password_reset_token_hash" not in user
    assert "password_reset_nonce" not in user
    assert len(sessions) == 1


@pytest.mark.asyncio
async def test_temporary_password_login_returns_restricted_reset_session(monkeypatch):
    user = {
        "_id": ObjectId(),
        "username": "member",
        "display_name": "Member",
        "password_hash": "current-hash",
        "password_reset_token_hash": "temporary-hash",
        "password_reset_nonce": "nonce",
        "password_reset_expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "account_status": "active",
        "auth_version": 2,
    }
    activity = FakeActivity()

    class FakeSessions:
        async def insert_one(self, _session):
            raise AssertionError("Reset-token login must not create an app session")

    monkeypatch.setattr(
        auth_service,
        "get_database",
        lambda: SimpleNamespace(
            users=FakeUsers(user),
            sessions=FakeSessions(),
            user_activity_logs=activity,
        ),
    )
    monkeypatch.setattr(
        auth_service,
        "verify_password",
        lambda value, hashed: (value, hashed)
        in {("current-password", "current-hash"), ("temporary-password", "temporary-hash")},
    )
    monkeypatch.setattr(
        auth_service,
        "create_password_reset_token",
        lambda user_id, nonce, version: f"{user_id}:{nonce}:{version}",
    )

    result = await auth_service.AuthService.login(
        LoginRequest(username="member", password="temporary-password")
    )

    assert result[1:3] == (None, None)
    assert result[3] == f"{user['_id']}:nonce:2"
    assert activity.entries[0]["action"] == "password_reset_token_login"
    assert user["password_reset_nonce"] == "nonce"


@pytest.mark.asyncio
async def test_reset_completion_changes_password_and_revokes_all_sessions(monkeypatch):
    user_id = ObjectId()
    user = {
        "_id": user_id,
        "username": "member",
        "password_reset_nonce": "nonce",
        "password_reset_token_hash": "temporary-hash",
        "password_reset_expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "auth_version": 2,
    }
    users = FakeUsers(user)
    activity = FakeActivity()
    revoked = []

    class FakeSessions:
        async def update_many(self, query, update):
            revoked.append((query, update))
            return SimpleNamespace(modified_count=3)

    database = SimpleNamespace(
        users=users,
        sessions=FakeSessions(),
        user_activity_logs=activity,
    )
    monkeypatch.setattr(auth_router, "get_database", lambda: database)
    monkeypatch.setattr(auth_router, "hash_password", lambda _password: "new-hash")
    monkeypatch.setattr(
        auth_router,
        "decode_token",
        lambda _token: {
            "type": "password_reset",
            "sub": str(user_id),
            "reset_nonce": "nonce",
            "auth_version": 2,
        },
    )

    response = await auth_router.complete_password_reset.__wrapped__(
        None,
        PasswordResetCompletionRequest(
            reset_login_token="signed-reset-session",
            new_password="new-password-123",
        ),
    )

    assert response["data"]["revoked_sessions"] == 3
    assert user["password_hash"] == "new-hash"
    assert user["auth_version"] == 3
    assert "password_reset_nonce" not in user
    assert revoked[0][0] == {"user_id": str(user_id), "revoked": False}
    assert activity.entries[0]["action"] == "password_reset"


@pytest.mark.asyncio
async def test_settings_password_change_clears_token_and_revokes_sessions(monkeypatch):
    user_id = ObjectId()
    user = {
        "_id": user_id,
        "password_hash": "old-hash",
        "password_reset_token_hash": "temporary-hash",
        "password_reset_nonce": "nonce",
        "password_reset_expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "auth_version": 1,
    }
    users = FakeUsers(user)
    activity = FakeActivity()
    revoked = []

    class FakeSessions:
        async def update_many(self, query, update):
            revoked.append((query, update))
            return SimpleNamespace(modified_count=2)

    monkeypatch.setattr(
        auth_router,
        "get_database",
        lambda: SimpleNamespace(
            users=users,
            sessions=FakeSessions(),
            user_activity_logs=activity,
        ),
    )
    monkeypatch.setattr(
        auth_router,
        "verify_password",
        lambda password, _hashed: password == "current-password",
    )
    monkeypatch.setattr(auth_router, "hash_password", lambda _password: "new-hash")

    await auth_router.change_password(
        PasswordChangeRequest(
            current_password="current-password",
            new_password="new-password-123",
        ),
        {"id": str(user_id), "password_hash": "old-hash"},
    )

    assert user["password_hash"] == "new-hash"
    assert user["auth_version"] == 2
    assert "password_reset_nonce" not in user
    assert revoked[0][0] == {"user_id": str(user_id), "revoked": False}


@pytest.mark.asyncio
async def test_refresh_rejects_sessions_from_an_older_auth_version(monkeypatch):
    user_id = ObjectId()
    session = {
        "_id": ObjectId(),
        "user_id": str(user_id),
        "auth_version": 0,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
    }

    class FakeSessions:
        async def find_one(self, _query):
            return session

    class FakeUsers:
        async def find_one(self, _query):
            return {"_id": user_id, "account_status": "active", "auth_version": 1}

    monkeypatch.setattr(
        auth_service,
        "get_database",
        lambda: SimpleNamespace(users=FakeUsers(), sessions=FakeSessions()),
    )
    monkeypatch.setattr(
        auth_service,
        "decode_token",
        lambda _token: {"type": "refresh", "sub": str(user_id), "sid": "session"},
    )
    monkeypatch.setattr(auth_service, "hash_token", lambda _token: "token-hash")

    with pytest.raises(UnauthorizedError, match="password change"):
        await auth_service.AuthService.refresh("refresh-token")
