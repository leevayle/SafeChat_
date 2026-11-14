"""Support assignment stays balanced across admins active in the portal."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.services.support_assignment import assign_pending_support_tickets


class AsyncCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    def limit(self, _limit):
        return self

    def __aiter__(self):
        self.iterator = iter(self.documents)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration:
            raise StopAsyncIteration


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []

    def find(self, _query, _projection=None):
        return AsyncCursor(self.documents)


class FakeCounter:
    def __init__(self):
        self.sequence = 0

    async def find_one_and_update(self, *_args, **_kwargs):
        self.sequence += 1
        return {"sequence": self.sequence}


class FakeTickets(FakeCollection):
    async def update_one(self, query, update):
        ticket = next(
            item for item in self.documents if item["_id"] == query["_id"]
        )
        if ticket.get("status") not in query["status"]["$in"]:
            return SimpleNamespace(modified_count=0)
        if ticket.get("assigned_admin_id") is not None:
            return SimpleNamespace(modified_count=0)
        ticket.update(update["$set"])
        ticket.setdefault("assignment_history", []).append(
            update["$push"]["assignment_history"]
        )
        return SimpleNamespace(modified_count=1)

    def find(self, query, _projection=None):
        candidates = [
            item
            for item in self.documents
            if item.get("status") in query["status"]["$in"]
            and item.get("assigned_admin_id") is None
        ]
        if "_id" in query:
            candidates = [item for item in candidates if item["_id"] == query["_id"]]
        return AsyncCursor(candidates)


@pytest.mark.asyncio
async def test_pending_tickets_are_assigned_round_robin_to_online_admins():
    admin_a = {
        "_id": ObjectId(),
        "username": "alice",
        "account_role": "ADMIN",
        "account_status": "active",
    }
    admin_b = {
        "_id": ObjectId(),
        "username": "bob",
        "account_role": "ADMIN",
        "account_status": "active",
    }
    tickets = [
        {"_id": ObjectId(), "status": "pending", "created_at": datetime.now(timezone.utc)},
        {"_id": ObjectId(), "status": "pending", "created_at": datetime.now(timezone.utc)},
    ]
    db = SimpleNamespace(
        admin_presence=FakeCollection(
            [{"_id": str(admin_a["_id"])}, {"_id": str(admin_b["_id"])}]
        ),
        users=FakeCollection([admin_b, admin_a]),
        support_tickets=FakeTickets(tickets),
        admin_ticket_assignment_counters=FakeCounter(),
    )

    assignments = await assign_pending_support_tickets(db, datetime.now(timezone.utc))

    assert [item["username"] for item in assignments] == ["alice", "bob"]
    assert [ticket["status"] for ticket in tickets] == ["in_progress", "in_progress"]


@pytest.mark.asyncio
async def test_pending_tickets_stay_unassigned_when_no_admin_is_online():
    ticket = {"_id": ObjectId(), "status": "pending"}
    db = SimpleNamespace(
        admin_presence=FakeCollection(),
        support_tickets=FakeTickets([ticket]),
    )

    assignments = await assign_pending_support_tickets(db, datetime.now(timezone.utc))

    assert assignments == []
    assert ticket["status"] == "pending"
