"""Authentication endpoints."""
from fastapi import APIRouter, Depends, Request, status
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    PasswordChangeRequest,
)
from app.services.auth_service import AuthService
from app.core.exceptions import success_response, error_response, AppException
from app.core.config import settings
from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.core.database import get_database
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    try:
        user = await AuthService.register(body)
        return success_response("Registration successful", user)
    except AppException as e:
        return error_response(e.message, e.error_code, e.details)


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    try:
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
    except AppException as e:
        return error_response(e.message, e.error_code, e.details)


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    try:
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
    except AppException as e:
        return error_response(e.message, e.error_code, e.details)


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
            "profile_photo": user.get("profile_photo"),
            "bio": user.get("bio"),
            "account_role": user.get("account_role"),
            "account_status": user.get("account_status"),
            "privacy_settings": user.get("privacy_settings"),
            "notification_settings": user.get("notification_settings"),
            "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        },
    )


@router.post("/change-password")
async def change_password(
    body: PasswordChangeRequest,
    user: dict = Depends(get_current_user),
):
    if not verify_password(body.current_password, user["password_hash"]):
        return error_response("Current password is incorrect", "INVALID_PASSWORD")

    db = get_database()
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    # Optionally revoke other sessions
    await db.user_activity_logs.insert_one(
        {
            "user_id": user["id"],
            "event_type": "auth",
            "action": "password_change",
            "resource_type": "user",
            "resource_id": user["id"],
            "timestamp": datetime.now(timezone.utc),
            "metadata": {},
        }
    )
    return success_response("Password changed successfully")
