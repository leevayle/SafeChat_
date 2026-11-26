"""In-memory WebSocket presence + fan-out for receipt/message packets.

Packets are intentionally tiny JSON objects:
  {"t":"msg","c":"<conv>","m":{...}}     new message to peers
  {"t":"rcpt","c":"<conv>","id":"<mid>","s":"delivered"|"read"}
  {"t":"ping"} / {"t":"pong"}
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Coroutine, Dict, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# How long to wait after the last socket drops before announcing offline.
# Prevents green-dot flicker during brief reconnects / token rotates.
OFFLINE_GRACE_SECONDS = 20.0


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of live sockets (multi-device)
        self._by_user: Dict[str, Set[WebSocket]] = {}
        # socket -> session id, so a closed session's socket can be dropped
        self._sid_by_ws: Dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()
        # user_id -> delayed offline task
        self._offline_tasks: Dict[str, asyncio.Task] = {}
        self._offline_callback: Optional[
            Callable[[str], Coroutine[Any, Any, None]]
        ] = None

    def set_offline_callback(
        self, cb: Optional[Callable[[str], Coroutine[Any, Any, None]]]
    ) -> None:
        """Called once after the offline grace expires with no reconnect."""
        self._offline_callback = cb

    def _cancel_offline(self, user_id: str) -> None:
        task = self._offline_tasks.pop(str(user_id), None)
        if task and not task.done():
            task.cancel()

    def _schedule_offline(self, user_id: str) -> None:
        uid = str(user_id)
        self._cancel_offline(uid)

        async def _fire() -> None:
            try:
                await asyncio.sleep(OFFLINE_GRACE_SECONDS)
            except asyncio.CancelledError:
                return
            # Still offline?
            if self.is_online(uid):
                return
            cb = self._offline_callback
            if cb:
                try:
                    await cb(uid)
                except Exception:
                    logger.debug("offline callback failed user=%s", uid, exc_info=True)
            self._offline_tasks.pop(uid, None)

        self._offline_tasks[uid] = asyncio.create_task(_fire())

    async def connect(self, user_id: str, ws: WebSocket, sid: Optional[str] = None) -> bool:
        """Accept socket. Returns True if this is the first live socket (was offline)."""
        await ws.accept()
        uid = str(user_id)
        async with self._lock:
            sockets = self._by_user.setdefault(uid, set())
            was_offline = len(sockets) == 0
            sockets.add(ws)
            if sid:
                self._sid_by_ws[ws] = sid
        # Cancel any pending offline announcement
        self._cancel_offline(uid)
        logger.debug(
            "ws connect user=%s sockets=%s was_offline=%s",
            uid,
            len(self._by_user.get(uid, ())),
            was_offline,
        )
        return was_offline

    async def disconnect(self, user_id: str, ws: WebSocket) -> bool:
        """Drop socket. Returns True if the user has no remaining sockets."""
        uid = str(user_id)
        fully_offline = False
        async with self._lock:
            sockets = self._by_user.get(uid)
            if not sockets:
                return True
            sockets.discard(ws)
            self._sid_by_ws.pop(ws, None)
            if not sockets:
                self._by_user.pop(uid, None)
                fully_offline = True
        logger.debug("ws disconnect user=%s fully_offline=%s", uid, fully_offline)
        if fully_offline:
            self._schedule_offline(uid)
        return fully_offline

    async def close_sessions(self, user_id: str, sids: set[str], code: int = 4403) -> int:
        """Close the live sockets that belong to the given (now closed) sessions."""
        async with self._lock:
            targets = [w for w in self._by_user.get(str(user_id), ()) if self._sid_by_ws.get(w) in sids]
        for w in targets:
            try:
                await w.close(code=code)
            except Exception:
                logger.debug("ws close failed user=%s", user_id, exc_info=True)
        return len(targets)

    def is_online(self, user_id: str) -> bool:
        uid = str(user_id or "")
        if not uid:
            return False
        if self._by_user.get(uid):
            return True
        for k in self._by_user.keys():
            if str(k) == uid:
                return True
        return False

    @property
    def online_user_ids(self) -> set[str]:
        return {str(user_id) for user_id, sockets in self._by_user.items() if sockets}

    async def send_user(self, user_id: str, payload: dict) -> int:
        """Fan-out to all of a user's sockets. Returns number of successful sends."""
        uid = str(user_id or "")
        sockets = list(self._by_user.get(uid, ()))
        if not sockets:
            for k, v in self._by_user.items():
                if str(k) == uid:
                    sockets = list(v)
                    break
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
                live = self._by_user.get(uid)
                if live:
                    for ws in dead:
                        live.discard(ws)
                    if not live:
                        self._by_user.pop(uid, None)
                        self._schedule_offline(uid)
        return ok

    async def send_users(
        self, user_ids: list[str], payload: dict, *, exclude: Optional[str] = None
    ) -> None:
        for uid in user_ids:
            if exclude and uid == exclude:
                continue
            await self.send_user(uid, payload)


manager = ConnectionManager()


def packet_msg(conversation_id: str, message: dict) -> dict:
    """Minimal new-message packet for peers — include reply tag so UI prints once."""
    return {
        "t": "msg",
        "c": conversation_id,
        "m": {
            "id": message.get("id") or message.get("_id"),
            "from": message.get("sender_id") or message.get("from"),
            "text": message.get("content") or message.get("text") or "",
            "time": message.get("created_at") or message.get("time"),
            "type": message.get("message_type") or message.get("type") or "text",
            "image": _first_media_url(message),
            "state": message.get("delivery_status") or "sent",
            "reply_to_message_id": message.get("reply_to_message_id"),
            "reply_to_text": message.get("reply_to_text"),
            "is_edited": message.get("is_edited") or message.get("edited"),
            "client_key": message.get("client_key") or message.get("idempotency_key"),
        },
    }


def packet_rcpt(conversation_id: str, message_id: str, state: str) -> dict:
    return {"t": "rcpt", "c": conversation_id, "id": message_id, "s": state}


def _first_media_url(message: dict) -> Optional[str]:
    media = message.get("media_attachments") or message.get("media") or []
    if isinstance(media, list) and media:
        first = media[0]
        if isinstance(first, dict):
            return first.get("url") or first.get("path")
        if isinstance(first, str):
            return first
    return message.get("image")
