"""Role-based access control and permission helpers."""
from enum import Enum
from typing import Set


class Role(str, Enum):
    USER = "USER"
    MODERATOR = "MODERATOR"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


ROLE_HIERARCHY = {
    Role.USER: 1,
    Role.MODERATOR: 2,
    Role.ADMIN: 3,
    Role.SUPER_ADMIN: 4,
}


class Permission(str, Enum):
    READ_OWN_PROFILE = "read_own_profile"
    UPDATE_OWN_PROFILE = "update_own_profile"
    DELETE_OWN_ACCOUNT = "delete_own_account"
    SEND_MESSAGE = "send_message"
    EDIT_OWN_MESSAGE = "edit_own_message"
    DELETE_OWN_MESSAGE = "delete_own_message"
    CREATE_GROUP = "create_group"
    MANAGE_GROUP = "manage_group"
    ISSUE_WARNING = "issue_warning"
    TEMPORARY_BAN = "temporary_ban"
    PERMANENT_BAN = "permanent_ban"
    LIFT_RESTRICTION = "lift_restriction"
    REVIEW_REPORTS = "review_reports"
    VIEW_AUDIT_LOGS = "view_audit_logs"
    VIEW_SYSTEM_STATS = "view_system_stats"
    MANAGE_USERS = "manage_users"
    MANAGE_ROLES = "manage_roles"
    VIEW_ARCHIVES = "view_archives"


ROLE_PERMISSIONS: dict[Role, Set[Permission]] = {
    Role.USER: {
        Permission.READ_OWN_PROFILE,
        Permission.UPDATE_OWN_PROFILE,
        Permission.DELETE_OWN_ACCOUNT,
        Permission.SEND_MESSAGE,
        Permission.EDIT_OWN_MESSAGE,
        Permission.DELETE_OWN_MESSAGE,
        Permission.CREATE_GROUP,
    },
    Role.MODERATOR: {
        Permission.READ_OWN_PROFILE,
        Permission.UPDATE_OWN_PROFILE,
        Permission.DELETE_OWN_ACCOUNT,
        Permission.SEND_MESSAGE,
        Permission.EDIT_OWN_MESSAGE,
        Permission.DELETE_OWN_MESSAGE,
        Permission.CREATE_GROUP,
        Permission.ISSUE_WARNING,
        Permission.TEMPORARY_BAN,
        Permission.REVIEW_REPORTS,
        Permission.VIEW_AUDIT_LOGS,
    },
    Role.ADMIN: set(Permission),
    Role.SUPER_ADMIN: set(Permission),
}


def has_permission(role: str | Role, permission: Permission) -> bool:
    try:
        r = Role(role) if isinstance(role, str) else role
    except ValueError:
        return False
    return permission in ROLE_PERMISSIONS.get(r, set())


def has_min_role(user_role: str | Role, required: Role) -> bool:
    try:
        ur = Role(user_role) if isinstance(user_role, str) else user_role
    except ValueError:
        return False
    return ROLE_HIERARCHY.get(ur, 0) >= ROLE_HIERARCHY.get(required, 99)


def can_moderate(actor_role: str | Role, target_role: str | Role) -> bool:
    try:
        ar = Role(actor_role) if isinstance(actor_role, str) else actor_role
        tr = Role(target_role) if isinstance(target_role, str) else target_role
    except ValueError:
        return False
    return ROLE_HIERARCHY.get(ar, 0) > ROLE_HIERARCHY.get(tr, 0)
