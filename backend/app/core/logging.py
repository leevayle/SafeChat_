"""Structured logging setup — chatty on boot, quiet in steady state."""
import logging
import sys
from app.core.config import settings


def setup_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )
    # Silence high-volume operational noise
    for name in (
        "uvicorn.access",
        "uvicorn.error",
        "motor",
        "pymongo",
        "pymongo.topology",
        "pymongo.connection",
        "pymongo.command",
        "asyncio",
        "httpx",
        "httpcore",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)

    # App modules: INFO for lifecycle, WARNING for routine request paths
    logging.getLogger("app.api").setLevel(logging.WARNING)
    logging.getLogger("app.services").setLevel(logging.WARNING)
    logging.getLogger("app.websocket").setLevel(logging.WARNING)
    logging.getLogger("app.middleware").setLevel(logging.WARNING)
    # Keep core boot visible
    logging.getLogger("app.core.database").setLevel(logging.INFO)
    logging.getLogger("app.main").setLevel(logging.INFO)
