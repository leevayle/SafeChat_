#!/usr/bin/env python3
"""Grant SafeChat Premium from the terminal (secure, offline of payments).

Usage:
  python -m app.scripts.grant_premium <username|phone> <days>

Examples:
  python -m app.scripts.grant_premium alice 7
  python -m app.scripts.grant_premium +254712345678 30

Rules:
  - days must be between 1 and 30
  - looks up by username first, then phone_number
  - requires MongoDB (same as the running API)
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone, timedelta

from bson import ObjectId


def _usage() -> None:
    print("Usage: python -m app.scripts.grant_premium <username|phone> <days>")
    print("  days: integer 1..30")
    sys.exit(2)


async def main() -> None:
    if len(sys.argv) != 3:
        _usage()
    who = sys.argv[1].strip()
    try:
        days = int(sys.argv[2])
    except ValueError:
        _usage()
    if days < 1 or days > 30:
        print("Error: days must be between 1 and 30")
        sys.exit(1)

    from app.core.database import connect_to_mongo, close_mongo_connection, get_database

    await connect_to_mongo()
    try:
        db = get_database()
        target = None
        if who.startswith("+") or who.isdigit():
            phone = "".join(ch for ch in who if ch.isdigit() or ch == "+")
            target = await db.users.find_one({"phone_number": phone})
            if not target:
                target = await db.users.find_one({"phone": phone})
        if not target:
            uname = who.lower().lstrip("@")
            target = await db.users.find_one({"username": uname})
        if not target:
            print(f"User not found: {who}")
            sys.exit(1)

        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=days)
        await db.users.update_one(
            {"_id": target["_id"]},
            {
                "$set": {
                    "subscription_plan": "premium",
                    "premium_expires_at": expires,
                    "updated_at": now,
                    "premium_settings.verified_badge": True,
                    "premium_settings.force_read_receipts": True,
                    "premium_settings.live_typing": True,
                    "premium_settings.hide_live_typing": False,
                    "premium_settings.status_ads": True,
                    "premium_settings.busy_status": False,
                }
            },
        )
        print(
            f"OK  @{target.get('username')}  → premium for {days} day(s)  "
            f"until {expires.isoformat()}"
        )
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
