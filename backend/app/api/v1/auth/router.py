"""Authentication endpoints."""
from fastapi import APIRouter, Depends, Request, status, Response
from fastapi.responses import JSONResponse
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    PasswordChangeRequest,
    PasswordResetRequest,
    PasswordResetCompletionRequest,
)
from app.services.auth_service import AuthService
from app.core.exceptions import (
    success_response,
    UnauthorizedError,
)
from app.core.config import settings
from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password, decode_token
from app.core.database import get_database
from app.services.email_service import EmailService
from app.services.password_reset_service import PasswordResetService
from bson import ObjectId
from datetime import datetime, timezone
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

def _attach_refresh_cookie(response: Response, refresh: str) -> None:
    """HttpOnly refresh cookie (cross-site friendly for Pages ↔ Render).

    SameSite=None + Secure is required for cross-origin SPAs.
    Partitioned (CHIPS) helps when the browser treats the API as a third party.
    Clients also receive refresh_token in the JSON body as a fallback when
    third-party cookies are blocked.
    """
    from app.core.config import settings
    max_age = int(settings.REFRESH_TOKEN_EXPIRE_DAYS) * 86400
    kwargs = dict(
        key="sc_refresh",
        value=refresh,
        httponly=True,
        secure=True,  # required with SameSite=None
        samesite="none",
        max_age=max_age,
        path="/",
    )
    # Starlette/FastAPI may support Partitioned cookies (CHIPS)
    try:
        response.set_cookie(**kwargs, partitioned=True)
    except TypeError:
        response.set_cookie(**kwargs)


def _clear_refresh_cookie(response: Response) -> None:
    try:
        response.delete_cookie(
            key="sc_refresh", path="/", samesite="none", secure=True, partitioned=True
        )
    except TypeError:
        response.delete_cookie(key="sc_refresh", path="/", samesite="none", secure=True)




@router.get("/username/check")
async def check_username(username: str):
    """Public: whether a username is free to claim."""
    db = get_database()
    uname = (username or "").strip().lower()
    if len(uname) < 3:
        return success_response("Username check", {"available": False, "reason": "too_short"})
    exists = await db.users.find_one({"username": uname}, {"_id": 1})
    return success_response("Username check", {"available": exists is None})


def _normalize_phone(phone: str) -> str:
    """Strip to E.164-ish digits with leading + when present."""
    raw = (phone or "").strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not raw:
        return ""
    if raw.startswith("+"):
        return "+" + "".join(c for c in raw[1:] if c.isdigit())
    return "".join(c for c in raw if c.isdigit())


def _phone_lookup_variants(phone: str) -> list:
    """Match users whether stored with or without +."""
    p = _normalize_phone(phone)
    if not p:
        return []
    variants = {p}
    if p.startswith("+"):
        variants.add(p[1:])
    else:
        variants.add("+" + p)
    # Local leading 0 stripped forms are handled by client E.164; keep raw too
    return [v for v in variants if v]


@router.get("/phone/check")
async def check_phone(phone: str):
    """Public: whether a phone number is free to register."""
    db = get_database()
    variants = _phone_lookup_variants(phone)
    if not variants or len(variants[0].lstrip("+")) < 7:
        return success_response(
            "Phone check",
            {"available": False, "reason": "invalid"},
        )
    exists = await db.users.find_one(
        {"phone_number": {"$in": variants}},
        {"_id": 1},
    )
    return success_response(
        "Phone check",
        {"available": exists is None},
    )


@router.post("/phone/send-code")
async def send_phone_code(body: dict):
    """
    Dev-friendly OTP stub. Onboarding currently skips SMS;
    endpoint exists so the client never 404s.
    """
    phone = _normalize_phone(
        str(body.get("phone_number") or body.get("phone") or "")
    )
    if len(phone.lstrip("+")) < 7:
        from app.core.exceptions import ValidationError
        raise ValidationError("Invalid phone number")
    # No real SMS provider wired — always succeed in dev
    return success_response(
        "Verification code sent",
        {
            "phone_number": phone,
            "sent": True,
            "dev_code": "000000",
            "message": "SMS provider not configured — use onboarding without OTP",
        },
    )


