"""Admin APIs must use server-side roles for authorization."""
from importlib import import_module
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.api.v1.admin.router import router
from app.api.v1.support.router import router as support_router
from app.api.deps import get_current_user
from app.core.exceptions import ForbiddenError


admin_api = import_module("app.api.v1.admin.router")
password_reset_service = import_module("app.services.password_reset_service")


class EmptyAsyncCursor:
    def sort(self, *_args):
        return self

    def skip(self, *_args):
        return self

    def limit(self, *_args):
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class EmptyTicketCollection:
    def __init__(self):
        self.filters = []

    async def count_documents(self, query):
        self.filters.append(query)
        return 0

    def find(self, query):
        self.filters.append(query)
        return EmptyAsyncCursor()


def _role_checker(path: str, method: str = "GET"):
    route = next(
        route
        for route in router.routes
        if route.path == path and method in route.methods
    )
    assert len(route.dependant.dependencies) == 1
    return route.dependant.dependencies[0].call


@pytest.mark.asyncio
async def test_admin_dashboard_rejects_regular_user():
    check_role = _role_checker("/admin/overview")

    with pytest.raises(ForbiddenError):
        await check_role({"account_role": "USER"})

    assert (await check_role({"account_role": "ADMIN"}))["account_role"] == "ADMIN"
    assert (await check_role({"account_role": "SUPER_ADMIN"}))["account_role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_only_superadmin_can_approve_admin_role():
    check_role = _role_checker("/admin/role-requests/{request_id}/approve", "POST")

    with pytest.raises(ForbiddenError):
        await check_role({"account_role": "ADMIN"})

    assert (await check_role({"account_role": "SUPER_ADMIN"}))["account_role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_only_superadmin_can_revoke_admin_role():
    check_role = _role_checker("/admin/users/{user_id}/revoke-admin", "POST")

    with pytest.raises(ForbiddenError):
        await check_role({"account_role": "ADMIN"})

    assert (await check_role({"account_role": "SUPER_ADMIN"}))["account_role"] == "SUPER_ADMIN"


def test_user_support_routes_require_authentication():
    for route in support_router.routes:
        assert len(route.dependant.dependencies) == 1
        assert route.dependant.dependencies[0].call is get_current_user


@pytest.mark.asyncio
async def test_support_inbox_requires_admin_role():
    check_role = _role_checker("/admin/support/tickets")

    with pytest.raises(ForbiddenError):
        await check_role({"account_role": "USER"})

    assert (await check_role({"account_role": "ADMIN"}))["account_role"] == "ADMIN"


@pytest.mark.asyncio
async def test_admin_inbox_only_returns_tickets_assigned_to_that_admin(monkeypatch):
    collection = EmptyTicketCollection()
    monkeypatch.setattr(
        admin_api,
        "get_database",
        lambda: SimpleNamespace(support_tickets=collection),
    )

    await admin_api.list_support_tickets(
        status=None,
        page=1,
        page_size=25,
        user={"id": "admin-id", "account_role": "ADMIN"},
    )

    assert collection.filters[0] == {"assigned_admin_id": "admin-id"}
    assert collection.filters[1] == {"assigned_admin_id": "admin-id"}


@pytest.mark.asyncio
async def test_superadmin_inbox_includes_all_tickets(monkeypatch):
    collection = EmptyTicketCollection()
    monkeypatch.setattr(
        admin_api,
        "get_database",
        lambda: SimpleNamespace(support_tickets=collection),
    )

    await admin_api.list_support_tickets(
        status=None,
        page=1,
        page_size=25,
        user={"id": "superadmin-id", "account_role": "SUPER_ADMIN"},
    )

    assert collection.filters == [{}, {}]


@pytest.mark.asyncio
async def test_password_reset_returns_temporary_password_and_audits_without_secret(monkeypatch):
    target = {
        "_id": ObjectId(),
        "username": "member",
        "account_role": "USER",
        "password_hash": "old-hash",
        "email": "member@example.test",
    }

    class Users:
        async def find_one(self, query):
            if query.get("username") == "member" or query.get("_id") == target["_id"]:
                return target
            return None

        async def update_one(self, _query, update):
            target.update(update["$set"])
            for key, increment in update.get("$inc", {}).items():
                target[key] = target.get(key, 0) + increment
            return SimpleNamespace(modified_count=1)

    class Sessions:
        async def update_many(self, *_args):
            return SimpleNamespace(modified_count=2)

    database = SimpleNamespace(users=Users(), sessions=Sessions())
    audit = {}

    async def write_audit(actor, action, resource_type, resource_id, metadata):
        audit.update(
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata=metadata,
        )

    monkeypatch.setattr(admin_api, "get_database", lambda: database)
    monkeypatch.setattr(password_reset_service, "get_database", lambda: database)
    monkeypatch.setattr(
        password_reset_service.EmailService,
        "ensure_configured",
        staticmethod(lambda: None),
    )
    sent = []

    async def send_password_reset(recipient, username, temporary_password, _expires):
        sent.append((recipient, username, temporary_password))

    monkeypatch.setattr(
        password_reset_service.EmailService,
        "send_password_reset",
        staticmethod(send_password_reset),
    )
    monkeypatch.setattr(
        password_reset_service,
        "hash_password",
        lambda _password: "new-token-hash",
    )
    monkeypatch.setattr(admin_api, "_write_audit", write_audit)

    response = await admin_api.reset_user_password(
        admin_api.PasswordResetBody(username="member", reason="Verified account recovery"),
        user={"id": str(ObjectId()), "username": "admin", "account_role": "ADMIN"},
    )

    assert response["data"]["temporary_password"]
    assert target["password_hash"] == "old-hash"
    assert target["password_reset_token_hash"] == "new-token-hash"
    assert sent == [
        ("member@example.test", "member", response["data"]["temporary_password"])
    ]
    assert target["auth_version"] == 1
    assert response["data"]["revoked_sessions"] == 2
    assert audit["action"] == "user_password_reset"
    assert "temporary_password" not in audit["metadata"]


@pytest.mark.asyncio
async def test_audit_entries_capture_the_actor_username(monkeypatch):
    class AuditCollection:
        def __init__(self):
            self.document = None

        async def insert_one(self, document):
            self.document = document

    collection = AuditCollection()
    monkeypatch.setattr(
        admin_api,
        "get_database",
        lambda: SimpleNamespace(system_audit_logs=collection),
    )

    await admin_api._write_audit(
        {"id": "admin-id", "username": "safety-admin", "account_role": "ADMIN"},
        "account_status_changed",
        "user",
        "user-id",
        {"reason": "review"},
    )

    assert collection.document["actor_username"] == "safety-admin"
