"""Round-robin assignment of support tickets to admins active in the portal."""
from datetime import datetime, timedelta

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


ADMIN_PRESENCE_WINDOW = timedelta(seconds=90)


async def _active_admins(db, now: datetime) -> list[dict]:
    presence_cursor = db.admin_presence.find(
        {"last_seen": {"$gte": now - ADMIN_PRESENCE_WINDOW}},
        {"_id": 1},
    )
    user_ids = []
    async for presence in presence_cursor:
        raw_id = str(presence.get("_id", ""))
        if ObjectId.is_valid(raw_id):
            user_ids.append(ObjectId(raw_id))
    if not user_ids:
        return []

    users = [
        user
        async for user in db.users.find(
            {
                "_id": {"$in": user_ids},
                "account_role": {"$in": ["ADMIN", "SUPER_ADMIN"]},
                "account_status": "active",
            },
            {"username": 1, "account_role": 1},
        )
    ]
    return sorted(users, key=lambda user: (user.get("username", "").casefold(), str(user["_id"])))


async def _next_admin(db, admins: list[dict]) -> dict:
    counters = db.admin_ticket_assignment_counters
    try:
        counter = await counters.find_one_and_update(
            {"_id": "support"},
            {"$inc": {"sequence": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        counter = await counters.find_one_and_update(
            {"_id": "support"},
            {"$inc": {"sequence": 1}},
            return_document=ReturnDocument.AFTER,
        )
    if not counter:
        raise RuntimeError("Unable to advance the support assignment counter")
    return admins[(counter["sequence"] - 1) % len(admins)]


async def assign_pending_support_tickets(
    db,
    now: datetime,
    *,
    ticket_id: ObjectId | None = None,
) -> list[dict]:
    admins = await _active_admins(db, now)
    if not admins:
        return []

    query = {
        "status": {"$in": ["pending", "open", "replied"]},
        "assigned_admin_id": None,
    }
    if ticket_id is not None:
        query["_id"] = ticket_id

    cursor = (
        db.support_tickets.find(query)
        .sort("created_at", 1)
        .limit(1000)
    )
    assignments = []
    async for ticket in cursor:
        admin = await _next_admin(db, admins)
        admin_id = str(admin["_id"])
        assignment = {
            "admin_id": admin_id,
            "username": admin.get("username", ""),
            "assigned_at": now,
            "assigned_by": "AUTO",
        }
        result = await db.support_tickets.update_one(
            {
                "_id": ticket["_id"],
                "status": {"$in": ["pending", "open", "replied"]},
                "assigned_admin_id": None,
            },
            {
                "$set": {
                    "status": "in_progress",
                    "assigned_admin_id": admin_id,
                    "assigned_admin_username": admin.get("username", ""),
                    "assigned_at": now,
                    "updated_at": now,
                },
                "$push": {"assignment_history": assignment},
            },
        )
        if result.modified_count:
            assignments.append(
                {
                    "ticket_id": str(ticket["_id"]),
                    "admin_id": admin_id,
                    "username": admin.get("username", ""),
                }
            )
    return assignments
