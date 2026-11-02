"""FastAPI dependencies for authentication and authorization."""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.auth_service import AuthService
from app.core.exceptions import UnauthorizedError, AccountRestrictedError, ForbiddenError
from app.core.permissions import has_min_role, Role, has_permission, Permission

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not credentials or not credentials.credentials:
        raise UnauthorizedError("Authentication required")
    try:
        user = await AuthService.get_user_from_access_token(credentials.credentials)
        return user
    except (UnauthorizedError, AccountRestrictedError) as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={
                "success": False,
                "message": e.message,
                "error_code": e.error_code,
                "details": e.details,
            },
        )


async def get_current_active_user(
    user: dict = Depends(get_current_user),
) -> dict:
    return user


def require_roles(*roles: Role):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        user_role = user.get("account_role", Role.USER.value)
        if not any(has_min_role(user_role, r) for r in roles):
            raise ForbiddenError("Insufficient permissions")
        return user

    return checker


def require_permission(permission: Permission):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user.get("account_role", Role.USER.value), permission):
            raise ForbiddenError("Permission denied")
        return user

    return checker
