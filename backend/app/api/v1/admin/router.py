
"""Admin helpers - grant premium without payment (dev/support)."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from bson import ObjectId
from app.core.config import settings
from app.core.database import get_database
from app.core.exceptions import success_response, ValidationError, ForbiddenError
from app.api.deps import get_current_user
import os

router = APIRouter(prefix="/admin", tags=["admin"])


def _admin_key_ok(x_admin_key: str | None) -> bool:
    expected = os.getenv("SAFECHAT_ADMIN_KEY") or getattr(settings, "ADMIN_KEY", None) or "safechat-dev-admin"
    return bool(x_admin_key) and x_admin_key == expected


class GrantPremiumBody(BaseModel):
    username: str | None = None
    user_id: str | None = None
    phone: str | None = None
    days: int = Field(default=30, ge=1, le=3650)
    verified_badge: bool = True


@router.post("/premium/grant")
async def grant_premium(
    body: GrantPremiumBody,
    x_admin_key: str | None = Header(default=None),
    user: dict = Depends(get_current_user),
):
    """
    Grant Premium without M-Pesa.
    Auth: Bearer access token of any logged-in user + header X-Admin-Key.
    Default dev key: safechat-dev-admin  (set SAFECHAT_ADMIN_KEY in env).
    """
    if not _admin_key_ok(x_admin_key):
        # Also allow account_role admin
        if user.get("account_role") not in ("admin", "superadmin"):
            raise ForbiddenError("Admin key required")

    db = get_database()
    q = {}
    if body.user_id and ObjectId.is_valid(body.user_id):
        q["_id"] = ObjectId(body.user_id)
    elif body.username:
        q["username"] = body.username.lower().strip().lstrip("@")
    elif body.phone:
        phone = "".join(ch for ch in body.phone if ch.isdigit() or ch == "+")
        q["phone_number"] = phone
    else:
        raise ValidationError("Provide username, user_id, or phone")

    target = await db.users.find_one(q)
    if not target:
        raise ValidationError("User not found")

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=body.days)
    await db.users.update_one(
        {"_id": target["_id"]},
        {
            "$set": {
                "subscription_plan": "premium",
                "premium_expires_at": expires,
                "updated_at": now,
                "premium_settings.verified_badge": body.verified_badge,
                "premium_settings.force_read_receipts": True,
                "premium_settings.live_typing": True,
            }
        },
    )
    return success_response(
        "Premium granted",
        {
            "user_id": str(target["_id"]),
            "username": target.get("username"),
            "subscription_plan": "premium",
            "premium_expires_at": expires.isoformat(),
            "days": body.days,
        },
    )


@router.post("/premium/revoke")
async def revoke_premium(
    body: GrantPremiumBody,
    x_admin_key: str | None = Header(default=None),
    user: dict = Depends(get_current_user),
):
    if not _admin_key_ok(x_admin_key) and user.get("account_role") not in ("admin", "superadmin"):
        raise ForbiddenError("Admin key required")
    db = get_database()
    q = {}
    if body.user_id and ObjectId.is_valid(body.user_id):
        q["_id"] = ObjectId(body.user_id)
    elif body.username:
        q["username"] = body.username.lower().strip().lstrip("@")
    elif body.phone:
        q["phone_number"] = body.phone
    else:
        raise ValidationError("Provide username, user_id, or phone")
    target = await db.users.find_one(q)
    if not target:
        raise ValidationError("User not found")
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"_id": target["_id"]},
        {
            "$set": {
                "subscription_plan": "pro",
                "premium_expires_at": None,
                "updated_at": now,
            }
        },
    )
    return success_response(
        "Premium revoked",
        {"user_id": str(target["_id"]), "username": target.get("username"), "subscription_plan": "pro"},
    )
