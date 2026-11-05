"""WebSocket endpoint: /api/v1/ws?token=<access_jwt>

Persistent channel for:
  - chat send / live msg / receipts
  - WebRTC call signaling (offer / answer / ice / ring / hangup)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.websocket.manager import manager, packet_msg, packet_rcpt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Realtime"])


def _utc_iso(dt: Optional[datetime] = None) -> str:
    d = dt or datetime.now(timezone.utc)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    user_id: str | None = None
    try:
        payload = decode_token(token)
        user_id = str(payload.get("sub") or payload.get("user_id") or "")
        if not user_id:
            await websocket.close(code=4401)
            return
    except Exception:
        await websocket.close(code=4401)
        return

    await manager.connect(user_id, websocket)
    await _touch_last_seen(user_id)
    await _broadcast_presence(user_id, True)
    await _send_presence_snapshot(user_id)
    try:
        while True:
            data = await websocket.receive_json()
            t = (data or {}).get("t")
            if t == "ping":
                await websocket.send_json({"t": "pong", "ts": _utc_iso()})
            elif t == "send":
                await _handle_send(user_id, websocket, data)
            elif t == "rcpt":
                await _handle_rcpt(user_id, data)
            elif t == "call":
                await _handle_call(user_id, data)
            elif t == "typing":
                await _handle_typing(user_id, data)
            # unknown types ignored
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws error user=%s: %s", user_id, e)
    finally:
        if user_id:
            await manager.disconnect(user_id, websocket)
            await _touch_last_seen(user_id)
            await _broadcast_presence(user_id, False)


async def _handle_send(user_id: str, websocket: WebSocket, data: dict) -> None:
    """Persist message over the open socket — no HTTP handshake."""
    conv_id = data.get("c")
    text = (data.get("text") or "").strip()
    client_key = data.get("ck")
    image = data.get("img")
    if not conv_id:
        await websocket.send_json({"t": "ack", "ck": client_key, "ok": False, "err": "missing_c"})
        return
    if not text and not image:
        await websocket.send_json({"t": "ack", "ck": client_key, "ok": False, "err": "empty"})
        return
    try:
        from app.services.messaging_service import MessagingService

        media = [{"type": "image", "url": image}] if image else None
        msg = await MessagingService.send_message(
            conversation_id=str(conv_id),
            sender_id=user_id,
            content=text or ("" if image else text),
            message_type="image" if image else "text",
            media_attachments=media,
            idempotency_key=client_key if client_key else None,
        )
        mid = msg.get("id") or msg.get("_id")
        # Ack to sender on same socket (sent)
        await websocket.send_json(
            {
                "t": "ack",
                "ck": client_key,
                "ok": True,
                "id": mid,
                "c": conv_id,
                "s": "sent",
                "ts": msg.get("created_at") or _utc_iso(),
            }
        )
        # Fan-out already done inside send_message via packet_msg
    except Exception as e:
        logger.exception("ws send failed")
        await websocket.send_json(
            {"t": "ack", "ck": client_key, "ok": False, "err": str(e)[:120]}
        )


async def _handle_rcpt(user_id: str, data: dict) -> None:
    """Client reports delivered/read over the persistent socket."""
    mid = data.get("id")
    conv_id = data.get("c")
    state = data.get("s")
    if not mid or not state:
        return
    try:
        from app.services.messaging_service import MessagingService

        if state == "delivered":
            await MessagingService.mark_delivered(str(mid), user_id)
        elif state == "read" and conv_id:
            await MessagingService.mark_read(str(conv_id), user_id, str(mid) if mid else None)
    except Exception:
        logger.debug("ws rcpt failed", exc_info=True)


async def _handle_call(user_id: str, data: dict) -> None:
    """Relay WebRTC signaling (offer/answer/ice/ring/hangup) to peer."""
    action = data.get("a")
    to = data.get("to")
    call_id = data.get("callId") or data.get("id")
    if not action or not to:
        return
    # Never echo back to self
    if str(to) == str(user_id):
        return

    payload: dict[str, Any] = {
        "t": "call",
        "a": action,
        "from": user_id,
        "to": to,
        "callId": call_id,
        "ts": _utc_iso(),
    }
    if data.get("fromName"):
        payload["fromName"] = data["fromName"]
    if data.get("fromUsername"):
        payload["fromUsername"] = data["fromUsername"]
    if action in ("offer", "answer") and data.get("sdp"):
        payload["sdp"] = data["sdp"]
        payload["kind"] = data.get("kind") or "audio"
    if action == "ice" and data.get("candidate") is not None:
        payload["candidate"] = data["candidate"]
    if action == "ring":
        payload["kind"] = data.get("kind") or "audio"
    if action == "hangup":
        payload["reason"] = data.get("reason") or "ended"

    sent = await manager.send_user(str(to), payload)
    if action == "ring" and sent == 0:
        # Peer offline — notify caller
        await manager.send_user(
            user_id,
            {
                "t": "call",
                "a": "unavailable",
                "to": user_id,
                "from": to,
                "callId": call_id,
                "ts": _utc_iso(),
            },
        )


async def _touch_last_seen(user_id: str) -> None:
    try:
        from datetime import datetime, timezone
        from bson import ObjectId
        from app.core.database import get_database
        if not ObjectId.is_valid(user_id):
            return
        db = get_database()
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"last_seen": datetime.now(timezone.utc)}},
        )
    except Exception:
        logger.debug("last_seen update failed", exc_info=True)


async def _peer_ids_for(user_id: str) -> list[str]:
    """People who should see this user's online status (accepted contacts both ways)."""
    from app.core.database import get_database
    db = get_database()
    peers: set[str] = set()
    async for c in db.contacts.find(
        {"contact_user_id": user_id, "contact_status": {"$in": ["accepted", "ACCEPTED"]}},
        {"owner_user_id": 1},
    ):
        if c.get("owner_user_id"):
            peers.add(str(c["owner_user_id"]))
    async for c in db.contacts.find(
        {"owner_user_id": user_id, "contact_status": {"$in": ["accepted", "ACCEPTED"]}},
        {"contact_user_id": 1},
    ):
        if c.get("contact_user_id"):
            peers.add(str(c["contact_user_id"]))
    peers.discard(str(user_id))
    return list(peers)


