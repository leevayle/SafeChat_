"""Administrative APIs for SafeChat."""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.api.deps import require_roles
from app.core.database import get_database
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
    success_response,
)
from app.core.permissions import Role, can_moderate
from app.schemas.support import TicketReplyCreate, TicketStatusUpdate
from app.services.support_assignment import assign_pending_support_tickets
from app.services.password_reset_service import PasswordResetService
from app.services.support_service import serialize_ticket, ticket_queue_status
from app.websocket.manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


class ReasonBody(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SubscriptionBody(ReasonBody):
    plan: Literal["pro", "premium"]
    days: int = Field(default=30, ge=1, le=3650)


class RoleRequestBody(ReasonBody):
    user_id: str


class DecisionBody(ReasonBody):
    pass


class ReportDecisionBody(ReasonBody):
    status: Literal["under_review", "resolved", "dismissed"]


class PasswordResetBody(ReasonBody):
    username: str = Field(min_length=3, max_length=32)


def _iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value)


def _public_user(user: dict) -> dict:
    now = datetime.now(timezone.utc)
    plan = user.get("subscription_plan") or "pro"
    expires = user.get("premium_expires_at")
    if plan == "premium" and expires:
        expiry = expires
        if isinstance(expiry, datetime) and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if isinstance(expiry, datetime) and expiry <= now:
            plan = "pro"
    return {
        "id": str(user["_id"]),
        "username": user.get("username"),
        "display_name": user.get("display_name"),
        "email": user.get("email"),
        "phone_number": user.get("phone_number"),
        "account_role": user.get("account_role") or Role.USER.value,
        "account_status": user.get("account_status") or "active",
        "subscription_plan": plan,
        "premium_expires_at": _iso(expires),
        "verification_status": user.get("verification_status") or "unverified",
        "verified_badge": bool(
            (user.get("premium_settings") or {}).get(
                "verified_badge", plan == "premium"
            )
        ),
        "created_at": _iso(user.get("created_at")),
        "last_seen": _iso(user.get("last_seen")),
        "online": manager.is_online(str(user["_id"])),
    }


async def _write_audit(
    actor: dict, action: str, resource_type: str, resource_id: str, metadata: dict
) -> None:
    now = datetime.now(timezone.utc)
    await get_database().system_audit_logs.insert_one(
        {
            "actor_id": actor["id"],
            "actor_username": actor.get("username"),
            "actor_role": actor.get("account_role"),
            "action_type": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "metadata": metadata,
            "timestamp": now,
        }
    )


def _object_id(raw_id: str) -> ObjectId:
    if not ObjectId.is_valid(raw_id):
        raise ValidationError("Invalid user id")
    return ObjectId(raw_id)


async def _get_managed_user(raw_id: str, actor: dict, *, allow_self: bool = False) -> dict:
    target_id = _object_id(raw_id)
    if not allow_self and str(target_id) == actor["id"]:
        raise ForbiddenError("You cannot perform this action on your own account")
    target = await get_database().users.find_one({"_id": target_id})
    if not target:
        raise NotFoundError("User not found")
    target_role = target.get("account_role") or Role.USER.value
    if not can_moderate(actor.get("account_role", Role.USER.value), target_role):
        raise ForbiddenError("You cannot manage an account at this role level")
    return target


