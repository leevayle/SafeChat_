"""UTC-safe datetime serialization helpers."""
from datetime import datetime, timezone
from typing import Optional


def utc_iso(value: Optional[datetime]) -> Optional[str]:
    """Serialize a MongoDB datetime as an explicit UTC ISO-8601 timestamp.

    Motor commonly returns naive datetime objects even though MongoDB stores
    dates as UTC. Emitting a timezone-less value makes browsers interpret it
    as local time, shifting message timestamps by the client's UTC offset.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")
