
"""M-Pesa STK payments for Premium plans."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from bson import ObjectId
from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.exceptions import success_response, ValidationError
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])

PLANS = {
    "daily": {"amount": 99, "days": 1},
    "weekly": {"amount": 499, "days": 7},
    "monthly": {"amount": 2999, "days": 30},
}


class StkRequest(BaseModel):
    phone: str = Field(min_length=9, max_length=20)
    plan: str = Field(default="monthly")


def _normalize_phone(phone: str) -> str:
    p = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
    p = p.lstrip("+")
    if p.startswith("0"):
        p = "254" + p[1:]
    if not p.startswith("254"):
        p = "254" + p
    return p


@router.post("/mpesa/stk")
async def mpesa_stk(body: StkRequest, user: dict = Depends(get_current_user)):
    """Initiate M-Pesa STK. Premium is NEVER granted here - only via real callback or admin grant."""
    plan = (body.plan or "monthly").lower()
    if plan not in PLANS:
        raise ValidationError("Invalid plan")
    # Payments not wired yet: do not pretend STK was sent and do not unlock Premium.
    raise ValidationError(
        "Premium purchases are temporarily disabled. An admin can grant Premium until payments go live."
    )


@router.get("/mpesa/status/{checkout_request_id}")
async def mpesa_status(checkout_request_id: str, user: dict = Depends(get_current_user)):
    """Poll payment status. Never auto-grants Premium - only real paid status or admin grant."""
    db = get_database()
    row = await db.payments.find_one(
        {"checkout_request_id": checkout_request_id, "user_id": user["id"]}
    )
    if not row:
        raise ValidationError("Payment not found")
    paid = row.get("status") == "paid"
    return success_response(
        "Payment status",
        {"paid": paid, "plan": row.get("plan"), "status": "paid" if paid else row.get("status")},
    )


class VerifyRequest(BaseModel):
    checkoutRequestId: str


@router.post("/mpesa/verify")
async def mpesa_verify(body: VerifyRequest, user: dict = Depends(get_current_user)):
    """Verify payment. Only returns paid if the row was marked paid by a real callback or admin.

    Does not auto-unlock Premium for demo / timed polls.
    """
    db = get_database()
    row = await db.payments.find_one(
        {"checkout_request_id": body.checkoutRequestId, "user_id": user["id"]}
    )
    if not row:
        raise ValidationError("Payment not found")
    if row.get("status") == "paid":
        return success_response(
            "Already premium",
            {"paid": True, "plan": row.get("plan"), "subscription_plan": "premium"},
        )
    return success_response(
        "Pending confirmation",
        {"paid": False, "status": row.get("status") or "pending", "plan": row.get("plan")},
    )
