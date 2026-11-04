"""Authentication endpoints."""
from fastapi import APIRouter, Depends, Request, status, Query
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    PasswordChangeRequest,
    PhoneCodeRequest,
    PhoneVerifyRequest,
)
from app.services.auth_service import AuthService
from app.core.exceptions import success_response, error_response, AppException
from app.core.config import settings
from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password, create_access_token
from app.core.database import get_database
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import secrets
import re
import httpx

router = APIRouter(prefix="/auth", tags=["Authentication"])




def _normalize_phone(value: str) -> str:
    raw = (value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not raw.startswith("+") or not 8 <= len(digits) <= 15 or digits.startswith("0"):
        raise AppException("Enter a valid international phone number, including its + country code", "INVALID_PHONE", 422)
    return "+" + digits


def _otp_digest(phone: str, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


async def _send_africastalking_sms(phone: str, code: str) -> None:
    if not settings.AFRICASTALKING_API_KEY:
        raise AppException("SMS provider is not configured. Add AFRICASTALKING_API_KEY to the backend environment.", "SMS_NOT_CONFIGURED", 503)
    sandbox = settings.AFRICASTALKING_USERNAME.lower() == "sandbox"
    endpoint = "https://api.sandbox.africastalking.com/version1/messaging" if sandbox else "https://api.africastalking.com/version1/messaging"
    payload = {"username": settings.AFRICASTALKING_USERNAME, "to": phone, "message": f"Your SafeChat verification code is {code}. It expires in {settings.OTP_EXPIRE_MINUTES} minutes."}
    if settings.AFRICASTALKING_SENDER_ID:
        payload["from"] = settings.AFRICASTALKING_SENDER_ID
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(endpoint, data=payload, headers={"apiKey": settings.AFRICASTALKING_API_KEY, "Accept": "application/json"})
            response.raise_for_status()
            body = response.json()
            recipients = body.get("SMSMessageData", {}).get("Recipients", [])
            if not recipients or recipients[0].get("status") not in ("Success", "Queued", "Sent"):
                raise AppException("SMS could not be delivered. Please try again.", "SMS_DELIVERY_FAILED", 502)
    except httpx.HTTPError as exc:
        raise AppException("The SMS provider is temporarily unavailable. Please try again.", "SMS_PROVIDER_UNAVAILABLE", 502) from exc


@router.get("/username/check")
async def check_username(username: str = Query(..., min_length=3, max_length=32)):
    normalized = username.strip().lower().lstrip("@")
    if not re.fullmatch(r"[a-z0-9_]{3,32}", normalized):
        raise AppException("Username must be 3-32 characters using letters, numbers or underscores.", "INVALID_USERNAME", 422)
    db = get_database()
    exists = await db.users.find_one({"username": normalized}, {"_id": 1})
    return success_response("Username availability", {"username": normalized, "available": not bool(exists)})


@router.post("/phone/send-code")
async def send_phone_code(body: PhoneCodeRequest, request: Request):
    phone = _normalize_phone(body.phone_number)
    db = get_database()
    ip_address = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    ip_limit = await db.phone_otp_ip_limits.find_one({"ip_address": ip_address})
    if ip_limit and (now - ip_limit["window_started_at"].replace(tzinfo=timezone.utc)).total_seconds() < 3600 and ip_limit.get("count", 0) >= 10:
        raise AppException("Too many verification requests from this network. Please try again later.", "OTP_IP_RATE_LIMIT", 429)
    if not ip_limit or (now - ip_limit["window_started_at"].replace(tzinfo=timezone.utc)).total_seconds() >= 3600:
        await db.phone_otp_ip_limits.update_one({"ip_address": ip_address}, {"$set": {"ip_address": ip_address, "window_started_at": now, "count": 1}}, upsert=True)
    else:
        await db.phone_otp_ip_limits.update_one({"ip_address": ip_address}, {"$inc": {"count": 1}})
    if await db.users.find_one({"phone_number": phone}, {"_id": 1}):
        raise AppException("This phone number is already registered. Please log in.", "PHONE_ALREADY_REGISTERED", 409)
    previous = await db.phone_verifications.find_one({"phone_number": phone})
    if previous and previous.get("last_sent_at") and (now - previous["last_sent_at"].replace(tzinfo=timezone.utc)).total_seconds() < settings.OTP_RESEND_SECONDS:
        wait = max(1, settings.OTP_RESEND_SECONDS - int((now - previous["last_sent_at"].replace(tzinfo=timezone.utc)).total_seconds()))
        raise AppException(f"Please wait {wait} seconds before requesting another code.", "OTP_COOLDOWN", 429)
    code = f"{secrets.randbelow(1000000):06d}"
    expires = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    record = {"phone_number": phone, "code_hash": _otp_digest(phone, code), "created_at": now, "last_sent_at": now, "expires_at": expires, "attempts": 0, "verified": False, "consumed": False, "registration_jti": None}
    await db.phone_verifications.update_one({"phone_number": phone}, {"$set": record}, upsert=True)
    development = settings.SMS_MODE.lower() == "development" and not settings.is_production
    if development:
        # Development only: surface the generated code to the local UI, never to production clients.
        return success_response("Development verification code generated", {"phone_number": phone, "expires_in": settings.OTP_EXPIRE_MINUTES * 60, "resend_after": settings.OTP_RESEND_SECONDS, "development_code": code, "delivery": "simulated"})
    await _send_africastalking_sms(phone, code)
    return success_response("Verification code sent", {"phone_number": phone, "expires_in": settings.OTP_EXPIRE_MINUTES * 60, "resend_after": settings.OTP_RESEND_SECONDS, "delivery": "sms"})


@router.post("/phone/verify-code")
async def verify_phone_code(body: PhoneVerifyRequest):
    phone = _normalize_phone(body.phone_number)
    db = get_database()
    now = datetime.now(timezone.utc)
    record = await db.phone_verifications.find_one({"phone_number": phone, "consumed": False, "expires_at": {"$gt": now}})
    if not record:
        raise AppException("Your code has expired. Request a new one.", "OTP_EXPIRED", 400)
    if record.get("attempts", 0) >= settings.OTP_MAX_ATTEMPTS:
        raise AppException("Too many incorrect attempts. Request a new code.", "OTP_ATTEMPTS_EXCEEDED", 429)
    if not hmac.compare_digest(record.get("code_hash", ""), _otp_digest(phone, body.code)):
        await db.phone_verifications.update_one({"_id": record["_id"]}, {"$inc": {"attempts": 1}})
        raise AppException("That code is incorrect. Please try again.", "OTP_INVALID", 400)
    jti = secrets.token_urlsafe(24)
    token = create_access_token(phone, extra_claims={"type": "registration", "phone": phone, "jti": jti}, expires_delta=timedelta(minutes=15))
    await db.phone_verifications.update_one({"_id": record["_id"]}, {"$set": {"verified": True, "registration_jti": jti, "verified_at": now}})
    return success_response("Phone number verified", {"registration_token": token, "phone_number": phone, "expires_in": 900})

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
