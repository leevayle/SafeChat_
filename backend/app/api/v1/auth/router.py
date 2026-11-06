"""Authentication endpoints."""
from fastapi import APIRouter, Depends, Request, status
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    PasswordChangeRequest,
)
from app.services.auth_service import AuthService
from app.core.exceptions import success_response, UnauthorizedError
from app.core.config import settings
from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.core.database import get_database
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/username/check")
async def check_username(username: str):
    """Public: whether a username is free to claim."""
    db = get_database()
    uname = (username or "").strip().lower()
    if len(uname) < 3:
        return success_response("Username check", {"available": False, "reason": "too_short"})
    exists = await db.users.find_one({"username": uname}, {"_id": 1})
    return success_response("Username check", {"available": exists is None})


@router.get("/phone/check")
async def check_phone(phone: str):
    """Public: whether a phone number is free to register."""
    import re
    from urllib.parse import unquote

    db = get_database()
    raw = unquote(phone or "").strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) < 7:
        return success_response("Phone check", {"available": False, "reason": "invalid"})
    variants = list(
        dict.fromkeys(
            [
                raw if raw.startswith("+") else f"+{digits}",
                f"+{digits}",
                digits,
                f"+254{digits.lstrip('0')}" if not digits.startswith("254") else f"+{digits}",
                f"254{digits.lstrip('0')}" if not digits.startswith("254") else digits,
            ]
        )
    )
    exists = await db.users.find_one(
        {"$or": [{"phone_number": {"$in": variants}}, {"phone": {"$in": variants}}]},
        {"_id": 1},
    )
    return success_response("Phone check", {"available": exists is None})


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    # Let AppException bubble to global handler so status codes are correct
    user = await AuthService.register(body)
    return success_response("Registration successful", user)


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    user, access, refresh = await AuthService.login(body, request)
    return success_response(
        "Login successful",
        {
            "user": user,
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        },
    )


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    access, refresh = await AuthService.refresh(body.refresh_token)
    return success_response(
        "Token refreshed",
        {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        },
    )


@router.post("/logout")
async def logout(body: RefreshRequest):
    await AuthService.logout(body.refresh_token)
    return success_response("Logged out successfully")


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    from datetime import datetime, timezone
    from bson import ObjectId
    from app.core.database import get_database

    db = get_database()
    # Fresh doc so subscription/expiry is never stale from token-time user snapshot
    doc = await db.users.find_one({"_id": ObjectId(user["id"])}) or user
    plan = (doc.get("subscription_plan") or "pro").replace("free", "pro")
    expires = doc.get("premium_expires_at")
    now = datetime.now(timezone.utc)
    if expires is not None:
        if getattr(expires, "tzinfo", None) is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if plan == "premium" and expires < now:
            # Expired - demote in DB
            await db.users.update_one(
                {"_id": ObjectId(user["id"])},
                {"$set": {"subscription_plan": "pro", "premium_expires_at": None, "updated_at": now}},
            )
            plan = "pro"
            expires = None
    ps = doc.get("premium_settings") or {}
    premium = plan == "premium"
    expires_iso = None
    if expires is not None:
        expires_iso = expires.isoformat() if hasattr(expires, "isoformat") else str(expires)
        if isinstance(expires_iso, str) and "T" in expires_iso and not expires_iso.endswith("Z") and "+" not in expires_iso[10:]:
            expires_iso = expires_iso + "Z"

    return success_response(
        "Current user",
        {
            "id": user["id"],
            "username": doc.get("username") or user.get("username"),
            "display_name": doc.get("display_name") or user.get("display_name"),
            "email": doc.get("email"),
            "phone_number": doc.get("phone_number"),
            "profile_photo": doc.get("profile_photo"),
            "bio": doc.get("bio") or "",
            "account_role": doc.get("account_role"),
            "account_status": doc.get("account_status"),
            "privacy_settings": doc.get("privacy_settings"),
            "notification_settings": doc.get("notification_settings"),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
            "subscription_plan": plan,
            "premium_expires_at": expires_iso,
            "verified_badge": bool(ps.get("verified_badge", True)) if premium else False,
            "premium_settings": {
                "verified_badge": bool(ps.get("verified_badge", True)),
                "force_read_receipts": bool(ps.get("force_read_receipts", False)),
                "live_typing": bool(ps.get("live_typing", True)),
                "status_ads_enabled": bool(ps.get("status_ads_enabled", True)),
            },
            # Appearance (theme is CSS-only on client)
            "theme": doc.get("theme") or "purple",
            "chat_accent": doc.get("chat_accent") or "purple",
            "color_mode": doc.get("color_mode") or "light",
            "liquid_glass": bool(doc.get("liquid_glass", False)),
            "settings": {
                "theme": doc.get("theme") or "purple",
                "chat_accent": doc.get("chat_accent") or "purple",
                "color_mode": doc.get("color_mode") or "light",
                "liquid_glass": bool(doc.get("liquid_glass", False)),
                "wallpaper": doc.get("wallpaper"),
                "status_validity": (doc.get("status_settings") or {}).get("validity"),
                "status_privacy": (doc.get("status_settings") or {}).get("privacy"),
                "verified_badge": bool(ps.get("verified_badge", True)) if premium else False,
                "force_read_receipts": bool(ps.get("force_read_receipts", False)) if premium else False,
                "live_typing": bool(ps.get("live_typing", True)) if premium else False,
                "status_ads_enabled": bool(ps.get("status_ads_enabled", True)) if premium else False,
            },
            "preferences": doc.get("preferences") or {},
        },
    )


@router.post("/change-password")
async def change_password(
    body: PasswordChangeRequest,
    user: dict = Depends(get_current_user),
):
    if not verify_password(body.current_password, user["password_hash"]):
        raise UnauthorizedError("Current password is incorrect")

    db = get_database()
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "updated_at": now,
            }
        },
    )
    await db.user_activity_logs.insert_one(
        {
            "user_id": user["id"],
            "event_type": "auth",
            "action": "password_change",
            "resource_type": "user",
            "resource_id": user["id"],
            "timestamp": now,
            "metadata": {},
        }
    )
    return success_response("Password changed successfully")
