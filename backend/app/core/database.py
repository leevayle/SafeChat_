"""MongoDB connection and index management using Motor."""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

client: Optional[AsyncIOMotorClient] = None
db: Optional[AsyncIOMotorDatabase] = None


async def connect_to_mongo() -> None:
    global client, db
    logger.info("checking MongoDB connection")
    client = AsyncIOMotorClient(
        settings.MONGODB_URI,
        maxPoolSize=50,
        minPoolSize=5,
        serverSelectionTimeoutMS=5000,
    )
    db = client[settings.MONGODB_DB_NAME]
    await client.admin.command("ping")
    logger.info("DB check passed (%s)", settings.MONGODB_DB_NAME)
    await create_indexes()
    logger.info("Mongo ready")


async def close_mongo_connection() -> None:
    global client, db
    if client:
        client.close()
        client = None
        db = None
        logger.info("MongoDB connection closed")


def get_database() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database not initialized. Call connect_to_mongo first.")
    return db


async def create_indexes() -> None:
    logger.info("checking indexes")
    before_total = 0
    try:
        for name in await db.list_collection_names():
            before_total += len(await db[name].index_information())
    except Exception:
        before_total = 0
    """Create all required indexes for performance and uniqueness."""
    database = get_database()

    # users
    await database.users.create_index("username", unique=True)
    await database.users.create_index("email", unique=False, sparse=True)     #THIS IS WHAT I CHANGED INCASE IT DOESN'T WORK IN FUTURE
    await database.users.create_index("phone_number", unique=True, sparse=True)
    await database.users.create_index("account_status")
    await database.users.create_index("last_seen")

    # sessions
    await database.sessions.create_index("user_id")
    await database.sessions.create_index("token_hash", unique=True)
    await database.sessions.create_index("expires_at", expireAfterSeconds=0)
    await database.sessions.create_index([("user_id", 1), ("revoked", 1)])

    # contacts
    await database.contacts.create_index(
        [("owner_user_id", 1), ("contact_user_id", 1)], unique=True
    )
    await database.contacts.create_index("owner_user_id")
    await database.contacts.create_index("contact_status")
    await database.contacts.create_index(
        [("owner_user_id", 1), ("contact_status", 1), ("created_at", -1)]
    )

    # contact_requests
    await database.contact_requests.create_index(
        [("from_user_id", 1), ("to_user_id", 1)], unique=True
    )
    await database.contact_requests.create_index("to_user_id")
    await database.contact_requests.create_index("status")
    await database.contact_requests.create_index(
        [("to_user_id", 1), ("status", 1), ("created_at", -1)]
    )
    await database.contact_requests.create_index(
        [("from_user_id", 1), ("status", 1), ("created_at", -1)]
    )

    # conversations
    await database.conversations.create_index("participant_ids")
    await database.conversations.create_index("conversation_type")
    await database.conversations.create_index("last_message_at")
    await database.conversations.create_index("group_id", sparse=True)
    # Inbox list: filter by participant then sort by activity
    await database.conversations.create_index(
        [("participant_ids", 1), ("last_message_at", -1)]
    )

    # messages
    await database.messages.create_index(
        [("conversation_id", 1), ("created_at", -1)]
    )
    await database.messages.create_index("sender_id")
    await database.messages.create_index(
        [("conversation_id", 1), ("_id", 1)]
    )
    await database.messages.create_index("idempotency_key", unique=True, sparse=True)
    await database.messages.create_index(
        [("conversation_id", 1), ("deleted_at", 1), ("_id", -1)]
    )

    # message_receipts
    await database.message_receipts.create_index(
        [("message_id", 1), ("user_id", 1)], unique=True
    )
    await database.message_receipts.create_index("conversation_id")
    # Unread badge + mark-read
    await database.message_receipts.create_index(
        [("conversation_id", 1), ("user_id", 1), ("read_at", 1)]
    )
    await database.message_receipts.create_index(
        [("user_id", 1), ("read_at", 1)]
    )

    # message_reactions
    await database.message_reactions.create_index(
        [("message_id", 1), ("user_id", 1), ("emoji", 1)], unique=True
    )

    # groups
    await database.groups.create_index("creator_id")
    await database.groups.create_index("member_ids")
    await database.groups.create_index("admin_ids")

    # statuses - TTL on expires_at
    await database.statuses.create_index("owner_user_id")
    await database.statuses.create_index(
        "expires_at", expireAfterSeconds=0
    )
    await database.statuses.create_index("created_at")
    await database.statuses.create_index(
        [("owner_user_id", 1), ("expires_at", 1), ("created_at", 1)]
    )

    # status_views
    await database.status_views.create_index(
        [("status_id", 1), ("viewer_id", 1)], unique=True
    )
    await database.status_views.create_index("status_id")

    # calls
    await database.call_logs.create_index([("user_id", 1), ("created_at", -1)])
    await database.call_logs.create_index("peer_id")
    await database.status_likes.create_index(
        [("status_id", 1), ("user_id", 1)], unique=True, name="status_like_unique"
    )
    await database.calls.create_index("caller_id")
    await database.calls.create_index("participant_ids")
    await database.calls.create_index("call_status")
    await database.calls.create_index("started_at")

    # notifications
    await database.notifications.create_index(
        [("recipient_id", 1), ("created_at", -1)]
    )
    await database.notifications.create_index(
        [("recipient_id", 1), ("read", 1)]
    )

    # user_activity_logs
    await database.user_activity_logs.create_index(
        [("user_id", 1), ("timestamp", -1)]
    )
    await database.user_activity_logs.create_index("event_type")
    await database.user_activity_logs.create_index("timestamp")

    # moderation_actions
    await database.moderation_actions.create_index("target_user_id")
    await database.moderation_actions.create_index("administrator_id")
    await database.moderation_actions.create_index("action_type")
    await database.moderation_actions.create_index("expires_at")

    # reports
    await database.reports.create_index("reporter_id")
    await database.reports.create_index("target_type")
    await database.reports.create_index("status")
    await database.reports.create_index("created_at")

    # blocked_users
    await database.blocked_users.create_index(
        [("blocker_id", 1), ("blocked_id", 1)], unique=True
    )

    # device_tokens
    await database.device_tokens.create_index(
        [("user_id", 1), ("token", 1)], unique=True
    )
    await database.device_tokens.create_index("user_id")

    # idempotency_records
    await database.idempotency_records.create_index(
        "key", unique=True
    )
    await database.idempotency_records.create_index(
        "created_at", expireAfterSeconds=86400  # 24h
    )

    # system_audit_logs
    await database.system_audit_logs.create_index("timestamp")
    await database.system_audit_logs.create_index("actor_id")

    logger.info("All MongoDB indexes created/verified")

    after_total = 0
    try:
        for name in await db.list_collection_names():
            after_total += len(await db[name].index_information())
    except Exception:
        after_total = before_total
    delta = max(0, after_total - before_total)
    if delta:
        logger.info("indexes passed, %s new/updated", delta)
    else:
        logger.info("indexes passed, all present")
