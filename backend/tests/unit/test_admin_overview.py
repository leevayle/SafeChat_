"""Admin overview metrics include the open support queue."""
from importlib import import_module

import pytest


admin_router = import_module("app.api.v1.admin.router")


class CountCollection:
    def __init__(self, count: int):
        self.count = count

    async def count_documents(self, _query):
        return self.count


class OverviewDatabase:
    users = CountCollection(12)
    payments = CountCollection(0)
    reports = CountCollection(0)
    support_tickets = CountCollection(4)


@pytest.mark.asyncio
async def test_overview_includes_open_support_ticket_count(monkeypatch):
    monkeypatch.setattr(admin_router, "get_database", lambda: OverviewDatabase())

    response = await admin_router.overview(user={"account_role": "ADMIN"})

    assert response["data"]["support_tickets_open"] == 4