async def _broadcast_presence(user_id: str, online: bool) -> None:
    try:
        peer_ids = await _peer_ids_for(user_id)
        last_seen = None if online else _utc_iso()
        payload = {
            "t": "presence",
            "userId": user_id,
            "online": online,
            "lastSeen": last_seen,
        }
        for pid in peer_ids:
            await manager.send_user(str(pid), payload)
    except Exception:
        logger.debug("presence broadcast failed", exc_info=True)


async def _send_presence_snapshot(user_id: str) -> None:
    try:
        peer_ids = await _peer_ids_for(user_id)
        for pid in peer_ids:
            if manager.is_online(pid):
                await manager.send_user(
                    user_id,
                    {
                        "t": "presence",
                        "userId": pid,
                        "online": True,
                        "lastSeen": None,
                    },
                )
    except Exception:
        logger.debug("presence snapshot failed", exc_info=True)


async def _handle_typing(user_id: str, data: dict) -> None:
    """Relay typing + optional live draft text (character stream) to peer."""
    to = data.get("to")
    if not to or str(to) == str(user_id):
        return
    draft = data.get("draft")
    live = bool(data.get("live")) or draft is not None
    typing = bool(data.get("typing")) if data.get("typing") is not None else (
        live and isinstance(draft, str) and len(draft) > 0
    )
    payload: dict = {
        "t": "typing",
        "from": user_id,
        "typing": typing,
        "ts": _utc_iso(),
    }
    if live or draft is not None:
        payload["live"] = True
        # Cap length so a huge paste cannot flood peers
        payload["draft"] = (str(draft) if draft is not None else "")[:2000]
    await manager.send_user(str(to), payload)