@router.get("/overview")
async def overview(user: dict = Depends(require_roles(Role.ADMIN))):
    db = get_database()
    now = datetime.now(timezone.utc)
    online_ids = manager.online_user_ids
    (
        users,
        active,
        deactivated,
        banned,
        pending_review,
        premium,
        payments,
        paid_30d,
        open_reports,
        open_support_tickets,
    ) = await asyncio.gather(
        db.users.count_documents({}),
        db.users.count_documents({"account_status": "active"}),
        db.users.count_documents({"account_status": "deactivated"}),
        db.users.count_documents({"account_status": "banned"}),
        db.users.count_documents({"account_status": "pending_review"}),
        db.users.count_documents(
            {
                "subscription_plan": "premium",
                "$or": [
                    {"premium_expires_at": None},
                    {"premium_expires_at": {"$gt": now}},
                ],
            }
        ),
        db.payments.count_documents({}),
        db.payments.count_documents(
            {"status": "paid", "paid_at": {"$gte": now - timedelta(days=30)}}
        ),
        db.reports.count_documents({"status": {"$in": ["open", "pending"]}}),
        db.support_tickets.count_documents(
            {"status": {"$in": ["pending", "in_progress", "open", "replied"]}}
        ),
    )
    return success_response(
        "Admin overview",
        {
            "users": {
                "total": users,
                "active": active,
                "online": len(online_ids),
                "deactivated": deactivated,
                "banned": banned,
                "pending_review": pending_review,
                "premium": premium,
                "pro": max(0, users - premium),
            },
            "payments": {"total": payments, "paid_last_30_days": paid_30d},
            "reports_open": open_reports,
            "support_tickets_open": open_support_tickets,
        },
    )


@router.get("/health")
async def admin_health(user: dict = Depends(require_roles(Role.ADMIN))):
    db = get_database()
    try:
        await db.command("ping")
        mongodb = "online"
    except PyMongoError:
        logger.exception("Admin health check could not reach MongoDB")
        mongodb = "offline"
    return success_response(
        "Service health",
        {
            "api": "online",
            "mongodb": mongodb,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        },
    )


@router.put("/presence")
async def update_admin_presence(user: dict = Depends(require_roles(Role.ADMIN))):
    db = get_database()
    now = datetime.now(timezone.utc)
    await db.admin_presence.update_one(
        {"_id": user["id"]},
        {"$set": {"last_seen": now}},
        upsert=True,
    )
    assignments = await assign_pending_support_tickets(db, now)
    assigned_to_you = sum(item["admin_id"] == user["id"] for item in assignments)
    return success_response(
        "Admin presence updated",
        {"assigned_to_you": assigned_to_you},
    )


@router.delete("/presence")
async def clear_admin_presence(user: dict = Depends(require_roles(Role.ADMIN))):
    await get_database().admin_presence.delete_one({"_id": user["id"]})
    return success_response("Admin presence cleared")


