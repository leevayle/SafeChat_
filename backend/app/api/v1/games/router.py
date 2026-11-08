"""Lightweight multiplayer games (tic-tac-toe)."""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from bson import ObjectId
from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.exceptions import success_response, NotFoundError, ForbiddenError, ValidationError
from app.websocket.manager import manager

router = APIRouter(prefix="/games", tags=["Games"])


class InviteBody(BaseModel):
    peer_user_id: str = Field(..., min_length=1)
    game: str = "tictactoe"


class MoveBody(BaseModel):
    cell: int = Field(..., ge=0, le=8)


def _uid(x) -> str:
    return str(x)


def _serialize(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "game": doc.get("game") or "tictactoe",
        "players": doc.get("players") or [],
        "challenger_id": doc.get("challenger_id"),
        "opponent_id": doc.get("opponent_id"),
        "board": doc.get("board") or [""] * 9,
        "turn": doc.get("turn"),
        "marks": doc.get("marks") or {},
        "scores": doc.get("scores") or {},
        "set": doc.get("set") or 1,
        "status": doc.get("status") or "pending",
        "winner": doc.get("winner"),
        "set_winner": doc.get("set_winner"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _winner(board: List[str]) -> Optional[str]:
    lines = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),
        (0, 3, 6), (1, 4, 7), (2, 5, 8),
        (0, 4, 8), (2, 4, 6),
    ]
    for a, b, c in lines:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    if all(board):
        return "draw"
    return None


@router.post("/tictactoe/invite")
async def invite(body: InviteBody, user: dict = Depends(get_current_user)):
    db = get_database()
    me = user["id"]
    peer = body.peer_user_id.strip()
    if peer == me:
        raise ValidationError("Cannot invite yourself")
    now = datetime.now(timezone.utc)
    doc = {
        "game": "tictactoe",
        "challenger_id": me,
        "opponent_id": peer,
        "players": [me, peer],
        "board": [""] * 9,
        "turn": me,
        "marks": {me: "X", peer: "O"},
        "scores": {me: 0, peer: 0},
        "set": 1,
        "status": "pending",
        "winner": None,
        "set_winner": None,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.games.insert_one(doc)
    game_id = str(res.inserted_id)
    # Notification for opponent
    challenger = await db.users.find_one({"_id": ObjectId(me)} if ObjectId.is_valid(me) else {"_id": me})
    name = (challenger or {}).get("display_name") or (challenger or {}).get("username") or "Someone"
    notif = {
        "user_id": peer,
        "type": "game_invite",
        "title": f"{name} wants to play tic-tac-toe with you",
        "body": "Play or not now",
        "actor_id": me,
        "actor_photo": (challenger or {}).get("profile_photo"),
        "game_id": game_id,
        "read": False,
        "created_at": now,
        "metadata": {"game": "tictactoe", "game_id": game_id},
    }
    await db.notifications.insert_one(notif)
    payload = {
        "t": "game_invite",
        "game": "tictactoe",
        "game_id": game_id,
        "from": me,
        "from_name": name,
    }
    try:
        await manager.send_user(peer, payload)
    except Exception:
        pass
    doc["_id"] = res.inserted_id
    return success_response("Invite sent", _serialize(doc))


@router.post("/tictactoe/{game_id}/accept")
async def accept(game_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    me = user["id"]
    if not ObjectId.is_valid(game_id):
        raise NotFoundError("Game not found")
    doc = await db.games.find_one({"_id": ObjectId(game_id)})
    if not doc:
        raise NotFoundError("Game not found")
    if doc.get("opponent_id") != me:
        raise ForbiddenError("Not your invite")
    if doc.get("status") != "pending":
        return success_response("Already started", _serialize(doc))
    now = datetime.now(timezone.utc)
    await db.games.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "active", "updated_at": now, "turn": doc.get("challenger_id")}},
    )
    doc["status"] = "active"
    doc["updated_at"] = now
    # notify challenger
    try:
        await manager.send_user(
            doc["challenger_id"],
            {"t": "game_start", "game": "tictactoe", "game_id": game_id},
        )
        await manager.send_user(
            me,
            {"t": "game_start", "game": "tictactoe", "game_id": game_id},
        )
    except Exception:
        pass
    # mark related notifications read
    await db.notifications.update_many(
        {"user_id": me, "game_id": game_id},
        {"$set": {"read": True}},
    )
    return success_response("Game started", _serialize(doc))


