"""Status (stories) service — batched lookups for feed and viewers."""
from datetime import datetime, timezone, timedelta
from pymongo.errors import DuplicateKeyError
from typing import List, Optional, Dict, Any
from bson import ObjectId
from app.core.database import get_database
from app.core.exceptions import (
    NotFoundError,
    ForbiddenError,
    ValidationError,
)
from app.models.status import StatusType, StatusVisibility
from app.models.contact import ContactStatus
import logging

logger = logging.getLogger(__name__)


class StatusService:

    @staticmethod
    async def _eligible_peer_ids(db, owner_id: str, status_doc: dict) -> List[str]:
        """Contacts who should receive a live status_new / status_delete event."""
        vis = (status_doc.get("visibility") or "contacts").lower()
        selected = status_doc.get("selected_viewer_ids") or []
        if vis in ("selected", "selected_contacts") and selected:
            return [str(x) for x in selected if str(x) != str(owner_id)]
        # Default: people who have the owner as an accepted contact (they can see the feed)
        peers: List[str] = []
        async for c in db.contacts.find(
            {
                "contact_user_id": owner_id,
                "contact_status": ContactStatus.ACCEPTED.value,
            },
            {"owner_user_id": 1},
        ):
            oid = c.get("owner_user_id")
            if oid and str(oid) != str(owner_id):
                peers.append(str(oid))
        # Also owner side contacts (symmetric apps often store one direction)
        async for c in db.contacts.find(
            {
                "owner_user_id": owner_id,
                "contact_status": ContactStatus.ACCEPTED.value,
            },
            {"contact_user_id": 1},
        ):
            cid = c.get("contact_user_id")
            if cid and str(cid) != str(owner_id):
                peers.append(str(cid))
        # Unique
        return list(dict.fromkeys(peers))

    @staticmethod
    async def _ws_send_users(user_ids: List[str], payload: dict) -> None:
        try:
            from app.websocket.manager import manager
            for uid in user_ids:
                await manager.send_user(str(uid), payload)
        except Exception:
            logger.debug("status ws fanout failed", exc_info=True)

    @staticmethod
    async def create_status(
        owner_id: str,
        content: Optional[str] = None,
        status_type: str = "text",
        media_attachments: Optional[List[Dict]] = None,
        visibility: str = "contacts",
        selected_viewer_ids: Optional[List[str]] = None,
        expires_in_hours: int = 24,
        background: Optional[str] = None,
    ) -> dict:
        try:
            st = StatusType(status_type)
        except ValueError:
            raise ValidationError(f"Invalid status_type: {status_type}")
        try:
            vis = StatusVisibility(visibility)
        except ValueError:
            raise ValidationError(f"Invalid visibility: {visibility}")

        if st == StatusType.TEXT and not content:
            raise ValidationError("Text status requires content")

        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=min(max(expires_in_hours, 1), 168))
        doc = {
            "owner_user_id": owner_id,
            "content": content,
            "media_attachments": media_attachments or [],
            "visibility": vis.value,
            "selected_viewer_ids": selected_viewer_ids or [],
            "created_at": now,
            "background": background or "solid_1",
            "expires_at": expires,
            "status_type": st.value,
        }
        db = get_database()
        result = await db.statuses.insert_one(doc)
        doc["_id"] = result.inserted_id

        await db.user_activity_logs.insert_one(
            {
                "user_id": owner_id,
                "event_type": "status",
                "action": "created",
                "resource_type": "status",
                "resource_id": str(result.inserted_id),
                "timestamp": now,
                "metadata": {},
            }
        )
        serialized = StatusService._serialize(doc)
        serialized["viewer_ids"] = []
        serialized["view_count"] = 0
        # Attach owner profile for instant client render
        try:
            owner = await db.users.find_one(
                {"_id": ObjectId(owner_id)},
                {"username": 1, "display_name": 1, "profile_photo": 1},
            )
            if owner:
                serialized["owner"] = {
                    "id": owner_id,
                    "username": owner.get("username"),
                    "display_name": owner.get("display_name"),
                    "profile_photo": owner.get("profile_photo"),
                }
                serialized["owner_user_id"] = owner_id
        except Exception:
            pass
        # Live push to contacts — no refresh needed
        try:
            peers = await StatusService._eligible_peer_ids(db, owner_id, doc)
            await StatusService._ws_send_users(
                peers,
                {"t": "status_new", "status": serialized},
            )
        except Exception:
            logger.debug("status_new fanout failed", exc_info=True)
        return serialized

    @staticmethod
    async def _contact_ids(db, viewer_id: str) -> List[str]:
        ids: List[str] = []
        async for c in db.contacts.find(
            {
                "owner_user_id": viewer_id,
                "contact_status": ContactStatus.ACCEPTED.value,
            },
            {"contact_user_id": 1},
        ):
            ids.append(c["contact_user_id"])
        return ids

    @staticmethod
    async def get_feed(viewer_id: str) -> List[dict]:
        """Statuses from contacts that are still valid and visible to viewer."""
        db = get_database()
        now = datetime.now(timezone.utc)
        contact_ids = await StatusService._contact_ids(db, viewer_id)
        owner_filter = {"$in": contact_ids + [viewer_id]}

        rows = (
            await db.statuses.find(
                {
                    "owner_user_id": owner_filter,
                    "expires_at": {"$gt": now},
                }
            )
            .sort("created_at", 1)
            .to_list(length=500)
        )

        visible = [
            s
            for s in rows
            if StatusService._can_view_sync(s, viewer_id, contact_ids)
        ]
        return await StatusService._enrich_many(db, visible)

    @staticmethod
    async def get_user_statuses(owner_id: str, viewer_id: str) -> List[dict]:
        db = get_database()
        now = datetime.now(timezone.utc)
        contact_ids = await StatusService._contact_ids(db, viewer_id)
        rows = (
            await db.statuses.find(
                {"owner_user_id": owner_id, "expires_at": {"$gt": now}}
            )
            .sort("created_at", 1)
            .to_list(length=100)
        )
        visible = [
            s
            for s in rows
            if StatusService._can_view_sync(s, viewer_id, contact_ids)
        ]
        return await StatusService._enrich_many(db, visible)

    @staticmethod
    async def view_status(status_id: str, viewer_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        now = datetime.now(timezone.utc)
        expires = s["expires_at"]
        if getattr(expires, "tzinfo", None) is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            raise NotFoundError("Status expired")

        contact_ids = await StatusService._contact_ids(db, viewer_id)
        if not StatusService._can_view_sync(s, viewer_id, contact_ids):
            raise ForbiddenError("Not allowed to view this status")

        if s["owner_user_id"] != viewer_id:
            try:
                result = await db.status_views.update_one(
                    {"status_id": status_id, "viewer_id": viewer_id},
                    {
                        "$setOnInsert": {
                            "status_id": status_id,
                            "viewer_id": viewer_id,
                            "viewed_at": now,
                        }
                    },
                    upsert=True,
                )
            except DuplicateKeyError:
                # Parallel first-view race under unique index — treat as existing view
                class _R:
                    upserted_id = None
                result = _R()
            # Notify owner of a new unique view so their count updates live
            if result.upserted_id is not None:
                try:
                    from app.websocket.manager import manager
                    viewer = await db.users.find_one(
                        {"_id": ObjectId(viewer_id)},
                        {"username": 1, "display_name": 1, "profile_photo": 1},
                    )
                    # Count after insert
                    view_count = await db.status_views.count_documents({"status_id": status_id})
                    await manager.send_user(
                        str(s["owner_user_id"]),
                        {
                            "t": "status_view",
                            "status_id": status_id,
                            "view_count": view_count,
                            "viewer": {
                                "viewer_id": viewer_id,
                                "username": (viewer or {}).get("username"),
                                "display_name": (viewer or {}).get("display_name"),
                                "profile_photo": (viewer or {}).get("profile_photo"),
                                "viewed_at": now.isoformat(),
                                "liked": False,
                            },
                        },
                    )
                except Exception:
                    pass

        enriched = await StatusService._enrich_many(db, [s])
        return enriched[0]

    @staticmethod
    async def delete_status(status_id: str, user_id: str) -> None:
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        if s["owner_user_id"] != user_id:
            raise ForbiddenError("Can only delete your own status")
        await db.statuses.delete_one({"_id": ObjectId(status_id)})
        await db.status_views.delete_many({"status_id": status_id})
        try:
            peers = await StatusService._eligible_peer_ids(db, user_id, s)
            await StatusService._ws_send_users(
                peers + [user_id],
                {"t": "status_delete", "status_id": status_id, "owner_id": user_id},
            )
        except Exception:
            logger.debug("status_delete fanout failed", exc_info=True)

    @staticmethod
    async def list_viewers(status_id: str, owner_id: str) -> List[dict]:
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        if s["owner_user_id"] != owner_id:
            raise ForbiddenError("Only owner can see viewers")

        views = await db.status_views.find({"status_id": status_id}).to_list(length=500)
        if not views:
            return []
        viewer_ids = [v["viewer_id"] for v in views]
        oids = [ObjectId(i) for i in viewer_ids if ObjectId.is_valid(i)]
        users: Dict[str, dict] = {}
        if oids:
            async for u in db.users.find(
                {"_id": {"$in": oids}},
                {"username": 1, "display_name": 1, "profile_photo": 1},
            ):
                users[str(u["_id"])] = u

        like_ids = set()
        async for lk in db.status_likes.find({"status_id": status_id}):
            like_ids.add(lk.get("user_id"))

        results = []
        for v in views:
            u = users.get(v["viewer_id"])
            if not u:
                continue
            results.append(
                {
                    "viewer_id": v["viewer_id"],
                    "username": u["username"],
                    "display_name": u["display_name"],
                    "profile_photo": u.get("profile_photo"),
                    "viewed_at": v["viewed_at"].isoformat() if v.get("viewed_at") else None,
                    "liked": v["viewer_id"] in like_ids,
                }
            )
        # Likers first, then most recent views
        liked = [r for r in results if r.get("liked")]
        rest = [r for r in results if not r.get("liked")]
        liked.sort(key=lambda r: r.get("viewed_at") or "", reverse=True)
        rest.sort(key=lambda r: r.get("viewed_at") or "", reverse=True)
        return liked + rest



    @staticmethod
    async def toggle_like(status_id: str, user_id: str) -> dict:
        """Like/unlike a status. Owner cannot like their own."""
        db = get_database()
        if not ObjectId.is_valid(status_id):
            raise ValidationError("Invalid status id")
        s = await db.statuses.find_one({"_id": ObjectId(status_id)})
        if not s:
            raise NotFoundError("Status not found")
        if s["owner_user_id"] == user_id:
            raise ForbiddenError("Cannot like your own status")
        contact_ids = await StatusService._contact_ids(db, user_id)
        if not StatusService._can_view_sync(s, user_id, contact_ids):
            raise ForbiddenError("Not allowed")
        existing = await db.status_likes.find_one({"status_id": status_id, "user_id": user_id})
        liker = await db.users.find_one(
            {"_id": ObjectId(user_id)},
            {"username": 1, "display_name": 1, "profile_photo": 1},
        )
        now = datetime.now(timezone.utc)
        if existing:
            await db.status_likes.delete_one({"_id": existing["_id"]})
            liked = False
        else:
            try:
                await db.status_likes.insert_one(
                    {
                        "status_id": status_id,
                        "user_id": user_id,
                        "created_at": now,
                    }
                )
                liked = True
            except DuplicateKeyError:
                # Concurrent like from another request — treat as already liked
                liked = True
            # Persist notification only on like
            try:
                name = (
                    (liker or {}).get("display_name")
                    or (liker or {}).get("username")
                    or "Someone"
                )
                await db.notifications.insert_one(
                    {
                        "user_id": s["owner_user_id"],
                        "type": "status_like",
                        "title": f"{name} liked your status",
                        "body": "Tap to open",
                        "status_id": status_id,
                        "actor_id": user_id,
                        "actor_name": name,
                        "actor_photo": (liker or {}).get("profile_photo"),
                        "read": False,
                        "created_at": now,
                    }
                )
            except Exception:
                pass
        # Live push to owner: update viewers cache (liked flag)
        try:
            from app.websocket.manager import manager
            view_count = await db.status_views.count_documents({"status_id": status_id})
            await manager.send_user(
                str(s["owner_user_id"]),
                {
                    "t": "status_view",
                    "status_id": status_id,
                    "view_count": view_count,
                    "viewer": {
                        "viewer_id": user_id,
                        "username": (liker or {}).get("username"),
                        "display_name": (liker or {}).get("display_name"),
                        "profile_photo": (liker or {}).get("profile_photo"),
                        "viewed_at": now.isoformat(),
                        "liked": liked,
                    },
                    "like_only": True,
                },
            )
        except Exception:
            pass
        return {"liked": liked, "status_id": status_id}

    @staticmethod
    async def _enrich_many(db, statuses: List[dict]) -> List[dict]:
        if not statuses:
            return []
        status_ids = [str(s["_id"]) for s in statuses]
        owner_ids = list({s["owner_user_id"] for s in statuses})

        viewers_map: Dict[str, List[str]] = {sid: [] for sid in status_ids}
        async for v in db.status_views.find({"status_id": {"$in": status_ids}}):
            viewers_map.setdefault(v["status_id"], []).append(v["viewer_id"])

        owners: Dict[str, dict] = {}
        oids = [ObjectId(i) for i in owner_ids if ObjectId.is_valid(i)]
        if oids:
            async for u in db.users.find(
                {"_id": {"$in": oids}},
                {"username": 1, "display_name": 1, "profile_photo": 1},
            ):
                owners[str(u["_id"])] = u

        results = []
        for s in statuses:
            sid = str(s["_id"])
            data = StatusService._serialize(s)
            vids = viewers_map.get(sid) or []
            data["viewer_ids"] = vids
            data["view_count"] = len(vids)
            u = owners.get(s["owner_user_id"])
            if u:
                data["owner"] = {
                    "id": s["owner_user_id"],
                    "username": u.get("username"),
                    "display_name": u.get("display_name"),
                    "profile_photo": u.get("profile_photo"),
                }
            results.append(data)
        return results

    @staticmethod
    def _can_view_sync(status: dict, viewer_id: str, viewer_contact_ids: List[str]) -> bool:
        owner = status["owner_user_id"]
        if owner == viewer_id:
            return True
        vis = status.get("visibility", StatusVisibility.CONTACTS.value)
        if vis == StatusVisibility.EVERYONE.value:
            return True
        if vis == StatusVisibility.CONTACTS.value:
            return owner in viewer_contact_ids
        if vis == StatusVisibility.SELECTED.value:
            return viewer_id in (status.get("selected_viewer_ids") or [])
        if vis == StatusVisibility.CLOSE_FRIENDS.value:
            return owner in viewer_contact_ids
        return False

    @staticmethod
    async def _can_view(
        status: dict, viewer_id: str, viewer_contact_ids: List[str]
    ) -> bool:
        return StatusService._can_view_sync(status, viewer_id, viewer_contact_ids)

    @staticmethod
    def _serialize(s: dict) -> dict:
        def _iso(v):
            if v is None:
                return None
            if isinstance(v, str):
                return v if v.endswith("Z") or "+" in v[10:] else v + ("Z" if "T" in v else "")
            if getattr(v, "tzinfo", None) is None:
                from datetime import timezone
                v = v.replace(tzinfo=timezone.utc)
            return v.astimezone(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        return {
            "id": str(s["_id"]),
            "owner_user_id": s["owner_user_id"],
            "content": s.get("content"),
            "media_attachments": s.get("media_attachments") or [],
            "visibility": s.get("visibility"),
            "status_type": s.get("status_type"),
            "background": s.get("background") or "theme_purple_grad",
            "created_at": _iso(s.get("created_at")),
            "expires_at": _iso(s.get("expires_at")),
        }
