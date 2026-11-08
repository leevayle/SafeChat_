from fastapi import APIRouter, Depends, Query
from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.exceptions import success_response
from datetime import datetime, timezone

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    db = get_database()
    rows = (
        await db.notifications.find({"user_id": user["id"]})
        .sort("created_at", -1)
        .to_list(length=limit)
    )
    out = []
    for n in rows:
        out.append(
            {
                "id": str(n["_id"]),
                "type": n.get("type") or "system",
                "title": n.get("title") or "",
                "body": n.get("body") or "",
                "status_id": n.get("status_id"),
                "actor_id": n.get("actor_id"),
                "actor_name": n.get("actor_name"),
                "actor_photo": n.get("actor_photo"),
                "game_id": n.get("game_id") or (n.get("metadata") or {}).get("game_id"),
                "metadata": n.get("metadata") or {},
                "read": bool(n.get("read")),
                "created_at": (
                    n["created_at"].isoformat()
                    if isinstance(n.get("created_at"), datetime)
                    else n.get("created_at")
                ),
            }
        )
    return success_response("Notifications", out)


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    db = get_database()
    n = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return success_response("Unread", {"count": int(n)})


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId
    db = get_database()
    if ObjectId.is_valid(notif_id):
        await db.notifications.update_one(
            {"_id": ObjectId(notif_id), "user_id": user["id"]},
            {"$set": {"read": True}},
        )
    return success_response("Marked read", {"ok": True})


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    db = get_database()
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return success_response("All read", {"ok": True})
