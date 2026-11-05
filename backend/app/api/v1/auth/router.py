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
    return success_response(
        "Current user",
        {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "email": user.get("email"),
            "phone_number": user.get("phone_number"),
            "profile_photo": user.get("profile_photo"),
            "bio": user.get("bio"),
            "account_role": user.get("account_role"),
            "account_status": user.get("account_status"),
            "privacy_settings": user.get("privacy_settings"),
            "notification_settings": user.get("notification_settings"),
            "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
            # Appearance (theme is CSS-only on client — never flash another user's palette)
            "theme": user.get("theme") or "purple",
            "chat_accent": user.get("chat_accent") or "purple",
            "color_mode": user.get("color_mode") or "light",
            "liquid_glass": bool(user.get("liquid_glass", False)),
            "settings": {
                "theme": user.get("theme") or "purple",
                "chat_accent": user.get("chat_accent") or "purple",
                "color_mode": user.get("color_mode") or "light",
                "liquid_glass": bool(user.get("liquid_glass", False)),
                "wallpaper": user.get("wallpaper"),
                "status_validity": (user.get("status_settings") or {}).get("validity"),
                "status_privacy": (user.get("status_settings") or {}).get("privacy"),
            },
            "preferences": user.get("preferences") or {},
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
