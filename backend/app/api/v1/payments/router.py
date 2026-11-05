
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
    plan = (body.plan or "monthly").lower()
    if plan not in PLANS:
        raise ValidationError("Invalid plan")
    phone = _normalize_phone(body.phone)
    amount = PLANS[plan]["amount"]
    checkout_id = f"ws_CO_{uuid.uuid4().hex[:16]}"
    merchant_id = f"ws_MR_{uuid.uuid4().hex[:12]}"
    db = get_database()
    now = datetime.now(timezone.utc)
    await db.payments.insert_one(
        {
            "user_id": user["id"],
            "provider": "mpesa",
            "plan": plan,
            "amount": amount,
            "phone": phone,
            "checkout_request_id": checkout_id,
            "merchant_request_id": merchant_id,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        }
    )
    # Production: call Safaricom Daraja STK push here with MPESA_* env credentials.
    # Dev/demo: auto-complete after status poll (see status endpoint).
    logger.info("STK push queued plan=%s amount=%s phone=%s checkout=%s", plan, amount, phone, checkout_id)
    return success_response(
        "STK push sent",
        {
            "checkoutRequestId": checkout_id,
            "merchantRequestId": merchant_id,
            "amount": amount,
            "plan": plan,
        },
    )


@router.get("/mpesa/status/{checkout_request_id}")
async def mpesa_status(checkout_request_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    row = await db.payments.find_one(
        {"checkout_request_id": checkout_request_id, "user_id": user["id"]}
    )
    if not row:
        raise ValidationError("Payment not found")
    # Demo behavior: mark paid after ~8s so the UI can complete without Daraja keys.
    # Replace with real Safaricom callback / query in production.
    now = datetime.now(timezone.utc)
    created = row.get("created_at") or now
    if getattr(created, "tzinfo", None) is None:
        created = created.replace(tzinfo=timezone.utc)
    age = (now - created).total_seconds()
    paid = row.get("status") == "paid"
    if not paid and age >= 8:
        plan = row.get("plan") or "monthly"
        days = PLANS.get(plan, PLANS["monthly"])["days"]
        expires = now + timedelta(days=days)
        await db.payments.update_one(
            {"_id": row["_id"]},
            {"$set": {"status": "paid", "updated_at": now, "paid_at": now}},
        )
        await db.users.update_one(
            {"_id": ObjectId(user["id"])},
            {
                "$set": {
                    "subscription_plan": "premium",
                    "premium_expires_at": expires,
                    "updated_at": now,
                }
            },
        )
        paid = True
    return success_response(
        "Payment status",
        {"paid": paid, "plan": row.get("plan"), "status": "paid" if paid else row.get("status")},
    )


class VerifyRequest(BaseModel):
    checkoutRequestId: str


@router.post("/mpesa/verify")
async def mpesa_verify(body: VerifyRequest, user: dict = Depends(get_current_user)):
    """Explicit payment verification - the step that grants Premium in DB."""
    db = get_database()
    row = await db.payments.find_one(
        {"checkout_request_id": body.checkoutRequestId, "user_id": user["id"]}
    )
    if not row:
        raise ValidationError("Payment not found")
    now = datetime.now(timezone.utc)
    if row.get("status") == "paid":
        return success_response(
            "Already premium",
            {"paid": True, "plan": row.get("plan"), "subscription_plan": "premium"},
        )
    # In production: query Safaricom STK status here. Demo: accept if age >= 5s
    created = row.get("created_at") or now
    if getattr(created, "tzinfo", None) is None:
        created = created.replace(tzinfo=timezone.utc)
    if (now - created).total_seconds() < 5:
        return success_response(
            "Pending confirmation",
            {"paid": False, "status": "pending", "plan": row.get("plan")},
        )
    plan = row.get("plan") or "monthly"
    days = PLANS.get(plan, PLANS["monthly"])["days"]
    expires = now + timedelta(days=days)
    await db.payments.update_one(
        {"_id": row["_id"]},
        {"$set": {"status": "paid", "updated_at": now, "paid_at": now}},
    )
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {
            "$set": {
                "subscription_plan": "premium",
                "premium_expires_at": expires,
                "updated_at": now,
                "premium_settings.verified_badge": True,
            }
        },
    )
    return success_response(
        "Premium activated",
        {
            "paid": True,
            "plan": plan,
            "subscription_plan": "premium",
            "premium_expires_at": expires.isoformat(),
        },
    )
