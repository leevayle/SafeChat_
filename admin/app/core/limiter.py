"""Shared SlowAPI rate limiter — in-memory by default (no Redis required)."""
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings


def _storage_uri() -> str:
    url = (getattr(settings, "REDIS_URL", None) or "").strip()
    if not url:
        return "memory://"
    lowered = url.lower()
    if "localhost" in lowered or "127.0.0.1" in lowered:
        return "memory://"
    return url


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    enabled=bool(getattr(settings, "RATE_LIMIT_ENABLED", True)),
    storage_uri=_storage_uri(),
)
