#!/usr/bin/env python3
"""
Daily SafeChat database backup.

Usage (from backend root, with venv active):

    python scripts/daily_backup.py
    python scripts/daily_backup.py --scope messages

Schedule with cron (Linux/macOS) e.g. 02:30 every day:

    30 2 * * * cd /path/to/backend && .venv/bin/python scripts/daily_backup.py >> storage/backups/cron.log 2>&1

Windows Task Scheduler: run the same command daily.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Ensure backend root is on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def main(scope: str) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from app.core.database import connect_to_mongo, close_mongo_connection
    from app.services.backup_service import run_scheduled_backup, list_backup_files, delete_backup_file

    await connect_to_mongo()
    try:
        result = await run_scheduled_backup(scope=scope)
        status = (result or {}).get("status")
        logging.info("Backup finished: %s", result)
        # Retention: keep last 14 full archives
        files = list_backup_files()
        full = [f for f in files if (f.get("scope") == "full" or "full" in (f.get("filename") or ""))]
        for stale in full[14:]:
            delete_backup_file(stale["filename"])
            logging.info("Pruned old backup %s", stale["filename"])
        return 0 if status == "completed" else 1
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SafeChat daily DB backup")
    parser.add_argument("--scope", default="full", help="Backup scope (default: full)")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.scope)))
