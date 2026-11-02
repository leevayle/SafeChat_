"""Custom application exceptions and consistent error responses."""
from typing import Any
from fastapi import status


class AppException(Exception):
    """Base application exception."""

    def __init__(
        self,
        message: str,
        error_code: str = "APP_ERROR",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Any = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", details: Any = None):
        super().__init__(message, "NOT_FOUND", status.HTTP_404_NOT_FOUND, details)


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Unauthorized", details: Any = None):
        super().__init__(message, "UNAUTHORIZED", status.HTTP_401_UNAUTHORIZED, details)


class ForbiddenError(AppException):
    def __init__(self, message: str = "Forbidden", details: Any = None):
        super().__init__(message, "FORBIDDEN", status.HTTP_403_FORBIDDEN, details)


class ConflictError(AppException):
    def __init__(self, message: str = "Conflict", details: Any = None):
        super().__init__(message, "CONFLICT", status.HTTP_409_CONFLICT, details)


class ValidationError(AppException):
    def __init__(self, message: str = "Validation error", details: Any = None):
        super().__init__(
            message, "VALIDATION_ERROR", status.HTTP_422_UNPROCESSABLE_ENTITY, details
        )


class RateLimitError(AppException):
    def __init__(self, message: str = "Too many requests", details: Any = None):
        super().__init__(
            message, "RATE_LIMITED", status.HTTP_429_TOO_MANY_REQUESTS, details
        )


class AccountRestrictedError(AppException):
    def __init__(self, message: str = "Account is restricted", details: Any = None):
        super().__init__(
            message, "ACCOUNT_RESTRICTED", status.HTTP_403_FORBIDDEN, details
        )


def error_response(
    message: str,
    error_code: str = "ERROR",
    details: Any = None,
) -> dict:
    return {
        "success": False,
        "message": message,
        "error_code": error_code,
        "details": details,
    }


def success_response(
    message: str = "OK",
    data: Any = None,
) -> dict:
    return {
        "success": True,
        "message": message,
        "data": data,
    }
