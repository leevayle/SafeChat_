"""Shared support ticket serialization."""
from datetime import datetime, timezone


def _iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value)


def ticket_queue_status(ticket: dict) -> str:
    status = ticket.get("status")
    if status in {"pending", "in_progress", "closed"}:
        return status
    return "in_progress" if ticket.get("assigned_admin_id") else "pending"


def serialize_ticket(ticket: dict, *, admin_view: bool = False) -> dict:
    queue_status = ticket_queue_status(ticket)
    if admin_view:
        status = queue_status
    elif queue_status == "closed":
        status = "closed"
    else:
        replies = ticket.get("replies", [])
        last_reply_role = ticket.get("last_reply_role") or (
            replies[-1].get("author_role") if replies else None
        )
        status = "replied" if last_reply_role == "ADMIN" else "open"

    replies = []
    for reply in ticket.get("replies", []):
        item = {
            "id": str(reply.get("id", "")),
            "author_role": reply.get("author_role", "USER"),
            "body": reply.get("body", ""),
            "created_at": _iso(reply.get("created_at")),
        }
        if admin_view:
            item["author_username"] = reply.get("author_username")
        replies.append(item)

    result = {
        "id": str(ticket["_id"]),
        "user_id": ticket.get("user_id"),
        "subject": ticket.get("subject", ""),
        "body": ticket.get("body", ""),
        "status": status,
        "created_at": _iso(ticket.get("created_at")),
        "updated_at": _iso(ticket.get("updated_at")),
        "replies": replies,
    }
    if admin_view:
        history = [
            {
                "admin_id": item.get("admin_id"),
                "username": item.get("username"),
                "assigned_by": item.get("assigned_by"),
                "assigned_at": _iso(item.get("assigned_at")),
            }
            for item in ticket.get("assignment_history", [])
        ]
        if ticket.get("assigned_admin_id") and not history:
            history.append(
                {
                    "admin_id": ticket.get("assigned_admin_id"),
                    "username": ticket.get("assigned_admin_username"),
                    "assigned_by": "LEGACY",
                    "assigned_at": _iso(ticket.get("assigned_at")),
                }
            )
        result.update(
            {
                "assigned_admin_id": ticket.get("assigned_admin_id"),
                "assigned_admin_username": ticket.get("assigned_admin_username"),
                "assigned_at": _iso(ticket.get("assigned_at")),
                "assignment_history": history,
            }
        )
    return result
