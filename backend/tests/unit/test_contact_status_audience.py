from importlib import import_module
from types import SimpleNamespace

import pytest
from bson import ObjectId


contact_service = import_module("app.services.contact_service")
messaging_service = import_module("app.services.messaging_service")
status_service = import_module("app.services.status_service")


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, length=None):
        return self.rows[:length]

    def __aiter__(self):
        self.iterator = iter(self.rows)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration:
            raise StopAsyncIteration


class Collection:
    def __init__(self, rows):
        self.rows = rows

    def find(self, *_args):
        return Cursor(self.rows)

    async def find_one(self, query, *_args):
        return next(
            (
                item
                for item in self.rows
                if all(item.get(key) == value for key, value in query.items())
            ),
            None,
        )

    async def update_one(self, query, update, upsert=False):
        row = next(
            (
                item
                for item in self.rows
                if all(item.get(key) == value for key, value in query.items())
            ),
            None,
        )
        if row is None and upsert:
            row = dict(query)
            row.update(update.get("$setOnInsert", {}))
            self.rows.append(row)
        if row is not None:
            row.update(update.get("$set", {}))
            return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def insert_one(self, row):
        inserted_id = ObjectId()
        self.rows.append({**row, "_id": inserted_id})
        return SimpleNamespace(inserted_id=inserted_id)


@pytest.mark.asyncio
async def test_list_contacts_does_not_restore_blocked_accepted_request(monkeypatch):
    owner_id = str(ObjectId())
    peer_id = str(ObjectId())
    db = SimpleNamespace(
        contacts=Collection([]),
        contact_requests=Collection(
            [{"from_user_id": owner_id, "to_user_id": peer_id, "status": "accepted"}]
        ),
        blocked_users=Collection(
            [{"blocker_id": owner_id, "blocked_id": peer_id}]
        ),
        users=Collection([]),
    )
    monkeypatch.setattr(contact_service, "get_database", lambda: db)

    assert await contact_service.ContactService.list_contacts(owner_id) == []


@pytest.mark.asyncio
async def test_list_contacts_includes_contacts_from_accepted_requests(monkeypatch):
    owner_id = str(ObjectId())
    edge_peer_id = str(ObjectId())
    request_peer_id = str(ObjectId())
    outgoing_peer_id = str(ObjectId())
    db = SimpleNamespace(
        contacts=Collection(
            [
                {
                    "_id": ObjectId(),
                    "owner_user_id": owner_id,
                    "contact_user_id": edge_peer_id,
                    "contact_status": "accepted",
                }
            ]
        ),
        contact_requests=Collection(
            [
                {
                    "from_user_id": request_peer_id,
                    "to_user_id": owner_id,
                    "status": "accepted",
                },
                {
                    "from_user_id": owner_id,
                    "to_user_id": outgoing_peer_id,
                    "status": "accepted",
                },
            ]
        ),
        blocked_users=Collection([]),
        users=Collection(
            [
                {
                    "_id": ObjectId(edge_peer_id),
                    "username": "edgepeer",
                    "display_name": "Edge Peer",
                },
                {
                    "_id": ObjectId(request_peer_id),
                    "username": "requestpeer",
                    "display_name": "Request Peer",
                },
                {
                    "_id": ObjectId(outgoing_peer_id),
                    "username": "outgoingpeer",
                    "display_name": "Outgoing Peer",
                },
            ]
        ),
    )
    monkeypatch.setattr(contact_service, "get_database", lambda: db)

    contacts = await contact_service.ContactService.list_contacts(owner_id)

    assert {contact["contact_user_id"] for contact in contacts} == {
        edge_peer_id,
        request_peer_id,
        outgoing_peer_id,
    }
    saved_edges = {
        (edge["owner_user_id"], edge["contact_user_id"])
        for edge in db.contacts.rows
    }
    assert (owner_id, request_peer_id) in saved_edges
    assert (request_peer_id, owner_id) in saved_edges
    assert (owner_id, outgoing_peer_id) in saved_edges
    assert (outgoing_peer_id, owner_id) in saved_edges


@pytest.mark.asyncio
async def test_accept_request_persists_both_contact_directions(monkeypatch):
    sender_id = str(ObjectId())
    recipient_id = str(ObjectId())
    request_id = ObjectId()
    request = {
        "_id": request_id,
        "from_user_id": sender_id,
        "to_user_id": recipient_id,
        "status": "pending",
        "share_phone": False,
    }
    db = SimpleNamespace(
        contacts=Collection([]),
        contact_requests=Collection([request]),
        users=Collection([{"_id": ObjectId(recipient_id), "username": "recipient"}]),
        user_activity_logs=Collection([]),
        notifications=Collection([]),
    )

    async def send_user(*_args, **_kwargs):
        return 1

    websocket_manager = import_module("app.websocket.manager")
    monkeypatch.setattr(websocket_manager.manager, "send_user", send_user)
    monkeypatch.setattr(contact_service, "get_database", lambda: db)

    result = await contact_service.ContactService.accept_request(
        str(request_id), recipient_id
    )

    assert result["status"] == "accepted"
    assert request["status"] == "accepted"
    assert {
        (edge["owner_user_id"], edge["contact_user_id"])
        for edge in db.contacts.rows
    } == {(sender_id, recipient_id), (recipient_id, sender_id)}