@router.post("/phone/verify-code")
async def verify_phone_code(body: dict):
    """
    Dev-friendly OTP verify stub. Accepts any 4–8 digit code (or 000000).
    Returns a registration_token the client may ignore.
    """
    phone = _normalize_phone(
        str(body.get("phone_number") or body.get("phone") or "")
    )
    code = str(body.get("code") or "").strip()
    if len(phone.lstrip("+")) < 7:
        from app.core.exceptions import ValidationError
        raise ValidationError("Invalid phone number")
    if not code or len(code) < 4:
        from app.core.exceptions import ValidationError
        raise ValidationError("Invalid verification code")
    # Always accept in this build (no SMS backend)
    token = f"dev-verified:{phone}"
    return success_response(
        "Phone verified",
        {
            "phone_number": phone,
            "verified": True,
            "registration_token": token,
        },
    )



@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.LOGIN_RATE_LIMIT)
async def register(request: Request, body: RegisterRequest):
    # Let AppException bubble to global handler so status codes are correct
    user = await AuthService.register(body)
    return success_response("Registration successful", user)


@router.post("/login")
@limiter.limit(settings.LOGIN_RATE_LIMIT)
async def login(request: Request, body: LoginRequest):
    user, access, refresh, reset_login_token = await AuthService.login(body, request)
    if reset_login_token:
        response = JSONResponse(
            content=success_response(
                "Password reset required",
                {
                    "user": user,
                    "password_reset_required": True,
                    "password_reset_token": reset_login_token,
                },
            )
        )
        _clear_refresh_cookie(response)
        return response
    if not access or not refresh:
        raise UnauthorizedError("Login did not create an authenticated session")

    payload = success_response(
        "Login successful",
        {
            "user": user,
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        },
    )
    resp = JSONResponse(content=payload)
    _attach_refresh_cookie(resp, refresh)
    return resp


@router.post("/password-reset/request")
@limiter.limit("5/hour")
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
):
    EmailService.ensure_configured()
    db = get_database()
    email = str(body.email).strip().lower()
    user = await db.users.find_one(
        {"email": email, "account_status": "active"},
        {"_id": 1, "username": 1, "email": 1},
    )
    if user:
        await PasswordResetService.issue_token(
            user,
            invalidate_sessions=False,
        )
    return success_response(
        "If an active account uses that email, a temporary password has been sent."
    )


