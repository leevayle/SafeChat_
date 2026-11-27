from datetime import datetime, timedelta, timezone

from app.utils.time import utc_iso


def test_naive_mongodb_datetime_is_serialized_as_utc():
    value = datetime(2026, 11, 3, 18, 8, 0)
    assert utc_iso(value) == "2026-11-03T18:08:00Z"


def test_aware_datetime_is_normalized_to_utc():
    value = datetime(2026, 11, 3, 21, 8, 0, tzinfo=timezone(timedelta(hours=3)))
    assert utc_iso(value) == "2026-11-03T18:08:00Z"


def test_none_datetime_stays_none():
    assert utc_iso(None) is None
