"""One-time password reset credentials and email delivery."""
from datetime import datetime, timedelta, timezone
import secrets

from app.core.config import settings
from app.core.database import get_database
from app.core.exceptions import ConflictError, ValidationError, ServiceUnavailableError
from app.core.security import hash_password
from app.services.email_service import EmailDeliveryError, EmailService
from pymongo.errors import PyMongoError


class PasswordResetService:
    @staticmethod
    async def issue_token(
        user: dict,
        *,
        invalidate_sessions: bool,
    ) -> tuple[str, int]:
        recipient = (user.get("email") or "").strip().lower()
        if not recipient:
            raise ValidationError("This account does not have an email address")
        EmailService.ensure_configured()

        temporary_password = secrets.token_urlsafe(24)
        reset_nonce = secrets.token_urlsafe(24)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(
            minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        )
        db = get_database()
        update: dict = {
            "$set": {
                "password_reset_token_hash": hash_password(temporary_password),
                "password_reset_nonce": reset_nonce,
                "password_reset_expires_at": expires_at,
                "updated_at": now,
            }
        }
        if invalidate_sessions:
            update["$inc"] = {"auth_version": 1}
        result = await db.users.update_one({"_id": user["_id"]}, update)
        if result.modified_count != 1:
            raise ConflictError("The password reset could not be created")

        revoked_sessions = 0
        if invalidate_sessions:
            try:
                sessions = await db.sessions.update_many(
                    {"user_id": str(user["_id"]), "revoked": False},
                    {"$set": {"revoked": True, "revoked_at": now}},
                )
            except PyMongoError:
                await PasswordResetService._clear_token(db, user["_id"], reset_nonce)
                raise
            revoked_sessions = sessions.modified_count

        try:
            await EmailService.send_password_reset(
                recipient,
                user.get("username") or "SafeChat user",
                temporary_password,
                settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
            )
        except EmailDeliveryError as exc:
            await PasswordResetService._clear_token(db, user["_id"], reset_nonce)
            raise ServiceUnavailableError(str(exc)) from exc

        return temporary_password, revoked_sessions

    @staticmethod
    async def _clear_token(db, user_id, reset_nonce: str) -> None:
        await db.users.update_one(
            {"_id": user_id, "password_reset_nonce": reset_nonce},
            {
                "$unset": {
                    "password_reset_token_hash": "",
                    "password_reset_nonce": "",
                    "password_reset_expires_at": "",
                }
            },
        )

