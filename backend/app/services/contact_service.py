"""Contact management service — optimized with batched user lookups."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from bson import ObjectId
from app.core.database import get_database
from app.core.exceptions import (
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
)
from app.models.contact import ContactStatus, ContactRequestStatus
import logging

logger = logging.getLogger(__name__)


async def _users_by_ids(db, ids: List[str]) -> Dict[str, dict]:
    """Batch-load users by string ids. Returns map id -> user doc."""
    oids = [ObjectId(i) for i in ids if i and ObjectId.is_valid(i)]
    if not oids:
        return {}
    out: Dict[str, dict] = {}
    async for u in db.users.find(
        {"_id": {"$in": oids}},
        {
            "username": 1,
            "display_name": 1,
            "profile_photo": 1,
            "phone_number": 1,
            "phone": 1,
            "bio": 1,
            "subscription_plan": 1,
            "premium_settings": 1,
            "preferences": 1,
            "last_seen": 1,
        },
    ):
        out[str(u["_id"])] = u
    return out


def _iso(dt) -> Optional[str]:
    if not dt:
        return None
    if getattr(dt, "tzinfo", None):
        return dt.isoformat().replace("+00:00", "Z")
    return dt.isoformat() + "Z"


class ContactService:
    @staticmethod
    async def send_request(
        from_user_id: str,
        to_username: str,
        message: Optional[str] = None,
        share_phone: bool = False,
        from_nickname: Optional[str] = None,
    ) -> dict:
        db = get_database()
        target = await db.users.find_one({"username": to_username.lower().strip()})
        if not target:
            raise NotFoundError("User not found")
        to_user_id = str(target["_id"])
        if to_user_id == from_user_id:
            raise ValidationError("Cannot send contact request to yourself")

        blocked = await db.blocked_users.find_one(
            {
                "$or": [
                    {"blocker_id": to_user_id, "blocked_id": from_user_id},
                    {"blocker_id": from_user_id, "blocked_id": to_user_id},
                ]
            }
        )
        if blocked:
            raise ForbiddenError("Cannot send request while either user is blocked")

        existing = await db.contacts.find_one(
            {"owner_user_id": from_user_id, "contact_user_id": to_user_id}
        )
        if existing and existing.get("contact_status") == ContactStatus.ACCEPTED.value:
            raise ConflictError("Already in contacts")

        existing_req = await db.contact_requests.find_one(
            {
                "from_user_id": from_user_id,
                "to_user_id": to_user_id,
                "status": ContactRequestStatus.PENDING.value,
            }
        )
        if existing_req:
            raise ConflictError("Request already pending")

        reverse = await db.contact_requests.find_one(
            {
                "from_user_id": to_user_id,
                "to_user_id": from_user_id,
                "status": ContactRequestStatus.PENDING.value,
            }
        )
        if reverse:
            return await ContactService.accept_request(str(reverse["_id"]), from_user_id)

        now = datetime.now(timezone.utc)
        # from_nickname is private to the sender — never returned on incoming lists
        nick = (from_nickname or "").strip() or None
        doc = {
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "from_nickname": nick,
            "message": message,
            "share_phone": bool(share_phone),
            "status": ContactRequestStatus.PENDING.value,
            "created_at": now,
            "updated_at": now,
        }
        result = await db.contact_requests.insert_one(doc)
        await db.user_activity_logs.insert_one(
            {
                "user_id": from_user_id,
                "event_type": "contact",
                "action": "request_sent",
                "resource_type": "contact_request",
                "resource_id": str(result.inserted_id),
                "timestamp": now,
                "metadata": {"to_user_id": to_user_id},
            }
        )
        return {
            "id": str(result.inserted_id),
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "status": ContactRequestStatus.PENDING.value,
            "created_at": _iso(now),
        }

    @staticmethod
    async def _upsert_contact_edge(
        db,
        owner_id: str,
        peer_id: str,
        peer_phone: str = "",
        nickname: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        fields: Dict[str, Any] = {
            "contact_status": ContactStatus.ACCEPTED.value,
            "updated_at": now,
        }
        if peer_phone:
            fields["shared_phone"] = peer_phone
        if nickname:
            fields["nickname"] = nickname
        owner_id = str(owner_id)
        peer_id = str(peer_id)
        await db.contacts.update_one(
            {"owner_user_id": owner_id, "contact_user_id": peer_id},
            {
                "$set": fields,
                "$setOnInsert": {
                    "owner_user_id": owner_id,
                    "contact_user_id": peer_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )

    @staticmethod
    async def _upsert_accepted_pair(
        db,
        request: dict,
        from_phone: str = "",
        to_phone: str = "",
    ) -> None:
        """Create both contact edges after accept.

        When the request included share_phone, both sides receive the peer's
        number so profile / contact info can show it for everyone involved.
        """
        import asyncio

        from_id = str(request["from_user_id"])
        to_id = str(request["to_user_id"])
        nickname = (request.get("from_nickname") or "").strip() or None
        await asyncio.gather(
            # Sender's edge → recipient (sender sees recipient number when shared)
            ContactService._upsert_contact_edge(
                db, from_id, to_id, peer_phone=to_phone, nickname=nickname
            ),
            # Recipient's edge → sender (recipient sees sender number when shared)
            ContactService._upsert_contact_edge(
                db, to_id, from_id, peer_phone=from_phone
            ),
        )

    @staticmethod
    async def accept_request(request_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if str(req["to_user_id"]) != str(user_id):
            raise ForbiddenError("Not your request to accept")
        request_status = str(req.get("status") or "").lower()
        if request_status not in {
            ContactRequestStatus.PENDING.value,
            ContactRequestStatus.ACCEPTED.value,
        }:
            raise ConflictError("Request is not pending")

        now = datetime.now(timezone.utc)
        share_phone = bool(req.get("share_phone"))
        from_phone = ""
        to_phone = ""
        if share_phone:
            from_oid = (
                ObjectId(req["from_user_id"])
                if ObjectId.is_valid(str(req["from_user_id"]))
                else None
            )
            to_oid = (
                ObjectId(req["to_user_id"])
                if ObjectId.is_valid(str(req["to_user_id"]))
                else None
            )
            from_user = (
                await db.users.find_one(
                    {"_id": from_oid},
                    {"phone_number": 1, "phone": 1},
                )
                if from_oid
                else None
            )
            to_user = (
                await db.users.find_one(
                    {"_id": to_oid},
                    {"phone_number": 1, "phone": 1},
                )
                if to_oid
                else None
            )
            from_phone = (
                (from_user or {}).get("phone_number")
                or (from_user or {}).get("phone")
                or ""
            )
            to_phone = (
                (to_user or {}).get("phone_number")
                or (to_user or {}).get("phone")
                or ""
            )

        # Persist both directions before marking the request accepted. If either
        # write fails, the pending request can be retried and repaired safely.
        await ContactService._upsert_accepted_pair(db, req, from_phone, to_phone)
        should_notify = False
        if request_status != ContactRequestStatus.ACCEPTED.value:
            result = await db.contact_requests.update_one(
                {
                    "_id": ObjectId(request_id),
                    "status": ContactRequestStatus.PENDING.value,
                },
                {
                    "$set": {
                        "status": ContactRequestStatus.ACCEPTED.value,
                        "updated_at": now,
                    }
                },
            )
            should_notify = bool(getattr(result, "modified_count", 0))
        try:
            await db.user_activity_logs.insert_one(
                {
                    "user_id": user_id,
                    "event_type": "contact",
                    "action": "request_accepted",
                    "resource_type": "contact_request",
                    "resource_id": request_id,
                    "timestamp": now,
                    "metadata": {"from_user_id": req["from_user_id"]},
                }
            )
        except Exception:
            pass

        # Notify the sender: "<acceptor> accepted your save request"
        # Works when online (WS) and when they come back (notifications collection)
        if should_notify:
            try:
                acceptor = await db.users.find_one(
                    {"_id": ObjectId(user_id)},
                    {"username": 1, "display_name": 1, "profile_photo": 1},
                )
                name = (
                    (acceptor or {}).get("display_name")
                    or (acceptor or {}).get("username")
                    or "Someone"
                )
                notif = {
                    "user_id": req["from_user_id"],
                    "type": "save_request_accepted",
                    "title": "Save request accepted",
                    "body": f"{name} accepted your save request",
                    "actor_id": user_id,
                    "actor_name": name,
                    "actor_photo": (acceptor or {}).get("profile_photo"),
                    "read": False,
                    "created_at": now,
                }
                inserted = await db.notifications.insert_one(notif)
            except Exception:
                logger.exception("Could not save contact-accepted notification")
            else:
                try:
                    from app.websocket.manager import manager

                    await manager.send_user(
                        str(req["from_user_id"]),
                        {
                            "t": "notif",
                            "type": "save_request_accepted",
                            "title": notif["title"],
                            "body": notif["body"],
                            "actor_id": user_id,
                            "actor_name": name,
                            "actor_photo": notif["actor_photo"],
                            "notification_id": str(inserted.inserted_id),
                        },
                    )
                except Exception:
                    logger.debug("Could not send contact-accepted notification", exc_info=True)

        # Mutual contacts are in DB (both edges). Return payloads + fan out so
        # every online device refreshes its contacts cache immediately.
        from_id = str(req["from_user_id"])
        to_id = str(user_id)

        def _find_peer(clist, peer):
            for c in clist or []:
                if str(c.get("contact_user_id")) == str(peer):
                    return c
            return None

        sender_contacts = await ContactService.list_contacts(from_id)
        acceptor_contacts = await ContactService.list_contacts(to_id)
        contact_for_sender = _find_peer(sender_contacts, to_id)
        contact_for_acceptor = _find_peer(acceptor_contacts, from_id)

        try:
            from app.websocket.manager import manager

            payload_base = {
                "t": "contact",
                "action": "accepted",
                "request_id": request_id,
            }
            await manager.send_user(
                from_id,
                {**payload_base, "contact": contact_for_sender, "peer_id": to_id},
            )
            await manager.send_user(
                to_id,
                {**payload_base, "contact": contact_for_acceptor, "peer_id": from_id},
            )
        except Exception:
            logger.debug("contact accept WS fanout failed", exc_info=True)

        return {
            "id": request_id,
            "status": ContactRequestStatus.ACCEPTED.value,
            "mutual": True,
            "contact": contact_for_acceptor,
            "peer_contact": contact_for_sender,
        }

    @staticmethod
    async def reject_request(request_id: str, user_id: str) -> dict:
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if req["to_user_id"] != user_id:
            raise ForbiddenError("Not your request to reject")
        if req["status"] != ContactRequestStatus.PENDING.value:
            raise ConflictError("Request is not pending")

        now = datetime.now(timezone.utc)
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": ContactRequestStatus.REJECTED.value, "updated_at": now}},
        )
        return {"id": request_id, "status": ContactRequestStatus.REJECTED.value}


    @staticmethod
    async def cancel_request(request_id: str, user_id: str) -> dict:
        """Sender cancels their own pending request."""
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        if str(req.get("from_user_id")) != str(user_id):
            raise ForbiddenError("Only the sender can cancel this request")
        status = str(req.get("status") or "").lower()
        if status != ContactRequestStatus.PENDING.value:
            raise ConflictError("Only pending requests can be cancelled")
        now = datetime.now(timezone.utc)
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": "cancelled", "updated_at": now}},
        )
        return {"id": request_id, "status": "cancelled"}

    @staticmethod
    async def delete_request_record(request_id: str, user_id: str) -> dict:
        """Remove a request from history for the current user (soft hide flags)."""
        db = get_database()
        if not ObjectId.is_valid(request_id):
            raise ValidationError("Invalid request id")
        req = await db.contact_requests.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise NotFoundError("Request not found")
        from_id = str(req.get("from_user_id"))
        to_id = str(req.get("to_user_id"))
        uid = str(user_id)
        if uid not in {from_id, to_id}:
            raise ForbiddenError("Not your request")
        now = datetime.now(timezone.utc)
        field = "hidden_by_sender" if uid == from_id else "hidden_by_recipient"
        await db.contact_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {field: True, "updated_at": now}},
        )
        return {"id": request_id, "deleted": True}


    @staticmethod
    async def list_contacts(user_id: str) -> List[dict]:
        db = get_database()
        accepted = [ContactStatus.ACCEPTED.value, ContactStatus.ACCEPTED.value.upper()]
        user_id = str(user_id)
        contacts = (
            await db.contacts.find(
                {
                    "owner_user_id": user_id,
                    "$or": [
                        {"contact_status": {"$in": accepted}},
                        {"status": {"$in": accepted}},
                    ],
                }
            )
            .sort("created_at", -1)
            .to_list(length=500)
        )
        by_peer = {
            str(c["contact_user_id"]): c
            for c in contacts
            if c.get("contact_user_id")
        }

        # Older accepted requests may predate the reciprocal contacts rows.
        requests = (
            await db.contact_requests.find(
                {
                    "status": {"$in": accepted},
                    "$or": [
                        {"from_user_id": user_id},
                        {"to_user_id": user_id},
                    ],
                }
            )
            .sort("created_at", -1)
            .to_list(length=500)
        )

        def request_peer(request: dict) -> str:
            from_id = str(request.get("from_user_id") or "")
            to_id = str(request.get("to_user_id") or "")
            return to_id if from_id == str(user_id) else from_id

        for request in requests:
            from_id = str(request.get("from_user_id") or "")
            peer_id = request_peer(request)
            if not peer_id or peer_id == user_id or peer_id in by_peer:
                continue
            by_peer[peer_id] = {
                "contact_user_id": peer_id,
                "contact_status": ContactStatus.ACCEPTED.value,
                "created_at": request.get("updated_at") or request.get("created_at"),
                "nickname": request.get("from_nickname") if from_id == user_id else None,
            }

        peer_ids = list(by_peer)
        if not peer_ids:
            return []
        blocked_rows = (
            await db.blocked_users.find(
                {
                    "$or": [
                        {"blocker_id": user_id, "blocked_id": {"$in": peer_ids}},
                        {"blocked_id": user_id, "blocker_id": {"$in": peer_ids}},
                    ]
                },
                {"blocker_id": 1, "blocked_id": 1},
            ).to_list(length=1000)
        )
        for row in blocked_rows:
            peer_id = (
                row.get("blocked_id")
                if str(row.get("blocker_id")) == str(user_id)
                else row.get("blocker_id")
            )
            if peer_id:
                by_peer.pop(str(peer_id), None)
        if not by_peer:
            return []

        request_peer_ids = {request_peer(request) for request in requests} & set(by_peer)
        if request_peer_ids:
            edge_rows = await db.contacts.find(
                {
                    "$or": [
                        {
                            "owner_user_id": user_id,
                            "contact_user_id": {"$in": list(request_peer_ids)},
                        },
                        {
                            "contact_user_id": user_id,
                            "owner_user_id": {"$in": list(request_peer_ids)},
                        },
                    ]
                },
                {
                    "owner_user_id": 1,
                    "contact_user_id": 1,
                    "contact_status": 1,
                    "status": 1,
                },
            ).to_list(length=1000)
            accepted_edges = {
                (str(edge.get("owner_user_id")), str(edge.get("contact_user_id")))
                for edge in edge_rows
                if str(edge.get("contact_status") or edge.get("status") or "").lower()
                == ContactStatus.ACCEPTED.value
            }
            repairs = [
                request
                for request in requests
                if request_peer(request) in request_peer_ids
                and (
                    (str(request.get("from_user_id")), str(request.get("to_user_id")))
                    not in accepted_edges
                    or (str(request.get("to_user_id")), str(request.get("from_user_id")))
                    not in accepted_edges
                )
            ]
            if repairs:
                import asyncio

                phone_user_ids = list(
                    {
                        str(request.get("from_user_id"))
                        for request in repairs
                        if request.get("share_phone")
                    }
                    | {
                        str(request.get("to_user_id"))
                        for request in repairs
                        if request.get("share_phone")
                    }
                )
                phone_users = await _users_by_ids(db, phone_user_ids)

                async def repair_pair(request: dict) -> None:
                    if not request.get("share_phone"):
                        await ContactService._upsert_accepted_pair(db, request, "", "")
                        return
                    sender = phone_users.get(str(request.get("from_user_id"))) or {}
                    recipient = phone_users.get(str(request.get("to_user_id"))) or {}
                    from_phone = (
                        sender.get("phone_number") or sender.get("phone") or ""
                    )
                    to_phone = (
                        recipient.get("phone_number") or recipient.get("phone") or ""
                    )
                    await ContactService._upsert_accepted_pair(
                        db, request, from_phone, to_phone
                    )

                await asyncio.gather(
                    *(repair_pair(request) for request in repairs)
                )

            # Backfill missing shared_phone on existing accepted edges when the
            # original request opted into share_phone (fixes older one-way data).
            missing_phone_peers = [
                peer_id
                for peer_id, edge in by_peer.items()
                if not (edge.get("shared_phone") or "").strip()
            ]
            if missing_phone_peers:
                share_reqs = [
                    r
                    for r in requests
                    if r.get("share_phone")
                    and request_peer(r) in set(missing_phone_peers)
                ]
                if share_reqs:
                    import asyncio

                    ids = list(
                        {
                            str(r.get("from_user_id"))
                            for r in share_reqs
                        }
                        | {str(r.get("to_user_id")) for r in share_reqs}
                    )
                    phone_users = await _users_by_ids(db, ids)

                    async def backfill_phones(request: dict) -> None:
                        from_id = str(request.get("from_user_id"))
                        to_id = str(request.get("to_user_id"))
                        sender = phone_users.get(from_id) or {}
                        recipient = phone_users.get(to_id) or {}
                        from_phone = (
                            sender.get("phone_number") or sender.get("phone") or ""
                        )
                        to_phone = (
                            recipient.get("phone_number")
                            or recipient.get("phone")
                            or ""
                        )
                        await ContactService._upsert_accepted_pair(
                            db, request, from_phone, to_phone
                        )
                        # Refresh in-memory edge so this list response includes phone
                        edge = by_peer.get(request_peer(request))
                        if edge is not None:
                            owner = str(edge.get("owner_user_id") or user_id)
                            if owner == from_id and to_phone:
                                edge["shared_phone"] = to_phone
                            elif owner == to_id and from_phone:
                                edge["shared_phone"] = from_phone

                    await asyncio.gather(
                        *(backfill_phones(r) for r in share_reqs)
                    )

        peer_ids = list(by_peer)
        users = await _users_by_ids(db, peer_ids)

        from app.utils.presence import resolve_busy

        results = []
        for c in by_peer.values():
            peer_id = str(c["contact_user_id"])
            contact_user = users.get(peer_id)
            if not contact_user:
                continue
            # Phone only if peer shared it on the save request; username is always unique
            phone = (c.get("shared_phone") or "").strip()
            # Viewer is a contact by definition of this list
            busy_on, busy_msg, busy_until = resolve_busy(
                contact_user, is_contact=True
            )
            results.append(
                {
                    "id": str(c.get("_id") or peer_id),
                    "contact_user_id": peer_id,
                    "username": contact_user["username"],
                    "display_name": contact_user.get("display_name")
                    or contact_user["username"],
                    "profile_photo": contact_user.get("profile_photo"),
                    "phone_number": phone,
                    "bio": contact_user.get("bio") or "",
                    "nickname": c.get("nickname"),
                    "contact_status": c.get("contact_status") or c.get("status") or ContactStatus.ACCEPTED.value,
                    "created_at": _iso(c.get("created_at")),
                    "subscription_plan": contact_user.get("subscription_plan") or "pro",
                    "verified_badge": bool(
                        (contact_user.get("premium_settings") or {}).get("verified_badge", True)
                    )
                    and (contact_user.get("subscription_plan") or "pro") == "premium",
                    "last_seen": _iso(contact_user.get("last_seen")),
                    "busy": busy_on,
                    "busy_message": busy_msg if busy_on else "",
                    "busy_until": busy_until if busy_on else None,
                    "preferences": {
                        "busy_enabled": busy_on,
                        "busy_message": busy_msg if busy_on else "",
                        "busy_until": busy_until if busy_on else None,
                    },
                }
            )
        return results

    @staticmethod
    async def list_incoming_requests(user_id: str) -> List[dict]:
        """Incoming save requests for this user (pending + history). Stored in DB so all devices see the same list."""
        db = get_database()
        rows = (
            await db.contact_requests.find(
                {
                    "to_user_id": user_id,
                    "hidden_by_recipient": {"$ne": True},
                }
            )
            .sort("created_at", -1)
            .to_list(length=200)
        )
        users = await _users_by_ids(db, [r["from_user_id"] for r in rows])
        results = []
        for r in rows:
            from_user = users.get(r["from_user_id"])
            results.append(
                {
                    "id": str(r["_id"]),
                    "from_user_id": r["from_user_id"],
                    "to_user_id": r["to_user_id"],
                    "from_username": from_user["username"] if from_user else None,
                    "from_display_name": from_user["display_name"] if from_user else None,
                    "from_profile_photo": from_user.get("profile_photo") if from_user else None,
                    "message": r.get("message"),
                    "status": r["status"],
                    "created_at": _iso(r.get("created_at")),
                }
            )
        return results

    @staticmethod
    async def list_outgoing_requests(user_id: str) -> List[dict]:
        db = get_database()
        rows = (
            await db.contact_requests.find(
                {
                    "from_user_id": user_id,
                    "hidden_by_sender": {"$ne": True},
                }
            )
            .sort("created_at", -1)
            .to_list(length=200)
        )
        users = await _users_by_ids(db, [r["to_user_id"] for r in rows])
        results = []
        for r in rows:
            to_user = users.get(r["to_user_id"])
            results.append(
                {
                    "id": str(r["_id"]),
                    "from_user_id": r["from_user_id"],
                    "to_user_id": r["to_user_id"],
                    "to_username": to_user["username"] if to_user else None,
                    "to_display_name": to_user["display_name"] if to_user else None,
                    "to_profile_photo": to_user.get("profile_photo") if to_user else None,
                    "message": r.get("message"),
                    "status": r["status"],
                    "created_at": _iso(r.get("created_at")),
                }
            )
        return results

    @staticmethod
    async def remove_contact(user_id: str, contact_user_id: str) -> None:
        db = get_database()
        edges = await db.contacts.delete_many(
            {
                "$or": [
                    {"owner_user_id": user_id, "contact_user_id": contact_user_id},
                    {"owner_user_id": contact_user_id, "contact_user_id": user_id},
                ]
            }
        )
        now = datetime.now(timezone.utc)
        requests = await db.contact_requests.update_many(
            {
                "status": {
                    "$in": [
                        ContactRequestStatus.ACCEPTED.value,
                        ContactRequestStatus.ACCEPTED.value.upper(),
                    ]
                },
                "$or": [
                    {"from_user_id": user_id, "to_user_id": contact_user_id},
                    {"from_user_id": contact_user_id, "to_user_id": user_id},
                ],
            },
            {
                "$set": {
                    "status": ContactRequestStatus.CANCELLED.value,
                    "cancel_reason": "contact_removed",
                    "updated_at": now,
                }
            },
        )
        if edges.deleted_count == 0 and requests.matched_count == 0:
            raise NotFoundError("Contact not found")

    @staticmethod
    async def list_blocked_users(user_id: str) -> List[dict]:
        db = get_database()
        rows = (
            await db.blocked_users.find({"blocker_id": user_id})
            .sort("created_at", -1)
            .to_list(length=500)
        )
        blocked_ids = list(
            dict.fromkeys(str(row.get("blocked_id") or "") for row in rows)
        )
        blocked_ids = [blocked_id for blocked_id in blocked_ids if blocked_id]
        if not blocked_ids:
            return []

        users = await _users_by_ids(db, blocked_ids)
        accepted = [
            ContactRequestStatus.ACCEPTED.value,
            ContactRequestStatus.ACCEPTED.value.upper(),
        ]
        edges = (
            await db.contacts.find(
                {
                    "$or": [
                        {
                            "owner_user_id": user_id,
                            "contact_user_id": {"$in": blocked_ids},
                        },
                        {
                            "owner_user_id": {"$in": blocked_ids},
                            "contact_user_id": user_id,
                        },
                    ]
                },
                {
                    "owner_user_id": 1,
                    "contact_user_id": 1,
                    "contact_status": 1,
                    "status": 1,
                },
            )
            .to_list(length=1000)
        )
        accepted_pairs = {
            (str(edge.get("owner_user_id")), str(edge.get("contact_user_id")))
            for edge in edges
            if str(edge.get("contact_status") or edge.get("status") or "").lower()
            == ContactStatus.ACCEPTED.value
        }
        requests = (
            await db.contact_requests.find(
                {
                    "status": {"$in": accepted},
                    "$or": [
                        {"from_user_id": user_id, "to_user_id": {"$in": blocked_ids}},
                        {"to_user_id": user_id, "from_user_id": {"$in": blocked_ids}},
                    ],
                },
                {"from_user_id": 1, "to_user_id": 1},
            )
            .to_list(length=1000)
        )
        accepted_pairs.update(
            (str(request.get("from_user_id")), str(request.get("to_user_id")))
            for request in requests
        )

        result = []
        for row in rows:
            blocked_id = str(row.get("blocked_id") or "")
            if not blocked_id:
                continue
            blocked_user = users.get(blocked_id) or {}
            is_contact = (
                (user_id, blocked_id) in accepted_pairs
                or (blocked_id, user_id) in accepted_pairs
            )
            result.append(
                {
                    "id": blocked_id,
                    "contact_user_id": blocked_id,
                    "username": blocked_user.get("username") or "",
                    "display_name": (
                        blocked_user.get("display_name")
                        or blocked_user.get("username")
                        or "Unknown user"
                    ),
                    "profile_photo": blocked_user.get("profile_photo"),
                    "is_contact": is_contact,
                    "created_at": _iso(row.get("created_at")),
                }
            )
        return result

    @staticmethod
    async def block_user(blocker_id: str, blocked_user_id: str) -> None:
        db = get_database()
        if blocker_id == blocked_user_id:
            raise ValidationError("Cannot block yourself")
        if not ObjectId.is_valid(blocked_user_id):
            raise ValidationError("Invalid user id")
        target = await db.users.find_one({"_id": ObjectId(blocked_user_id)}, {"_id": 1})
        if not target:
            raise NotFoundError("User not found")

        now = datetime.now(timezone.utc)
        await db.blocked_users.update_one(
            {"blocker_id": blocker_id, "blocked_id": blocked_user_id},
            {
                "$set": {"created_at": now},
                "$setOnInsert": {"blocker_id": blocker_id, "blocked_id": blocked_user_id},
            },
            upsert=True,
        )
        await db.contact_requests.update_many(
            {
                "$or": [
                    {"from_user_id": blocker_id, "to_user_id": blocked_user_id},
                    {"from_user_id": blocked_user_id, "to_user_id": blocker_id},
                ],
                "status": {
                    "$in": [
                        ContactRequestStatus.PENDING.value,
                        ContactRequestStatus.PENDING.value.upper(),
                    ]
                },
            },
            {"$set": {"status": ContactRequestStatus.CANCELLED.value, "updated_at": now}},
        )

    @staticmethod
    async def unblock_user(blocker_id: str, blocked_user_id: str) -> None:
        db = get_database()
        result = await db.blocked_users.delete_one(
            {"blocker_id": blocker_id, "blocked_id": blocked_user_id}
        )
        if result.deleted_count == 0:
            raise NotFoundError("Block record not found")

    @staticmethod
    async def update_nickname(user_id: str, contact_user_id: str, nickname: Optional[str]) -> dict:
        db = get_database()
        result = await db.contacts.update_one(
            {"owner_user_id": user_id, "contact_user_id": contact_user_id},
            {"$set": {"nickname": nickname, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise NotFoundError("Contact not found")
        return {"contact_user_id": contact_user_id, "nickname": nickname}