@router.post("/tictactoe/{game_id}/decline")
async def decline(game_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    me = user["id"]
    if not ObjectId.is_valid(game_id):
        raise NotFoundError("Game not found")
    doc = await db.games.find_one({"_id": ObjectId(game_id)})
    if not doc:
        raise NotFoundError("Game not found")
    if doc.get("opponent_id") != me:
        raise ForbiddenError("Not your invite")
    await db.games.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "declined", "updated_at": datetime.now(timezone.utc)}},
    )
    try:
        await manager.send_user(
            doc["challenger_id"],
            {"t": "game_decline", "game_id": game_id},
        )
    except Exception:
        pass
    return success_response("Declined", {"ok": True})


@router.get("/tictactoe/{game_id}")
async def get_game(game_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    me = user["id"]
    if not ObjectId.is_valid(game_id):
        raise NotFoundError("Game not found")
    doc = await db.games.find_one({"_id": ObjectId(game_id)})
    if not doc:
        raise NotFoundError("Game not found")
    if me not in (doc.get("players") or []):
        raise ForbiddenError("Not a player")
    return success_response("Game", _serialize(doc))


@router.post("/tictactoe/{game_id}/move")
async def move(game_id: str, body: MoveBody, user: dict = Depends(get_current_user)):
    db = get_database()
    me = user["id"]
    if not ObjectId.is_valid(game_id):
        raise NotFoundError("Game not found")
    doc = await db.games.find_one({"_id": ObjectId(game_id)})
    if not doc:
        raise NotFoundError("Game not found")
    if me not in (doc.get("players") or []):
        raise ForbiddenError("Not a player")
    if doc.get("status") != "active":
        raise ValidationError("Game is not active")
    if doc.get("turn") != me:
        raise ValidationError("Not your turn")
    board = list(doc.get("board") or [""] * 9)
    cell = body.cell
    if board[cell]:
        raise ValidationError("Cell taken")
    marks = doc.get("marks") or {}
    mark = marks.get(me) or "X"
    board[cell] = mark
    result = _winner(board)
    scores = dict(doc.get("scores") or {})
    set_n = int(doc.get("set") or 1)
    status = "active"
    set_winner = None
    winner = None
    turn = None
    now = datetime.now(timezone.utc)
    peer = [p for p in (doc.get("players") or []) if p != me]
    peer_id = peer[0] if peer else None

    if result == "draw":
        # reset board for next set without score
        board = [""] * 9
        turn = doc.get("challenger_id")
        set_n = set_n  # same set? treat draw as no score, new board
        set_winner = "draw"
    elif result in ("X", "O"):
        # who has this mark
        winner_id = me if marks.get(me) == result else peer_id
        if winner_id:
            scores[winner_id] = int(scores.get(winner_id) or 0) + 1
        set_winner = winner_id
        if scores.get(me, 0) >= 2 or (peer_id and scores.get(peer_id, 0) >= 2):
            status = "finished"
            winner = me if scores.get(me, 0) >= 2 else peer_id
            board = board  # keep last board
            turn = None
        else:
            set_n += 1
            board = [""] * 9
            turn = doc.get("challenger_id")
    else:
        turn = peer_id

    update = {
        "board": board,
        "turn": turn,
        "scores": scores,
        "set": set_n,
        "status": status,
        "set_winner": set_winner,
        "winner": winner,
        "updated_at": now,
    }
    await db.games.update_one({"_id": doc["_id"]}, {"$set": update})
    doc.update(update)
    payload = {"t": "game_move", "game": "tictactoe", "game_id": game_id, "state": _serialize(doc)}
    for uid in doc.get("players") or []:
        try:
            await manager.send_user(uid, payload)
        except Exception:
            pass
    return success_response("Moved", _serialize(doc))


@router.post("/tictactoe/{game_id}/leave")
async def leave(game_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    me = user["id"]
    if not ObjectId.is_valid(game_id):
        raise NotFoundError("Game not found")
    doc = await db.games.find_one({"_id": ObjectId(game_id)})
    if not doc:
        raise NotFoundError("Game not found")
    if me not in (doc.get("players") or []):
        raise ForbiddenError("Not a player")
    await db.games.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "left", "winner": [p for p in doc["players"] if p != me][0] if len(doc.get("players") or []) > 1 else None, "updated_at": datetime.now(timezone.utc)}},
    )
    for uid in doc.get("players") or []:
        if uid == me:
            continue
        try:
            await manager.send_user(uid, {"t": "game_leave", "game_id": game_id, "from": me})
        except Exception:
            pass
    return success_response("Left", {"ok": True})
