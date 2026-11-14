"""Helpers for online/busy presence resolution."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple


def _parse_until(until: Any) -> Optional[datetime]:
    if not until:
        return None
    try:
        if isinstance(until, datetime):
            exp = until
        else:
            exp = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp
    except Exception:
        return None


def resolve_busy(
    user_doc: Optional[dict],
    *,
    viewer_id: Optional[str] = None,
    is_contact: Optional[bool] = None,
) -> Tuple[bool, str, Optional[str]]:
    """Return (busy, message, until_iso) for a user document.

    - Only premium users can expose a busy status.
    - Respects busy_until expiry.
    - Respects busy_scope: 'everyone' | 'contacts'.
      When scope is 'contacts', viewer must be a contact (is_contact=True)
      or viewer_id is omitted (caller already filtered peers).
    """
    if not user_doc:
        return False, "", None

    plan = (user_doc.get("subscription_plan") or "pro").lower()
    if plan != "premium":
        return False, "", None

    prefs = user_doc.get("preferences") or {}
    enabled = bool(prefs.get("busy_enabled"))
    if not enabled:
        return False, "", None

    until_raw = prefs.get("busy_until")
    exp = _parse_until(until_raw)
    if exp is not None and exp <= datetime.now(timezone.utc):
        return False, "", None

    scope = (prefs.get("busy_scope") or "everyone").lower()
    if scope == "contacts":
        # If caller provides is_contact, enforce it. If unknown, allow
        # (WS fan-out already only goes to contacts).
        if is_contact is False:
            return False, "", None
        if is_contact is None and viewer_id and str(viewer_id) == str(user_doc.get("_id") or user_doc.get("id") or ""):
            # Self view is fine
            pass

    message = (prefs.get("busy_message") or "").strip()
    until_iso: Optional[str] = None
    if until_raw:
        if isinstance(until_raw, datetime):
            until_iso = until_raw.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if until_raw.tzinfo else (until_raw.isoformat() + "Z")
        else:
            until_iso = str(until_raw)
            if "T" in until_iso and not until_iso.endswith("Z") and "+" not in until_iso[10:]:
                until_iso = until_iso + "Z"

    return True, message, until_iso


def busy_payload_from_doc(user_doc: Optional[dict], **kwargs) -> Dict[str, Any]:
    """Small dict suitable for REST / WS presence payloads."""
    busy, message, until = resolve_busy(user_doc, **kwargs)
    return {
        "busy": busy,
        "busy_message": message if busy else "",
        "busy_until": until if busy else None,
        "busyMessage": message if busy else "",
        "busyUntil": until if busy else None,
    }
