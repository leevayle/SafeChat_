"""In-memory WebSocket presence + fan-out for receipt/message packets.

Packets are intentionally tiny JSON objects:
  {"t":"msg","c":"<conv>","m":{...}}     new message to peers
  {"t":"rcpt","c":"<conv>","id":"<mid>","s":"delivered"|"read"}
  {"t":"ping"} / {"t":"pong"}
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of live sockets (multi-device)
        self._by_user: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._by_user.setdefault(user_id, set()).add(ws)
        logger.debug("ws connect user=%s sockets=%s", user_id, len(self._by_user.get(user_id, ())))

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            sockets = self._by_user.get(user_id)
            if not sockets:
                return
            sockets.discard(ws)
            if not sockets:
                self._by_user.pop(user_id, None)
        logger.debug("ws disconnect user=%s", user_id)

    def is_online(self, user_id: str) -> bool:
        return bool(self._by_user.get(user_id))

    async def send_user(self, user_id: str, payload: dict) -> int:
        """Fan-out to all of a user's sockets. Returns number of successful sends."""
        sockets = list(self._by_user.get(user_id, ()))
        if not sockets:
            return 0
        dead: list[WebSocket] = []
        ok = 0
        for ws in sockets:
            try:
                await ws.send_json(payload)
                ok += 1
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                live = self._by_user.get(user_id)
                if live:
                    for ws in dead:
                        live.discard(ws)
                    if not live:
                        self._by_user.pop(user_id, None)
        return ok

    async def send_users(self, user_ids: list[str], payload: dict, *, exclude: Optional[str] = None) -> None:
        for uid in user_ids:
            if exclude and uid == exclude:
                continue
            await self.send_user(uid, payload)


manager = ConnectionManager()


def packet_msg(conversation_id: str, message: dict) -> dict:
    """Minimal new-message packet for peers."""
    m = {
        "id": message.get("id") or message.get("_id"),
        "from": message.get("sender_id") or message.get("from"),
        "text": message.get("content") or message.get("text") or "",
        "time": message.get("created_at") or message.get("time"),
        "type": message.get("message_type") or message.get("type") or "text",
        "image": _first_media_url(message),
        "state": message.get("delivery_status") or "sent",
    }
    if message.get("reply_to_message_id"):
        m["reply_to_message_id"] = message.get("reply_to_message_id")
    if message.get("reply_to_text"):
        m["reply_to_text"] = message.get("reply_to_text")
    return {"t": "msg", "c": conversation_id, "m": m}


def packet_rcpt(conversation_id: str, message_id: str, state: str) -> dict:
    return {"t": "rcpt", "c": conversation_id, "id": message_id, "s": state}


def _first_media_url(message: dict) -> Optional[str]:
    media = message.get("media_attachments") or []
    if media and isinstance(media, list):
        first = media[0]
        if isinstance(first, dict):
            return first.get("url")
    return message.get("image")
