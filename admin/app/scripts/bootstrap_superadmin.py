#!/usr/bin/env python3
"""Promote one existing SafeChat account to the initial superadmin.

Usage: python -m app.scripts.bootstrap_superadmin <username>

This local, one-time operation is available only while no superadmin exists.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone


async def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("Usage: python -m app.scripts.bootstrap_superadmin <username>")
        raise SystemExit(2)

    username = sys.argv[1].strip().lower().lstrip("@")
    confirmation = input(
        f"Type {username} to grant this account initial SUPER_ADMIN access: "
    ).strip().lower().lstrip("@")
    if confirmation != username:
        print("Confirmation did not match; no changes made.")
        raise SystemExit(1)

    from app.core.database import (
        close_mongo_connection,
        connect_to_mongo,
        get_database,
    )

    await connect_to_mongo()
    try:
        db = get_database()
        if await db.users.find_one({"account_role": "SUPER_ADMIN"}, {"_id": 1}):
            print("A superadmin already exists; bootstrap is disabled.")
            raise SystemExit(1)
        target = await db.users.find_one({"username": username})
        if not target:
            print(f"User not found: @{username}")
            raise SystemExit(1)
        if target.get("account_status", "active") != "active":
            print("Only an active account can become the initial superadmin.")
            raise SystemExit(1)

        now = datetime.now(timezone.utc)
        updated = await db.users.update_one(
            {
                "_id": target["_id"],
                "account_status": "active",
                "account_role": {"$ne": "SUPER_ADMIN"},
            },
            {"$set": {"account_role": "SUPER_ADMIN", "updated_at": now}},
        )
        if updated.modified_count != 1:
            print("The account changed during bootstrap; no role was granted.")
            raise SystemExit(1)
        await db.system_audit_logs.insert_one(
            {
                "actor_id": "local-bootstrap",
                "actor_role": "SYSTEM",
                "action_type": "initial_superadmin_bootstrapped",
                "resource_type": "user",
                "resource_id": str(target["_id"]),
                "metadata": {"username": username},
                "timestamp": now,
            }
        )
        print(f"Initial superadmin access granted to @{username}.")
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
