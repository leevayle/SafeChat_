"""User profile endpoints."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from bson import ObjectId
from datetime import datetime, timezone
from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.exceptions import success_response, NotFoundError, ValidationError

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/presence/{user_id}")
async def user_presence(user_id: str, user: dict = Depends(get_current_user)):
    """Online flag (live WS) + last_seen timestamp."""
    from app.websocket.manager import manager
    db = get_database()
    online = manager.is_online(user_id)
    last_seen = None
    if ObjectId.is_valid(user_id):
        doc = await db.users.find_one({"_id": ObjectId(user_id)}, {"last_seen": 1})
        if doc and doc.get("last_seen"):
            ls = doc["last_seen"]
            last_seen = ls.isoformat() if hasattr(ls, "isoformat") else str(ls)
            if isinstance(last_seen, str) and "T" in last_seen and not last_seen.endswith("Z") and "+" not in last_seen[10:]:
                last_seen = last_seen + "Z"
    return success_response(
        "Presence",
        {"user_id": user_id, "online": online, "last_seen": last_seen},
    )



class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=64)
    bio: Optional[str] = Field(None, max_length=256)
    profile_photo: Optional[str] = None


class PrivacySettingsUpdate(BaseModel):
    last_seen: Optional[str] = None
    profile_photo: Optional[str] = None
    status: Optional[str] = None
    read_receipts: Optional[bool] = None


class NotificationSettingsUpdate(BaseModel):
    messages: Optional[bool] = None
    groups: Optional[bool] = None
    calls: Optional[bool] = None
    statuses: Optional[bool] = None
    security: Optional[bool] = None


@router.get("/me")
async def get_my_profile(user: dict = Depends(get_current_user)):
    return success_response(
        "Profile",
        {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "email": user.get("email"),
            "phone_number": user.get("phone_number"),
            "profile_photo": user.get("profile_photo"),
            "bio": user.get("bio"),
            "account_role": user.get("account_role"),
            "account_status": user.get("account_status"),
            "privacy_settings": user.get("privacy_settings"),
            "notification_settings": user.get("notification_settings"),
            "created_at": user.get("created_at").isoformat()
            if user.get("created_at")
            else None,
            "last_seen": user.get("last_seen").isoformat()
            if user.get("last_seen")
            else None,
        },
    )


@router.patch("/me")
async def update_my_profile(
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
):
    updates = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }
    if not updates:
        return success_response("Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    db = get_database()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": updates})
    await db.user_activity_logs.insert_one(
        {
            "user_id": user["id"],
            "event_type": "user",
            "action": "profile_update",
            "resource_type": "user",
            "resource_id": user["id"],
            "timestamp": updates["updated_at"],
            "metadata": {"fields": list(updates.keys())},
        }
    )
    return success_response("Profile updated", updates)


@router.patch("/me/privacy")
async def update_privacy(
    body: PrivacySettingsUpdate,
    user: dict = Depends(get_current_user),
):
    updates = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }
    if not updates:
        return success_response("Nothing to update")
    allowed = {"everyone", "contacts", "nobody"}
    for key in ("last_seen", "profile_photo", "status"):
        if key in updates and updates[key] not in allowed:
            raise ValidationError(f"Invalid value for {key}")
    db = get_database()
    set_ops = {f"privacy_settings.{k}": v for k, v in updates.items()}
    set_ops["updated_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": set_ops})
    return success_response("Privacy settings updated", updates)


@router.patch("/me/notifications")
async def update_notifications(
    body: NotificationSettingsUpdate,
    user: dict = Depends(get_current_user),
):
    updates = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }
    if not updates:
        return success_response("Nothing to update")
    db = get_database()
    set_ops = {f"notification_settings.{k}": v for k, v in updates.items()}
    set_ops["updated_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": set_ops})
    return success_response("Notification settings updated", updates)


@router.get("/me/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    db = get_database()
    cursor = db.sessions.find(
        {"user_id": user["id"], "revoked": False}
    ).sort("created_at", -1)
    sessions = []
    async for s in cursor:
        sessions.append(
            {
                "id": str(s["_id"]),
                "device_id": s.get("device_id"),
                "device_name": s.get("device_name"),
                "user_agent": s.get("user_agent"),
                "ip_address": s.get("ip_address"),
                "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
                "expires_at": s["expires_at"].isoformat() if s.get("expires_at") else None,
            }
        )
    return success_response("Sessions", sessions)


@router.delete("/me/sessions/{session_id}")
async def revoke_session(session_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    if not ObjectId.is_valid(session_id):
        raise ValidationError("Invalid session id")
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id), "user_id": user["id"], "revoked": False},
        {
            "$set": {
                "revoked": True,
                "revoked_at": datetime.now(timezone.utc),
            }
        },
    )
    if result.matched_count == 0:
        raise NotFoundError("Session not found")
    return success_response("Session revoked")


@router.post("/me/deactivate")
async def deactivate_account(
    body: dict = None,
    user: dict = Depends(get_current_user),
):
    """Require password confirmation before deactivating the account."""
    from app.core.security import verify_password
    from app.core.exceptions import UnauthorizedError, ValidationError

    db = get_database()
    password = (body or {}).get("password") if isinstance(body, dict) else None
    if not password:
        raise ValidationError("Password is required")
    full = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not full or not verify_password(password, full.get("password_hash") or ""):
        raise UnauthorizedError("Incorrect password")

    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"account_status": "deactivated", "updated_at": now}},
    )
    await db.sessions.update_many(
        {"user_id": user["id"], "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    return success_response("Account deactivated")


@router.get("/{username}")
async def get_user_by_username(username: str, user: dict = Depends(get_current_user)):
    db = get_database()
    target = await db.users.find_one({"username": username.lower()})
    if not target or target.get("account_status") in ("deleted", "banned"):
        raise NotFoundError("User not found")
    return success_response(
        "User",
        {
            "id": str(target["_id"]),
            "username": target["username"],
            "display_name": target["display_name"],
            "profile_photo": target.get("profile_photo"),
            "bio": target.get("bio"),
        },
    )


@router.get("/search/{query}")
async def search_users(
    query: str,
    user: dict = Depends(get_current_user),
):
    """Simple username / display_name search (min 2 chars)."""
    if len(query.strip()) < 2:
        raise ValidationError("Query must be at least 2 characters")
    db = get_database()
    q = query.strip().lower()
    cursor = (
        db.users.find(
            {
                "$or": [
                    {"username": {"$regex": f"^{q}", "$options": "i"}},
                    {"display_name": {"$regex": q, "$options": "i"}},
                ],
                "account_status": "active",
                "_id": {"$ne": ObjectId(user["id"])},
            }
        )
        .limit(20)
    )
    results = []
    async for u in cursor:
        results.append(
            {
                "id": str(u["_id"]),
                "username": u["username"],
                "display_name": u["display_name"],
                "profile_photo": u.get("profile_photo"),
            }
        )
    return success_response("Search results", results)
