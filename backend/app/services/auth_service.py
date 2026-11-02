"""Authentication and session service."""
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from bson import ObjectId
from fastapi import Request
from app.core.database import get_database
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    hash_token,
    generate_session_id,
    decode_token,
)
from app.core.config import settings
from app.core.exceptions import (
    ConflictError,
    UnauthorizedError,
    NotFoundError,
    AccountRestrictedError,
    ForbiddenError,
)
from app.core.permissions import Role
from app.models.user import AccountStatus, AccountRole
from app.schemas.auth import RegisterRequest, LoginRequest
import logging

logger = logging.getLogger(__name__)


class AuthService:
    @staticmethod
    async def register(data: RegisterRequest) -> dict:
        db = get_database()
        existing = await db.users.find_one({"username": data.username})
        if existing:
            raise ConflictError("Username already taken")

        if data.email:
            existing_email = await db.users.find_one({"email": data.email})
            if existing_email:
                raise ConflictError("Email already registered")

        now = datetime.now(timezone.utc)
        user_doc = {
            "username": data.username,
            "display_name": data.display_name,
            "email": data.email,
            "phone_number": data.phone_number,
            "password_hash": hash_password(data.password),
            "profile_photo": None,
            "bio": None,
            "account_role": AccountRole.USER.value,
            "account_status": AccountStatus.ACTIVE.value,
            "verification_status": "unverified",
            "created_at": now,
            "updated_at": now,
            "last_seen": now,
            "privacy_settings": {
                "last_seen": "contacts",
                "profile_photo": "everyone",
                "status": "contacts",
                "read_receipts": True,
            },
            "notification_settings": {
                "messages": True,
                "groups": True,
                "calls": True,
                "statuses": True,
                "security": True,
            },
            "security_settings": {
                "two_factor_enabled": False,
                "login_alerts": True,
            },
        }
        result = await db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)

        # Activity log
        await db.user_activity_logs.insert_one(
            {
                "user_id": user_id,
                "event_type": "auth",
                "action": "register",
                "resource_type": "user",
                "resource_id": user_id,
                "timestamp": now,
                "metadata": {},
            }
        )

        return {
            "id": user_id,
            "username": data.username,
            "display_name": data.display_name,
        }

    @staticmethod
    async def login(
        data: LoginRequest,
        request: Optional[Request] = None,
    ) -> Tuple[dict, str, str]:
        db = get_database()
        user = await db.users.find_one({"username": data.username.lower().strip()})
        if not user or not verify_password(data.password, user["password_hash"]):
            # Log failed attempt
            if user:
                await db.user_activity_logs.insert_one(
                    {
                        "user_id": str(user["_id"]),
                        "event_type": "auth",
                        "action": "login_failed",
                        "resource_type": "user",
                        "resource_id": str(user["_id"]),
                        "timestamp": datetime.now(timezone.utc),
                        "metadata": {},
                        "ip_address": request.client.host if request and request.client else None,
                    }
                )
            raise UnauthorizedError("Invalid username or password")

        status = user.get("account_status", AccountStatus.ACTIVE.value)
        if status in (
            AccountStatus.BANNED.value,
            AccountStatus.PENDING_REVIEW.value,
            AccountStatus.DELETED.value,
        ):
            raise AccountRestrictedError(
                f"Account is {status}", details={"status": status}
            )

        if status == AccountStatus.DEACTIVATED.value:
            raise AccountRestrictedError("Account is deactivated")

        user_id = str(user["_id"])
        session_id = generate_session_id()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        access_token = create_access_token(
            subject=user_id,
            extra_claims={
                "role": user.get("account_role", Role.USER.value),
                "username": user["username"],
            },
        )
        refresh_token = create_refresh_token(subject=user_id, session_id=session_id)

        session_doc = {
            "user_id": user_id,
            "token_hash": hash_token(refresh_token),
            "device_id": data.device_id,
            "device_name": data.device_name,
            "user_agent": request.headers.get("user-agent") if request else None,
            "ip_address": request.client.host if request and request.client else None,
            "created_at": now,
            "expires_at": expires_at,
            "revoked": False,
            "revoked_at": None,
        }
        await db.sessions.insert_one(session_doc)

        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_seen": now}},
        )

        await db.user_activity_logs.insert_one(
            {
                "user_id": user_id,
                "event_type": "auth",
                "action": "login",
                "resource_type": "session",
                "resource_id": session_id,
                "timestamp": now,
                "metadata": {"device_name": data.device_name},
                "ip_address": session_doc["ip_address"],
            }
        )

        user_public = {
            "id": user_id,
            "username": user["username"],
            "display_name": user["display_name"],
            "profile_photo": user.get("profile_photo"),
            "account_role": user.get("account_role"),
            "account_status": status,
        }
        return user_public, access_token, refresh_token

    @staticmethod
    async def refresh(refresh_token: str) -> Tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            raise UnauthorizedError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type")

        user_id = payload.get("sub")
        session_id = payload.get("sid")
        if not user_id or not session_id:
            raise UnauthorizedError("Invalid token payload")

        db = get_database()
        token_h = hash_token(refresh_token)
        session = await db.sessions.find_one(
            {"token_hash": token_h, "user_id": user_id, "revoked": False}
        )
        if not session:
            raise UnauthorizedError("Session not found or revoked")

        if session["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise UnauthorizedError("Session expired")

        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise UnauthorizedError("User not found")

        status = user.get("account_status", AccountStatus.ACTIVE.value)
        if status not in (AccountStatus.ACTIVE.value,):
            raise AccountRestrictedError("Account restricted")

        # Rotate: revoke old, issue new
        await db.sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
        )

        new_session_id = generate_session_id()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        new_access = create_access_token(
            subject=user_id,
            extra_claims={
                "role": user.get("account_role", Role.USER.value),
                "username": user["username"],
            },
        )
        new_refresh = create_refresh_token(subject=user_id, session_id=new_session_id)

        await db.sessions.insert_one(
            {
                "user_id": user_id,
                "token_hash": hash_token(new_refresh),
                "device_id": session.get("device_id"),
                "device_name": session.get("device_name"),
                "user_agent": session.get("user_agent"),
                "ip_address": session.get("ip_address"),
                "created_at": now,
                "expires_at": expires_at,
                "revoked": False,
                "revoked_at": None,
            }
        )
        return new_access, new_refresh

    @staticmethod
    async def logout(refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            return  # already invalid

        db = get_database()
        token_h = hash_token(refresh_token)
        await db.sessions.update_one(
            {"token_hash": token_h},
            {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
        )

    @staticmethod
    async def get_user_from_access_token(token: str) -> dict:
        try:
            payload = decode_token(token)
        except ValueError:
            raise UnauthorizedError("Invalid access token")

        if payload.get("type") != "access":
            raise UnauthorizedError("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedError("Invalid token")

        db = get_database()
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise UnauthorizedError("User not found")

        status = user.get("account_status", AccountStatus.ACTIVE.value)
        if status not in (AccountStatus.ACTIVE.value,):
            raise AccountRestrictedError("Account restricted")

        user["id"] = str(user["_id"])
        return user
