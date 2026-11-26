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
    create_password_reset_token,
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
from app.services.session_policy import (
    classify_device,
    enforce_session_limits,
    ended_message,
    session_class,
)
import logging

logger = logging.getLogger(__name__)


class AuthService:
    @staticmethod
    async def register(data: RegisterRequest) -> dict:
        db = get_database()
        username = data.username.lower().strip()
        existing = await db.users.find_one({"username": username})
        if existing:
            raise ConflictError("Username already taken")

        if data.email:
            email_norm = data.email.lower().strip()
            existing_email = await db.users.find_one({"email": email_norm})
            if existing_email:
                raise ConflictError("Email already registered")
        else:
            email_norm = None

        phone = (data.phone_number or "").strip() or None
        if phone:
            # Normalize + match with/without leading +
            raw = phone.replace(" ", "").replace("-", "")
            variants = {raw}
            if raw.startswith("+"):
                variants.add(raw[1:])
            else:
                variants.add("+" + raw)
            existing_phone = await db.users.find_one(
                {"phone_number": {"$in": list(variants)}}
            )
            if existing_phone:
                raise ConflictError("Phone number already registered")
            # Persist canonical E.164-ish form
            if not raw.startswith("+") and raw.isdigit():
                phone = "+" + raw
            else:
                phone = raw

        now = datetime.now(timezone.utc)
        photo = getattr(data, "profile_photo", None)
        bio = getattr(data, "bio", None)
        user_doc = {
            "username": username,
            "display_name": data.display_name.strip(),
            "email": email_norm,
            "phone_number": phone,
            "password_hash": hash_password(data.password),
            "profile_photo": photo,
            "bio": (bio.strip() if isinstance(bio, str) and bio.strip() else None),
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
            "username": username,
            "display_name": data.display_name.strip(),
            "phone_number": phone,
            "email": email_norm,
            "profile_photo": photo,
            "bio": user_doc.get("bio"),
            "account_status": AccountStatus.ACTIVE.value,
        }

    @staticmethod
    async def login(
        data: LoginRequest,
        request: Optional[Request] = None,
    ) -> Tuple[dict, Optional[str], Optional[str], Optional[str]]:
        db = get_database()
        user = None
        if getattr(data, "username", None):
            user = await db.users.find_one({"username": data.username.lower().strip()})
        if user is None and getattr(data, "phone_number", None):
            phone = data.phone_number.strip()
            user = await db.users.find_one({"phone_number": phone})
            # also try without leading +
            if user is None and phone.startswith("+"):
                user = await db.users.find_one({"phone_number": phone[1:]})
        if not user:
            raise UnauthorizedError("Invalid username or password")

        if not verify_password(data.password, user["password_hash"]):
            reset_hash = user.get("password_reset_token_hash")
            reset_nonce = user.get("password_reset_nonce")
            reset_expires = user.get("password_reset_expires_at")
            if isinstance(reset_expires, datetime) and reset_hash and reset_nonce:
                if reset_expires.tzinfo is None:
                    reset_expires = reset_expires.replace(tzinfo=timezone.utc)
                if (
                    reset_expires > datetime.now(timezone.utc)
                    and verify_password(data.password, reset_hash)
                ):
                    status = user.get(
                        "account_status", AccountStatus.ACTIVE.value
                    )
                    if status != AccountStatus.ACTIVE.value:
                        if status == AccountStatus.DEACTIVATED.value:
                            raise AccountRestrictedError("Account is deactivated")
                        raise AccountRestrictedError(
                            f"Account is {status}",
                            details={"status": status},
                        )
                    user_id = str(user["_id"])
                    await db.user_activity_logs.insert_one(
                        {
                            "user_id": user_id,
                            "event_type": "auth",
                            "action": "password_reset_token_login",
                            "resource_type": "user",
                            "resource_id": user_id,
                            "timestamp": datetime.now(timezone.utc),
                            "metadata": {},
                            "ip_address": request.client.host
                            if request and request.client
                            else None,
                        }
                    )
                    reset_login_token = create_password_reset_token(
                        user_id,
                        str(reset_nonce),
                        int(user.get("auth_version", 0)),
                    )
                    return (
                        {
                            "id": user_id,
                            "username": user["username"],
                            "display_name": user.get("display_name")
                            or user["username"],
                            "account_status": user.get(
                                "account_status", AccountStatus.ACTIVE.value
                            ),
                        },
                        None,
                        None,
                        reset_login_token,
                    )

            # Log failed attempt
            await db.user_activity_logs.insert_one(
                {
                    "user_id": str(user["_id"]),
                    "event_type": "auth",
                    "action": "login_failed",
                    "resource_type": "user",
                    "resource_id": str(user["_id"]),
                    "timestamp": datetime.now(timezone.utc),
                    "metadata": {},
                    "ip_address": request.client.host
                    if request and request.client
                    else None,
                }
            )
            raise UnauthorizedError("Invalid username or password")

        status = user.get("account_status", AccountStatus.ACTIVE.value)
        # Deleted / pending_review still blocked from login entirely
        if status in (
            AccountStatus.PENDING_REVIEW.value,
            AccountStatus.DELETED.value,
        ):
            raise AccountRestrictedError(
                f"Account is {status}", details={"status": status}
            )
        # Deactivated stays blocked at login (reactivate flow is separate)
        if status == AccountStatus.DEACTIVATED.value:
            raise AccountRestrictedError("Account is deactivated")
        # Banned users MAY log in with limited access (read chats + support only)

        reset_hash = user.get("password_reset_token_hash")
        reset_nonce = user.get("password_reset_nonce")
        if reset_hash and reset_nonce:
            await db.users.update_one(
                {
                    "_id": user["_id"],
                    "password_reset_token_hash": reset_hash,
                    "password_reset_nonce": reset_nonce,
                },
                {
                    "$unset": {
                        "password_reset_token_hash": "",
                        "password_reset_nonce": "",
                        "password_reset_expires_at": "",
                    }
                },
            )

        user_id = str(user["_id"])
        session_id = generate_session_id()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        user_agent = request.headers.get("user-agent") if request else None
        device_type = classify_device(user_agent, getattr(data, "device_type", None))
        access_token = create_access_token(
            subject=user_id,
            extra_claims={
                "role": user.get("account_role", Role.USER.value),
                "username": user["username"],
                "auth_version": user.get("auth_version", 0),
                "sid": session_id,
            },
        )
        refresh_token = create_refresh_token(subject=user_id, session_id=session_id)

        session_doc = {
            "sid": session_id,
            "device_type": device_type,
            "last_used_at": now,
            "revoked_reason": None,
            "user_id": user_id,
            "token_hash": hash_token(refresh_token),
            "auth_version": user.get("auth_version", 0),
            "device_id": data.device_id,
            "device_name": data.device_name,
            "user_agent": user_agent,
            "ip_address": request.client.host if request and request.client else None,
            "created_at": now,
            "expires_at": expires_at,
            "revoked": False,
            "revoked_at": None,
        }
        await db.sessions.insert_one(session_doc)

        # One live session per device class (mobile / tablet / desktop): the
        # newest login wins and older ones on the same class are closed.
        closed_sids = await enforce_session_limits(db, user_id, now)
        if closed_sids:
            try:  # kick the replaced device's live socket right away
                from app.websocket.manager import manager

                await manager.close_sessions(user_id, set(closed_sids))
            except Exception:
                logger.debug("could not close replaced sockets user=%s", user_id, exc_info=True)

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

        premium = (user.get("subscription_plan") or "pro") == "premium"
        ps = user.get("premium_settings") or {}
        user_public = {
            "id": user_id,
            "username": user["username"],
            "display_name": user["display_name"],
            "profile_photo": user.get("profile_photo"),
            "account_role": user.get("account_role"),
            "account_status": status,
            "ban_reason": (user.get("ban_reason") or user.get("status_reason") or None) if status == "banned" else None,
            "subscription_plan": user.get("subscription_plan") or "pro",
            "verified_badge": bool(ps.get("verified_badge", True)) if premium else False,
            "premium_settings": {
                "verified_badge": bool(ps.get("verified_badge", True)),
                "force_read_receipts": bool(ps.get("force_read_receipts", False)),
                "live_typing": bool(ps.get("live_typing", True)),
                "status_ads_enabled": bool(ps.get("status_ads_enabled", False)),
            },
            "premium_expires_at": (
                user.get("premium_expires_at").isoformat()
                if user.get("premium_expires_at") and hasattr(user.get("premium_expires_at"), "isoformat")
                else (str(user.get("premium_expires_at")) if user.get("premium_expires_at") else None)
            ),
            # Appearance - client applies CSS theme before painting the shell
            "theme": user.get("theme") or "purple",
            "chat_accent": user.get("chat_accent") or "purple",
            "color_mode": user.get("color_mode") or "light",
            "liquid_glass": bool(user.get("liquid_glass", False)),
            "bio": user.get("bio") or "",
            "email": user.get("email"),
            "phone_number": user.get("phone_number"),
        }
        return user_public, access_token, refresh_token, None

    @staticmethod
    async def refresh(refresh_token: str) -> Tuple[str, str]:
        """
        Validate refresh token and issue a new access token.

        Refresh tokens are NOT rotated on every call (stable multi-tab / multi-request).
        The same refresh stays valid until logout, expiry, or password change.
        Cookie + body clients can both present the same token without racing.
        """
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
        now = datetime.now(timezone.utc)
        session = await db.sessions.find_one(
            {"token_hash": token_h, "user_id": user_id}
        )
        if not session:
            raise UnauthorizedError("Session not found or revoked")

        if session.get("revoked"):
            # A closed session never comes back: no grace period and no
            # "un-revoking" by refreshing (that let a kicked device revive itself).
            raise UnauthorizedError(ended_message(session))

        exp = session.get("expires_at")
        if exp is not None:
            try:
                exp_aware = exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp
            except Exception:
                exp_aware = exp
            if exp_aware < now:
                raise UnauthorizedError("Session expired")

        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise UnauthorizedError("User not found")
        if session.get("auth_version", 0) != user.get("auth_version", 0):
            raise UnauthorizedError("Session was revoked after a password change")

        status = user.get("account_status", AccountStatus.ACTIVE.value)
        if status not in (AccountStatus.ACTIVE.value, AccountStatus.BANNED.value):
            raise AccountRestrictedError("Account restricted", details={"status": status})

        # Touch session; keep the same refresh token (no rotate race).
        # Sessions created before device limits get their sid / class filled in.
        touch = {"last_used_at": now, "sid": session_id}
        if session.get("device_type") not in ("mobile", "tablet", "desktop"):
            touch["device_type"] = session_class(session)
        await db.sessions.update_one({"_id": session["_id"], "revoked": False}, {"$set": touch})

        new_access = create_access_token(
            subject=user_id,
            extra_claims={
                "role": user.get("account_role", Role.USER.value),
                "username": user["username"],
                "auth_version": user.get("auth_version", 0),
                "sid": session_id,
            },
        )
        # Return the same refresh token so cookie and body stay in sync
        return new_access, refresh_token

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
            {
                "$set": {
                    "revoked": True,
                    "revoked_at": datetime.now(timezone.utc),
                    "revoked_reason": "logout",
                }
            },
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

        if payload.get("auth_version", 0) != user.get("auth_version", 0):
            raise UnauthorizedError("Password was reset. Sign in again")

        status = user.get("account_status", AccountStatus.ACTIVE.value)
        # Active + banned allowed (banned = limited client). Others blocked.
        if status not in (AccountStatus.ACTIVE.value, AccountStatus.BANNED.value):
            raise AccountRestrictedError("Account restricted", details={"status": status})

        # Tie the access token to its session so a closed session stops working
        # at once (not when the 60-minute token expires). Tokens issued before
        # this change carry no sid and stay valid until they expire.
        sid = payload.get("sid")
        if sid:
            if not await db.sessions.find_one({"sid": sid, "user_id": user_id, "revoked": False}, {"_id": 1}):
                ended = await db.sessions.find_one({"sid": sid, "user_id": user_id})
                raise UnauthorizedError(ended_message(ended))
        user["sid"] = sid

        user["id"] = str(user["_id"])
        user["ban_reason"] = user.get("ban_reason") or user.get("status_reason")
        return user