@pytest.mark.asyncio
async def test_removing_contact_cancels_accepted_request_fallback(monkeypatch):
    owner_id = str(ObjectId())
    peer_id = str(ObjectId())
    request_update = {}

    class ContactRows:
        async def delete_many(self, _query):
            return SimpleNamespace(deleted_count=0)

    class Requests:
        async def update_many(self, query, update):
            request_update["query"] = query
            request_update["update"] = update
            return SimpleNamespace(matched_count=1)

    monkeypatch.setattr(
        contact_service,
        "get_database",
        lambda: SimpleNamespace(contacts=ContactRows(), contact_requests=Requests()),
    )

    await contact_service.ContactService.remove_contact(owner_id, peer_id)

    assert request_update["update"]["$set"]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_removing_contact_deletes_both_edges_and_cancels_request(monkeypatch):
    owner_id = str(ObjectId())
    peer_id = str(ObjectId())
    now_accepted = {
        "from_user_id": owner_id,
        "to_user_id": peer_id,
        "status": "accepted",
    }

    class ContactRows:
        rows = [
            {"owner_user_id": owner_id, "contact_user_id": peer_id},
            {"owner_user_id": peer_id, "contact_user_id": owner_id},
        ]

        async def delete_many(self, _query):
            removed = len(self.rows)
            self.rows = []
            return SimpleNamespace(deleted_count=removed)

    class RequestRows:
        async def update_many(self, _query, update):
            now_accepted.update(update["$set"])
            return SimpleNamespace(matched_count=1)

    contact_rows = ContactRows()
    monkeypatch.setattr(
        contact_service,
        "get_database",
        lambda: SimpleNamespace(
            contacts=contact_rows,
            contact_requests=RequestRows(),
        ),
    )

    await contact_service.ContactService.remove_contact(owner_id, peer_id)

    assert contact_rows.rows == []
    assert now_accepted["status"] == "cancelled"


@pytest.mark.asyncio
async def test_blocked_contacts_report_saved_relationship(monkeypatch):
    owner_id = str(ObjectId())
    peer_id = str(ObjectId())
    db = SimpleNamespace(
        blocked_users=Collection(
            [{"blocker_id": owner_id, "blocked_id": peer_id}]
        ),
        contacts=Collection(
            [
                {
                    "owner_user_id": owner_id,
                    "contact_user_id": peer_id,
                    "contact_status": "accepted",
                }
            ]
        ),
        contact_requests=Collection([]),
        users=Collection(
            [
                {
                    "_id": ObjectId(peer_id),
                    "username": "blockedpeer",
                    "display_name": "Blocked Peer",
                }
            ]
        ),
    )
    monkeypatch.setattr(contact_service, "get_database", lambda: db)

    blocked = await contact_service.ContactService.list_blocked_users(owner_id)

    assert len(blocked) == 1
    assert blocked[0]["id"] == peer_id
    assert blocked[0]["is_contact"] is True


@pytest.mark.asyncio
async def test_blocking_hides_but_does_not_revoke_accepted_contact(monkeypatch):
    blocker_id = str(ObjectId())
    blocked_id = str(ObjectId())
    accepted_request = {
        "from_user_id": blocker_id,
        "to_user_id": blocked_id,
        "status": "accepted",
    }
    pending_request = {
        "from_user_id": blocked_id,
        "to_user_id": blocker_id,
        "status": "pending",
    }

    class Requests(Collection):
        async def update_many(self, _query, update):
            for request in self.rows:
                if request["status"] == "pending":
                    request.update(update["$set"])
            return SimpleNamespace(matched_count=1)

    db = SimpleNamespace(
        users=Collection([{"_id": ObjectId(blocked_id)}]),
        blocked_users=Collection([]),
        contact_requests=Requests([accepted_request, pending_request]),
    )
    monkeypatch.setattr(contact_service, "get_database", lambda: db)

    await contact_service.ContactService.block_user(blocker_id, blocked_id)

    assert accepted_request["status"] == "accepted"
    assert pending_request["status"] == "cancelled"
    assert db.blocked_users.rows[0]["blocker_id"] == blocker_id


@pytest.mark.asyncio
async def test_removed_contact_needs_a_new_accepted_request_to_message():
    owner_id = str(ObjectId())
    peer_id = str(ObjectId())

    class ContactRequests:
        rows = [
            {
                "from_user_id": owner_id,
                "to_user_id": peer_id,
                "status": "cancelled",
                "cancel_reason": "contact_removed",
            }
        ]

        async def find_one(self, query):
            if query.get("cancel_reason"):
                return next(
                    (row for row in self.rows if row.get("cancel_reason") == query["cancel_reason"]),
                    None,
                )
            if query.get("status"):
                return next(
                    (row for row in self.rows if row.get("status") in query["status"]["$in"]),
                    None,
                )
            return None

    db = SimpleNamespace(
        blocked_users=Collection([]),
        contact_requests=ContactRequests(),
        contacts=Collection([]),
    )

    with pytest.raises(
        contact_service.ForbiddenError,
        match="new save request must be accepted",
    ):
        await messaging_service.MessagingService._ensure_private_chat_allowed(
            db, owner_id, peer_id
        )

    db.contact_requests.rows.append(
        {"from_user_id": owner_id, "to_user_id": peer_id, "status": "accepted"}
    )
    await messaging_service.MessagingService._ensure_private_chat_allowed(
        db, owner_id, peer_id
    )


def test_status_audience_visibility_honors_selected_and_excluded_contacts():
    selected_status = {
        "owner_user_id": "owner",
        "visibility": "selected",
        "selected_viewer_ids": ["allowed"],
    }
    except_status = {
        "owner_user_id": "owner",
        "visibility": "contacts_except",
        "excluded_viewer_ids": ["excluded"],
    }

    assert status_service.StatusService._can_view_sync(selected_status, "allowed", [])
    assert not status_service.StatusService._can_view_sync(selected_status, "other", [])
    assert status_service.StatusService._can_view_sync(except_status, "allowed", ["owner"])
    assert not status_service.StatusService._can_view_sync(except_status, "excluded", ["owner"])
