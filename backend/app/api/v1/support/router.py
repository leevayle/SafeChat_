"""Authenticated support ticket endpoints."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.exceptions import ConflictError, NotFoundError, ValidationError, success_response
from app.schemas.support import TicketCreate, TicketReplyCreate
from app.services.support_assignment import assign_pending_support_tickets
from app.services.support_service import serialize_ticket, ticket_queue_status

router = APIRouter(prefix="/support", tags=["Support"])


@router.get("/tickets")
async def list_my_tickets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    db = get_database()
    filters = {"user_id": user["id"]}
    total = await db.support_tickets.count_documents(filters)
    cursor = (
        db.support_tickets.find(filters)
        .sort("updated_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items = [serialize_ticket(ticket) async for ticket in cursor]
    return success_response(
        "Support tickets",
        {"items": items, "total": total, "page": page, "page_size": page_size},
    )


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
async def create_ticket(body: TicketCreate, user: dict = Depends(get_current_user)):
    db = get_database()
    now = datetime.now(timezone.utc)
    subject = body.subject.strip()
    is_appeal = subject.lower().startswith("appeal") or bool(getattr(body, "is_appeal", False))
    document = {
        "user_id": user["id"],
        "subject": subject,
        "body": body.body.strip(),
        "status": "pending",
        "ticket_type": "ban_appeal" if is_appeal else "support",
        "last_reply_role": "USER",
        "created_at": now,
        "updated_at": now,
        "replies": [],
    }
    result = await db.support_tickets.insert_one(document)
    document["_id"] = result.inserted_id
    await assign_pending_support_tickets(db, now, ticket_id=result.inserted_id)
    return success_response("Support ticket submitted", serialize_ticket(document))


@router.post("/tickets/{ticket_id}/replies")
async def reply_to_ticket(
    ticket_id: str,
    body: TicketReplyCreate,
    user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(ticket_id):
        raise ValidationError("Invalid ticket id")
    db = get_database()
    ticket = await db.support_tickets.find_one(
        {"_id": ObjectId(ticket_id), "user_id": user["id"]}
    )
    if not ticket:
        raise NotFoundError("Support ticket not found")
    if ticket.get("status") == "closed":
        raise ConflictError("This ticket is closed")

    now = datetime.now(timezone.utc)
    next_status = ticket_queue_status(ticket)
    reply = {
        "id": str(ObjectId()),
        "author_role": "USER",
        "body": body.body.strip(),
        "created_at": now,
    }
    result = await db.support_tickets.update_one(
        {"_id": ticket["_id"], "user_id": user["id"], "status": {"$ne": "closed"}},
        {
            "$push": {"replies": reply},
            "$set": {
                "status": next_status,
                "last_reply_role": "USER",
                "updated_at": now,
            },
        },
    )
    if result.modified_count != 1:
        raise ConflictError("This ticket was closed before your reply could be added")
    ticket.setdefault("replies", []).append(reply)
    ticket["status"] = next_status
    ticket["last_reply_role"] = "USER"
    ticket["updated_at"] = now
    return success_response("Reply added", serialize_ticket(ticket))
