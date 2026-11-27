"""SMTP email delivery for account security messages."""
import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError


class EmailDeliveryError(Exception):
    """Raised when the configured SMTP provider rejects or cannot deliver mail."""


class EmailService:
    @staticmethod
    def ensure_configured() -> None:
        if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
            raise ServiceUnavailableError(
                "Password reset email is not configured. Contact support."
            )

    @staticmethod
    async def send_password_reset(
        recipient: str,
        username: str,
        temporary_password: str,
        expires_in_minutes: int,
    ) -> None:
        sender = settings.SMTP_FROM_EMAIL
        if not settings.SMTP_HOST or not sender:
            EmailService.ensure_configured()
        message = EmailMessage()
        message["Subject"] = "Your SafeChat password reset"
        message["From"] = sender
        message["To"] = recipient
        message.set_content(
            f"""Hello @{username},

A password reset was requested for your SafeChat account.

Temporary password: {temporary_password}

Sign in to SafeChat with this temporary password. You will be asked to create a
new password before you can continue. This credential expires in
{expires_in_minutes} minutes. If you did not request this, sign in with your
current password to cancel it, then contact SafeChat support.
"""
        )
        try:
            await asyncio.to_thread(EmailService._send, message)
        except (OSError, smtplib.SMTPException) as exc:
            raise EmailDeliveryError(
                "The password reset email could not be sent."
            ) from exc

    @staticmethod
    def _send(message: EmailMessage) -> None:
        host = settings.SMTP_HOST
        if not host or not settings.SMTP_FROM_EMAIL:
            EmailService.ensure_configured()
        with smtplib.SMTP(
            host,
            settings.SMTP_PORT,
            timeout=15,
        ) as server:
            if settings.SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")
            refused = server.send_message(message)
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)