@router.get("/users")
async def list_users(
    q: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None),
    plan: Literal["pro", "premium"] | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    db = get_database()
    now = datetime.now(timezone.utc)
    filters: dict = {}
    conditions = []
    if status:
        if status not in {"active", "deactivated", "banned", "pending_review", "deleted"}:
            raise ValidationError("Invalid account status filter")
        filters["account_status"] = status
    if q and q.strip():
        term = re.escape(q.strip())
        conditions.append(
            {
                "$or": [
                    {"username": {"$regex": term, "$options": "i"}},
                    {"display_name": {"$regex": term, "$options": "i"}},
                    {"email": {"$regex": term, "$options": "i"}},
                    {"phone_number": {"$regex": term, "$options": "i"}},
                ]
            }
        )
    if plan == "premium":
        conditions.append({"subscription_plan": "premium"})
        conditions.append(
            {
                "$or": [
                    {"premium_expires_at": None},
                    {"premium_expires_at": {"$gt": now}},
                ]
            }
        )
    elif plan == "pro":
        conditions.append(
            {
                "$or": [
                    {"subscription_plan": {"$ne": "premium"}},
                    {"premium_expires_at": {"$lte": now}},
                ]
            }
        )
    if conditions:
        filters["$and"] = conditions
    total = await db.users.count_documents(filters)
    cursor = (
        db.users.find(filters)
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    users = [_public_user(row) async for row in cursor]
    return success_response(
        "Users",
        {"items": users, "total": total, "page": page, "page_size": page_size},
    )


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    body: ReasonBody,
    status: Literal["active", "deactivated", "banned"],
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    target = await _get_managed_user(user_id, user)
    now = datetime.now(timezone.utc)
    target_id = str(target["_id"])
    await get_database().users.update_one(
        {"_id": target["_id"]},
        {"$set": {"account_status": status, "updated_at": now}},
    )
    if status != "active":
        await get_database().sessions.update_many(
            {"user_id": target_id, "revoked": False},
            {"$set": {"revoked": True, "revoked_at": now}},
        )
    await _write_audit(
        user,
        "account_status_changed",
        "user",
        target_id,
        {"status": status, "reason": body.reason},
    )
    return success_response("Account status updated", {"user_id": target_id, "status": status})


@router.patch("/users/{user_id}/subscription")
async def update_subscription(
    user_id: str,
    body: SubscriptionBody,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    target = await _get_managed_user(user_id, user)
    now = datetime.now(timezone.utc)
    updates = {
        "subscription_plan": body.plan,
        "premium_expires_at": now + timedelta(days=body.days) if body.plan == "premium" else None,
        "updated_at": now,
    }
    if body.plan == "premium":
        updates["premium_settings.verified_badge"] = bool(
            (target.get("premium_settings") or {}).get("verified_badge", True)
        )
    await get_database().users.update_one({"_id": target["_id"]}, {"$set": updates})
    target_id = str(target["_id"])
    await _write_audit(
        user,
        "subscription_changed",
        "user",
        target_id,
        {"plan": body.plan, "days": body.days if body.plan == "premium" else None, "reason": body.reason},
    )
    return success_response(
        "Subscription updated",
        {
            "user_id": target_id,
            "subscription_plan": body.plan,
            "premium_expires_at": _iso(updates["premium_expires_at"]),
        },
    )


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_user_sessions(
    user_id: str,
    body: ReasonBody,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    target = await _get_managed_user(user_id, user)
    now = datetime.now(timezone.utc)
    target_id = str(target["_id"])
    result = await get_database().sessions.update_many(
        {"user_id": target_id, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    await _write_audit(
        user,
        "user_sessions_revoked",
        "user",
        target_id,
        {"revoked_count": result.modified_count, "reason": body.reason},
    )
    return success_response(
        "User sessions revoked",
        {"user_id": target_id, "revoked_count": result.modified_count},
    )


@router.post("/users/reset-password")
async def reset_user_password(
    body: PasswordResetBody,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    db = get_database()
    username = body.username.strip().lower()
    target_record = await db.users.find_one({"username": username})
    if not target_record:
        raise NotFoundError("User not found")
    target = await _get_managed_user(str(target_record["_id"]), user)
    temporary_password, revoked_sessions = await PasswordResetService.issue_token(
        target,
        invalidate_sessions=True,
    )
    target_id = str(target["_id"])
    await _write_audit(
        user,
        "user_password_reset",
        "user",
        target_id,
        {
            "username": target.get("username"),
            "reason": body.reason,
            "revoked_sessions": revoked_sessions,
            "email_sent": True,
        },
    )
    return success_response(
        "Password reset successfully",
        {
            "username": target.get("username"),
            "temporary_password": temporary_password,
            "revoked_sessions": revoked_sessions,
        },
    )


@router.post("/users/{user_id}/revoke-admin")
async def revoke_admin_role(
    user_id: str,
    body: ReasonBody,
    user: dict = Depends(require_roles(Role.SUPER_ADMIN)),
):
    target = await _get_managed_user(user_id, user)
    if target.get("account_role") != Role.ADMIN.value:
        raise ConflictError("Only an administrator role can be revoked")
    db = get_database()
    latest_grant = await db.admin_role_requests.find_one(
        {"target_user_id": str(target["_id"]), "status": "approved"},
        sort=[("decided_at", -1)],
    )
    previous_role = (latest_grant or {}).get("previous_role")
    if previous_role not in {Role.USER.value, Role.MODERATOR.value}:
        previous_role = Role.USER.value
    now = datetime.now(timezone.utc)
    target_id = str(target["_id"])
    changed = await db.users.update_one(
        {"_id": target["_id"], "account_role": Role.ADMIN.value},
        {"$set": {"account_role": previous_role, "updated_at": now}},
    )
    if changed.modified_count != 1:
        raise ConflictError("The administrator role changed before it could be revoked")
    revoked_sessions = await db.sessions.update_many(
        {"user_id": target_id, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    await _write_audit(
        user,
        "admin_role_revoked",
        "user",
        target_id,
        {
            "previous_role": previous_role,
            "revoked_sessions": revoked_sessions.modified_count,
            "reason": body.reason,
        },
    )
    return success_response(
        "Admin role revoked",
        {"user_id": target_id, "account_role": previous_role},
    )


@router.get("/payments")
async def list_payments(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    db = get_database()
    filters = {"status": status} if status else {}
    total = await db.payments.count_documents(filters)
    cursor = (
        db.payments.find(filters)
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    rows = [row async for row in cursor]
    ids = [ObjectId(row["user_id"]) for row in rows if ObjectId.is_valid(row.get("user_id", ""))]
    users_by_id = {}
    if ids:
        users_by_id = {
            str(row["_id"]): row
            async for row in db.users.find(
                {"_id": {"$in": ids}}, {"username": 1, "display_name": 1}
            )
        }
    items = [
        {
            "id": str(row["_id"]),
            "user_id": row.get("user_id"),
            "username": users_by_id.get(row.get("user_id"), {}).get("username"),
            "display_name": users_by_id.get(row.get("user_id"), {}).get("display_name"),
            "provider": row.get("provider"),
            "plan": row.get("plan"),
            "amount": row.get("amount"),
            "currency": row.get("currency") or "KES",
            "status": row.get("status"),
            "checkout_request_id": row.get("checkout_request_id"),
            "created_at": _iso(row.get("created_at")),
            "paid_at": _iso(row.get("paid_at")),
        }
        for row in rows
    ]
    return success_response(
        "Payments", {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@router.get("/role-requests")
async def list_role_requests(
    status: Literal["pending", "approved", "rejected"] | None = Query(default=None),
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    db = get_database()
    filters = {"status": status} if status else {}
    cursor = db.admin_role_requests.find(filters).sort("created_at", -1).limit(100)
    requests = [row async for row in cursor]
    ids = []
    for row in requests:
        for key in ("target_user_id", "requested_by", "decided_by"):
            raw_id = row.get(key)
            if ObjectId.is_valid(raw_id or ""):
                ids.append(ObjectId(raw_id))
    users = {
        str(row["_id"]): row
        async for row in db.users.find(
            {"_id": {"$in": ids}}, {"username": 1, "display_name": 1, "account_role": 1}
        )
    } if ids else {}
    result = []
    for row in requests:
        target = users.get(row.get("target_user_id"), {})
        requester = users.get(row.get("requested_by"), {})
        result.append(
            {
                "id": str(row["_id"]),
                "target_user_id": row.get("target_user_id"),
                "target_username": target.get("username"),
                "target_role": target.get("account_role"),
                "requested_by": row.get("requested_by"),
                "requester_username": requester.get("username"),
                "reason": row.get("reason"),
                "status": row.get("status"),
                "created_at": _iso(row.get("created_at")),
                "decided_at": _iso(row.get("decided_at")),
                "decision_reason": row.get("decision_reason"),
            }
        )
    return success_response("Role requests", result)


@router.post("/role-requests")
async def request_admin_role(
    body: RoleRequestBody,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    target_id = _object_id(body.user_id)
    target = await get_database().users.find_one({"_id": target_id})
    if not target:
        raise NotFoundError("User not found")
    if target.get("account_status", "active") != "active":
        raise ValidationError("Only active accounts can be nominated")
    if target.get("account_role") in {Role.ADMIN.value, Role.SUPER_ADMIN.value}:
        raise ConflictError("This user already has an administrative role")
    db = get_database()
    existing = await db.admin_role_requests.find_one(
        {"target_user_id": str(target_id), "status": "pending"}
    )
    if existing:
        raise ConflictError("A pending admin-role request already exists for this user")
    now = datetime.now(timezone.utc)
    try:
        result = await db.admin_role_requests.insert_one(
            {
                "target_user_id": str(target_id),
                "pending_target_user_id": str(target_id),
                "requested_by": user["id"],
                "reason": body.reason,
                "status": "pending",
                "created_at": now,
            }
        )
    except DuplicateKeyError as exc:
        raise ConflictError("A pending admin-role request already exists for this user") from exc
    await _write_audit(
        user,
        "admin_role_requested",
        "user",
        str(target_id),
        {"request_id": str(result.inserted_id), "reason": body.reason},
    )
    return success_response("Admin role request submitted for superadmin approval")


@router.post("/role-requests/{request_id}/approve")
async def approve_admin_role_request(
    request_id: str,
    body: DecisionBody,
    user: dict = Depends(require_roles(Role.SUPER_ADMIN)),
):
    if not ObjectId.is_valid(request_id):
        raise ValidationError("Invalid request id")
    db = get_database()
    request = await db.admin_role_requests.find_one(
        {"_id": ObjectId(request_id), "status": "pending"}
    )
    if not request:
        raise NotFoundError("Pending role request not found")
    target_id = _object_id(request.get("target_user_id", ""))
    target = await db.users.find_one({"_id": target_id})
    if (
        not target
        or target.get("account_status", "active") != "active"
        or target.get("account_role") not in {Role.USER.value, Role.MODERATOR.value}
    ):
        raise ConflictError("The nominated account is no longer eligible for admin access")
    now = datetime.now(timezone.utc)
    claimed = await db.admin_role_requests.update_one(
        {"_id": request["_id"], "status": "pending"},
        {"$set": {"status": "processing", "decided_by": user["id"], "decided_at": now}},
    )
    if claimed.modified_count != 1:
        raise ConflictError("This role request has already been processed")
    changed = await db.users.update_one(
        {
            "_id": target_id,
            "account_status": "active",
            "account_role": {"$in": [Role.USER.value, Role.MODERATOR.value]},
        },
        {"$set": {"account_role": Role.ADMIN.value, "updated_at": now}},
    )
    if changed.modified_count != 1:
        await db.admin_role_requests.update_one(
            {"_id": request["_id"], "status": "processing"},
            {"$set": {"status": "pending"}, "$unset": {"decided_by": "", "decided_at": ""}},
        )
        raise ConflictError("The nominated account changed while the request was being approved")
    await db.admin_role_requests.update_one(
        {"_id": request["_id"], "status": "processing"},
        {
            "$set": {
                "status": "approved",
                "decided_by": user["id"],
                "decided_at": now,
                "decision_reason": body.reason,
                "previous_role": target.get("account_role") or Role.USER.value,
            },
            "$unset": {"pending_target_user_id": ""},
        },
    )
    await _write_audit(
        user,
        "admin_role_approved",
        "user",
        str(target_id),
        {"request_id": request_id, "reason": body.reason},
    )
    return success_response("Admin role approved", {"user_id": str(target_id), "account_role": Role.ADMIN.value})


@router.post("/role-requests/{request_id}/reject")
async def reject_admin_role_request(
    request_id: str,
    body: DecisionBody,
    user: dict = Depends(require_roles(Role.SUPER_ADMIN)),
):
    if not ObjectId.is_valid(request_id):
        raise ValidationError("Invalid request id")
    now = datetime.now(timezone.utc)
    result = await get_database().admin_role_requests.update_one(
        {"_id": ObjectId(request_id), "status": "pending"},
        {
            "$set": {
                "status": "rejected",
                "decided_by": user["id"],
                "decided_at": now,
                "decision_reason": body.reason,
            },
            "$unset": {"pending_target_user_id": ""},
        },
    )
    if result.modified_count != 1:
        raise NotFoundError("Pending role request not found")
    await _write_audit(
        user,
        "admin_role_rejected",
        "admin_role_request",
        request_id,
        {"reason": body.reason},
    )
    return success_response("Admin role request rejected")


@router.get("/audit")
async def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    collection = get_database().system_audit_logs
    total = await collection.count_documents({})
    cursor = (
        collection.find({})
        .sort("timestamp", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    rows = [row async for row in cursor]
    actor_ids = [
        ObjectId(row["actor_id"])
        for row in rows
        if ObjectId.is_valid(row.get("actor_id", ""))
    ]
    actor_users = {
        str(row["_id"]): row.get("username")
        async for row in get_database().users.find(
            {"_id": {"$in": actor_ids}}, {"username": 1}
        )
    } if actor_ids else {}
    items = []
    for row in rows:
        actor_id = row.get("actor_id")
        items.append(
            {
                "id": str(row["_id"]),
                "actor_id": actor_id,
                "actor_username": row.get("actor_username")
                or actor_users.get(actor_id),
                "actor_role": row.get("actor_role"),
                "action": row.get("action_type"),
                "resource_type": row.get("resource_type"),
                "resource_id": row.get("resource_id"),
                "metadata": row.get("metadata") or {},
                "timestamp": _iso(row.get("timestamp")),
            }
        )
    return success_response(
        "Audit logs", {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@router.get("/support/tickets")
async def list_support_tickets(
    status: Literal["pending", "in_progress", "closed"] | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    db = get_database()
    filters: dict = {}
    if user.get("account_role") != Role.SUPER_ADMIN.value:
        filters["assigned_admin_id"] = user["id"]
    if status == "pending":
        status_filter = {
            "$or": [
                {"status": "pending"},
                {
                    "status": {"$in": ["open", "replied"]},
                    "assigned_admin_id": None,
                },
            ]
        }
    elif status == "in_progress":
        status_filter = {
            "$or": [
                {"status": "in_progress"},
                {
                    "status": {"$in": ["open", "replied"]},
                    "assigned_admin_id": {"$ne": None},
                },
            ]
        }
    elif status == "closed":
        status_filter = {"status": "closed"}
    else:
        status_filter = {}
    if filters and status_filter:
        filters = {"$and": [filters, status_filter]}
    elif status_filter:
        filters = status_filter

    total = await db.support_tickets.count_documents(filters)
    cursor = (
        db.support_tickets.find(filters)
        .sort("updated_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    tickets = [ticket async for ticket in cursor]
    user_ids = set()
    for ticket in tickets:
        for raw_id in (ticket.get("user_id"), ticket.get("assigned_admin_id")):
            if ObjectId.is_valid(str(raw_id or "")):
                user_ids.add(ObjectId(str(raw_id)))
    users = {
        str(row["_id"]): row
        async for row in db.users.find(
            {"_id": {"$in": list(user_ids)}},
            {"username": 1, "display_name": 1},
        )
    } if user_ids else {}
    items = []
    for ticket in tickets:
        item = serialize_ticket(ticket, admin_view=True)
        ticket_owner = users.get(item["user_id"], {})
        item["username"] = ticket_owner.get("username")
        item["display_name"] = ticket_owner.get("display_name")
        if not item["assigned_admin_username"] and item["assigned_admin_id"]:
            item["assigned_admin_username"] = users.get(
                item["assigned_admin_id"], {}
            ).get("username")
        items.append(item)
    return success_response(
        "Support inbox",
        {"items": items, "total": total, "page": page, "page_size": page_size},
    )


@router.post("/support/tickets/{ticket_id}/replies")
async def reply_to_support_ticket(
    ticket_id: str,
    body: TicketReplyCreate,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    if not ObjectId.is_valid(ticket_id):
        raise ValidationError("Invalid ticket id")
    db = get_database()
    ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
    if not ticket:
        raise NotFoundError("Support ticket not found")
    if (
        user.get("account_role") != Role.SUPER_ADMIN.value
        and ticket.get("assigned_admin_id") != user["id"]
    ):
        raise NotFoundError("Support ticket not found")
    if ticket_queue_status(ticket) == "closed":
        raise ConflictError("Reopen this ticket before replying")

    now = datetime.now(timezone.utc)
    reply = {
        "id": str(ObjectId()),
        "author_role": user.get("account_role", Role.ADMIN.value),
        "author_username": user.get("username"),
        "body": body.body.strip(),
        "created_at": now,
    }
    update_fields = {
        "status": "in_progress",
        "last_reply_role": "ADMIN",
        "updated_at": now,
    }
    update_operations: dict = {"$push": {"replies": reply}}
    assignment = None
    update_filter: dict = {"_id": ticket["_id"], "status": {"$ne": "closed"}}
    if not ticket.get("assigned_admin_id"):
        assignment = {
            "admin_id": user["id"],
            "username": user.get("username"),
            "assigned_at": now,
            "assigned_by": "SUPER_ADMIN",
        }
        update_fields.update(
            {
                "assigned_admin_id": user["id"],
                "assigned_admin_username": user.get("username"),
                "assigned_at": now,
            }
        )
        update_operations["$push"]["assignment_history"] = assignment
        update_filter["assigned_admin_id"] = None
    update_operations["$set"] = update_fields
    if user.get("account_role") != Role.SUPER_ADMIN.value:
        update_filter["assigned_admin_id"] = user["id"]
    result = await db.support_tickets.update_one(
        update_filter,
        update_operations,
    )
    if result.modified_count != 1:
        raise ConflictError("The ticket changed before your reply could be sent")
    ticket.setdefault("replies", []).append(reply)
    ticket.update(update_fields)
    if assignment:
        ticket.setdefault("assignment_history", []).append(assignment)
    await _write_audit(
        user,
        "support_ticket_replied",
        "support_ticket",
        ticket_id,
        {"reply_id": reply["id"]},
    )
    return success_response(
        "Support reply sent", serialize_ticket(ticket, admin_view=True)
    )


@router.patch("/support/tickets/{ticket_id}/status")
async def update_support_ticket_status(
    ticket_id: str,
    body: TicketStatusUpdate,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    if not ObjectId.is_valid(ticket_id):
        raise ValidationError("Invalid ticket id")
    db = get_database()
    ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
    if not ticket:
        raise NotFoundError("Support ticket not found")
    if (
        user.get("account_role") != Role.SUPER_ADMIN.value
        and ticket.get("assigned_admin_id") != user["id"]
    ):
        raise NotFoundError("Support ticket not found")

    now = datetime.now(timezone.utc)
    next_status = (
        "closed"
        if body.status == "closed"
        else "in_progress" if ticket.get("assigned_admin_id") else "pending"
    )
    update_filter: dict = {"_id": ticket["_id"]}
    if user.get("account_role") != Role.SUPER_ADMIN.value:
        update_filter["assigned_admin_id"] = user["id"]
    result = await db.support_tickets.update_one(
        update_filter,
        {"$set": {"status": next_status, "updated_at": now}},
    )
    if result.matched_count != 1:
        raise NotFoundError("Support ticket not found")
    await _write_audit(
        user,
        "support_ticket_status_changed",
        "support_ticket",
        ticket_id,
        {"status": next_status, "reason": body.reason},
    )
    return success_response("Ticket status updated", {"status": next_status})


@router.get("/reports")
async def list_reports(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    db = get_database()
    filters = {"status": status} if status else {}
    total = await db.reports.count_documents(filters)
    cursor = (
        db.reports.find(
            filters,
            {"reporter_id": 1, "target_type": 1, "target_id": 1, "reason": 1, "status": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        {
            "id": str(row["_id"]),
            "reporter_id": row.get("reporter_id"),
            "target_type": row.get("target_type"),
            "target_id": row.get("target_id"),
            "reason": row.get("reason"),
            "status": row.get("status"),
            "created_at": _iso(row.get("created_at")),
        }
        async for row in cursor
    ]
    return success_response(
        "Reports", {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@router.patch("/reports/{report_id}")
async def update_report(
    report_id: str,
    body: ReportDecisionBody,
    user: dict = Depends(require_roles(Role.ADMIN)),
):
    if not ObjectId.is_valid(report_id):
        raise ValidationError("Invalid report id")
    now = datetime.now(timezone.utc)
    result = await get_database().reports.update_one(
        {"_id": ObjectId(report_id)},
        {"$set": {"status": body.status, "reviewed_by": user["id"], "reviewed_at": now}},
    )
    if result.matched_count != 1:
        raise NotFoundError("Report not found")
    await _write_audit(
        user,
        "report_reviewed",
        "report",
        report_id,
        {"status": body.status, "reason": body.reason},
    )
    return success_response("Report updated", {"status": body.status})


# ── Database backups ──────────────────────────────────────────────────────────

class BackupStartBody(BaseModel):
    scope: Literal[
        "full",
        "messages",
        "conversations",
        "users",
        "contacts",
        "support",
        "payments",
        "status",
        "groups",
        "audit",
        "notes",
    ] = "full"
    until: str | None = Field(
        default=None,
        description="ISO-8601 cutoff. Only documents at or before this time are included. Omit for 'now'.",
    )


@router.get("/backups/scopes")
async def backup_scopes(user: dict = Depends(require_roles(Role.ADMIN))):
    from app.services.backup_service import BACKUP_SCOPES

    return success_response(
        "Backup scopes",
        {
            "scopes": [
                {
                    "id": key,
                    "collections": value if value is not None else ["*"],
                    "label": key.replace("_", " ").title(),
                }
                for key, value in BACKUP_SCOPES.items()
            ]
        },
    )


@router.get("/backups")
async def list_backups(user: dict = Depends(require_roles(Role.ADMIN))):
    from app.services.backup_service import list_backup_files, list_jobs

    return success_response(
        "Backups",
        {"files": list_backup_files(), "jobs": list_jobs(30)},
    )


@router.get("/backups/jobs/{job_id}")
async def backup_job_status(job_id: str, user: dict = Depends(require_roles(Role.ADMIN))):
    from app.services.backup_service import get_job

    job = get_job(job_id)
    if not job:
        raise NotFoundError("Backup job not found")
    return success_response("Backup job", job)


@router.post("/backups")
async def start_backup(body: BackupStartBody, user: dict = Depends(require_roles(Role.ADMIN))):
    from app.services.backup_service import start_backup as _start

    try:
        job = await _start(
            scope=body.scope,
            until=body.until,
            triggered_by=user.get("username") or user.get("id") or "admin",
        )
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc
    await _write_audit(
        user,
        "backup_started",
        "backup",
        job["id"],
        {"scope": body.scope, "until": body.until},
    )
    return success_response("Backup started", job)


@router.get("/backups/download/{filename}")
async def download_backup(filename: str, user: dict = Depends(require_roles(Role.ADMIN))):
    from fastapi.responses import FileResponse
    from app.services.backup_service import backup_file_path

    path = backup_file_path(filename)
    if not path:
        raise NotFoundError("Backup file not found")
    return FileResponse(
        path,
        media_type="application/gzip",
        filename=filename,
    )


@router.delete("/backups/{filename}")
async def delete_backup(filename: str, user: dict = Depends(require_roles(Role.ADMIN))):
    from app.services.backup_service import delete_backup_file

    ok = delete_backup_file(filename)
    if not ok:
        raise NotFoundError("Backup file not found")
    await _write_audit(user, "backup_deleted", "backup", filename, {})
    return success_response("Backup deleted", {"filename": filename})
