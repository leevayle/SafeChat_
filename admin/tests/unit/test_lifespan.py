"""Application lifespan connects and closes the database."""
import pytest

from app import main


@pytest.mark.asyncio
async def test_lifespan_connects_and_closes_mongodb(monkeypatch):
    events = []

    async def connect():
        events.append("connect")

    async def close():
        events.append("close")

    monkeypatch.setattr(main, "_boot_done", False)
    monkeypatch.setattr(main, "connect_to_mongo", connect)
    monkeypatch.setattr(main, "close_mongo_connection", close)
    monkeypatch.setattr(main, "print_boot_dots", lambda: None)
    monkeypatch.setattr(main, "_print_ready_banner", lambda: None)

    async with main.lifespan(None):
        events.append("running")

    assert events == ["connect", "running", "close"]