@router.post("/password-reset/complete")
@limiter.limit("10/minute")
async def complete_password_reset(
    request: Request,
    body: PasswordResetCompletionRequest,
):
    try:
        payload = decode_token(body.reset_login_token)
    except ValueError as exc:
        raise UnauthorizedError("Invalid password reset session") from exc
    if payload.get("type") != "password_reset":
        raise UnauthorizedError("Invalid password reset session")
    user_id = payload.get("sub")
    reset_nonce = payload.get("reset_nonce")
    if not user_id or not reset_nonce or not ObjectId.is_valid(user_id):
        raise UnauthorizedError("Invalid password reset session")

    db = get_database()
    user_oid = ObjectId(user_id)
    user = await db.users.find_one({"_id": user_oid})
    if not user or user.get("password_reset_nonce") != reset_nonce:
        raise UnauthorizedError("Password reset credential is expired or already used")
    if int(user.get("auth_version", 0)) != int(payload.get("auth_version", -1)):
        raise UnauthorizedError("Password reset credential is expired or already used")
    expires_at = user.get("password_reset_expires_at")
    if not expires_at:
        raise UnauthorizedError("Password reset credential is expired or already used")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if expires_at <= now:
        raise UnauthorizedError("Password reset credential is expired or already used")

    result = await db.users.update_one(
        {
            "_id": user_oid,
            "password_reset_nonce": reset_nonce,
        },
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "updated_at": now,
            },
            "$inc": {"auth_version": 1},
            "$unset": {
                "password_reset_token_hash": "",
                "password_reset_nonce": "",
                "password_reset_expires_at": "",
            },
        },
    )
    if result.modified_count != 1:
        raise UnauthorizedError("Password reset credential is expired or already used")

    sessions = await db.sessions.update_many(
        {"user_id": user_id, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    await db.user_activity_logs.insert_one(
        {
            "user_id": user_id,
            "event_type": "auth",
            "action": "password_reset",
            "resource_type": "user",
            "resource_id": user_id,
            "timestamp": now,
            "metadata": {"revoked_sessions": sessions.modified_count},
        }
    )
    return success_response(
        "Password updated. Sign in again with your new password.",
        {"revoked_sessions": sessions.modified_count},
    )


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh_token(request: Request, body: RefreshRequest = RefreshRequest()):
    # Prefer HttpOnly cookie; fall back to body (needed when third-party cookies blocked)
    token = request.cookies.get("sc_refresh") or None
    if not token and body and getattr(body, "refresh_token", None):
        token = body.refresh_token
    if not token:
        from app.core.exceptions import UnauthorizedError
        raise UnauthorizedError("Missing refresh token")
    access, refresh = await AuthService.refresh(token)
    payload = success_response(
        "Token refreshed",
        {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        },
    )
    resp = JSONResponse(content=payload)
    _attach_refresh_cookie(resp, refresh)
    return resp


@router.post("/logout")
async def logout(request: Request, body: RefreshRequest = RefreshRequest()):
    token = None
    if body and getattr(body, "refresh_token", None):
        token = body.refresh_token
    if not token:
        token = request.cookies.get("sc_refresh")
    if token:
        await AuthService.logout(token)
    payload = success_response("Logged out successfully")
    resp = JSONResponse(content=payload)
    _clear_refresh_cookie(resp)
    return resp


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
                "status_ads_enabled": bool(ps.get("status_ads_enabled", False)),
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
                "status_ads_enabled": bool(ps.get("status_ads_enabled", False)) if premium else False,
            },
            "preferences": {
                **{
                    "theme": doc.get("theme") or "purple",
                    "chat_accent": doc.get("chat_accent") or "purple",
                    "color_mode": doc.get("color_mode") or "light",
                    "liquid_glass": bool(doc.get("liquid_glass", False)),
                    "wallpaper": doc.get("wallpaper") or "PurpleSoft",
                    "font_size": "Medium",
                    "language": "English",
                    "msg_notif": True,
                    "group_notif": True,
                    "call_notif": True,
                    "enter_is_send": True,
                    "typing_indicator": True,
                    "read_receipts": True,
                    "status_like_notif": True,
                    "show_fab": True,
                    "time_format": "24h",
                    "sound": "Default",
                    "auto_download": "Wi-Fi",
                },
                **(doc.get("preferences") or {}),
            },
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
    updated = await db.users.update_one(
        {
            "_id": ObjectId(user["id"]),
            "password_hash": user["password_hash"],
        },
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "updated_at": now,
            },
            "$inc": {"auth_version": 1},
            "$unset": {
                "password_reset_token_hash": "",
                "password_reset_nonce": "",
                "password_reset_expires_at": "",
            },
        },
    )
    if updated.modified_count != 1:
        raise UnauthorizedError("Password changed in another session. Sign in again.")
    sessions = await db.sessions.update_many(
        {"user_id": user["id"], "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    await db.user_activity_logs.insert_one(
        {
            "user_id": user["id"],
            "event_type": "auth",
            "action": "password_change",
            "resource_type": "user",
            "resource_id": user["id"],
            "timestamp": now,
            "metadata": {"revoked_sessions": sessions.modified_count},
        }
    )
    return success_response(
        "Password changed. Sign in again with your new password.",
        {"revoked_sessions": sessions.modified_count},
    )
