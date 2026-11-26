"""Device-class session limits: max 3 live sessions (mobile / tablet / desktop)."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.core.exceptions import UnauthorizedError
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest
from app.services import auth_service
from app.services.auth_service import AuthService
from app.services.session_policy import classify_device, enforce_session_limits, pick_losers

WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15"
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17 Mobile/15E148 Safari/604.1"
IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17 Mobile/15E148 Safari/604.1"
PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"
ANDROID_TAB = "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/126 Safari/537.36"


# ---------- tiny in-memory Mongo ----------
def _match(doc, q):
    for k, v in q.items():
        have = doc.get(k)
        if isinstance(v, dict):
            if "$in" in v and have not in v["$in"]:
                return False
            if "$gt" in v and not (have is not None and have > v["$gt"]):
                return False
        elif have != v:
            return False
    return True


class Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, key, direction=1):
        self.docs.sort(key=lambda d: d.get(key) or datetime.min.replace(tzinfo=timezone.utc), reverse=direction < 0)
        return self

    def __aiter__(self):
        async def gen():
            for d in self.docs:
                yield d
        return gen()


class Coll:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, q=None):
        return Cursor([d for d in self.docs if _match(d, q or {})])

    async def find_one(self, q, _proj=None):
        return next((d for d in self.docs if _match(d, q)), None)

    async def insert_one(self, d):
        d.setdefault("_id", ObjectId())
        self.docs.append(d)

    async def update_one(self, q, u):
        for d in self.docs:
            if _match(d, q):
                d.update(u.get("$set", {}))
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, q, u):
        n = 0
        for d in self.docs:
            if _match(d, q):
                d.update(u.get("$set", {})); n += 1
        return SimpleNamespace(matched_count=n, modified_count=n)


@pytest.fixture
def world(monkeypatch):
    uid = ObjectId()
    user = {"_id": uid, "username": "kim", "display_name": "Kim", "password_hash": "h", "account_status": "active",
            "account_role": "USER", "auth_version": 0}
    db = SimpleNamespace(users=Coll([user]), sessions=Coll(), user_activity_logs=Coll())
    monkeypatch.setattr(auth_service, "get_database", lambda: db)
    monkeypatch.setattr(auth_service, "verify_password", lambda p, h: p == "pw")
    return SimpleNamespace(db=db, uid=str(uid))


def login(ua, hint=None, ip="9.9.9.9"):
    req = SimpleNamespace(headers={"user-agent": ua} if ua else {}, client=SimpleNamespace(host=ip))
    data = LoginRequest(username="kim", password="pw", device_name="Web", device_type=hint)
    _user, access, refresh, _reset = asyncio.run(AuthService.login(data, req))
    return access, refresh


def live(w):
    return [s for s in w.db.sessions.docs if not s["revoked"]]


# ---------- classification ----------
@pytest.mark.parametrize("ua,hint,expected", [
    (WIN, None, "desktop"), (MAC, None, "desktop"), (IPHONE, None, "mobile"), (PIXEL, None, "mobile"),
    (IPAD, None, "tablet"), (ANDROID_TAB, None, "tablet"), (None, None, "desktop"), ("", None, "desktop"),
    (MAC, "tablet", "tablet"),            # iPadOS reports itself as a Mac -> client hint
    (WIN, "mobile", "mobile"), (IPHONE, "bogus", "mobile"),   # unknown hint ignored
])
def test_classification(ua, hint, expected):
    assert classify_device(ua, hint) == expected


# ---------- the rule you asked for ----------
def test_three_slots_and_newest_login_wins(world):
    desk1, desk1_refresh = login(WIN)
    login(IPHONE)
    login(IPAD)
    assert len(live(world)) == 3
    login(MAC)                                   # second computer
    assert len(live(world)) == 3                 # still never more than 3
    first = next(s for s in world.db.sessions.docs if s["user_agent"] == WIN)
    assert first["revoked"] and first["revoked_reason"] == "device_limit"
    assert sorted(s["device_type"] for s in live(world)) == ["desktop", "mobile", "tablet"]

    # the replaced computer is out immediately: access token AND refresh token
    with pytest.raises(UnauthorizedError, match="another computer"):
        asyncio.run(AuthService.get_user_from_access_token(desk1))
    with pytest.raises(UnauthorizedError, match="another computer"):
        asyncio.run(AuthService.refresh(desk1_refresh))
    assert first["revoked"] is True              # refreshing must NOT resurrect it


def test_other_classes_are_untouched_when_one_is_replaced(world):
    login(IPHONE); login(IPAD); login(WIN)
    before = {s["device_type"]: s["sid"] for s in live(world)}
    login(PIXEL)                                 # a second phone replaces only the phone
    after = {s["device_type"]: s["sid"] for s in live(world)}
    assert after["tablet"] == before["tablet"] and after["desktop"] == before["desktop"]
    assert after["mobile"] != before["mobile"]


def test_ipad_that_looks_like_a_mac_uses_the_tablet_slot(world):
    login(MAC)                                   # real computer
    login(MAC, hint="tablet")                    # iPadOS Safari, hinted
    assert sorted(s["device_type"] for s in live(world)) == ["desktop", "tablet"]


def test_hint_cannot_exceed_three_sessions(world):
    for ua, hint in [(WIN, "mobile"), (WIN, "tablet"), (WIN, "desktop"), (WIN, "mobile"), (WIN, "tablet"), (WIN, None)]:
        login(ua, hint)
    assert len(live(world)) <= 3


def test_legacy_sessions_are_cleaned_up_on_next_login(world):
    old = datetime.now(timezone.utc) - timedelta(days=30)
    for i, ua in enumerate([WIN, WIN, WIN, IPHONE, IPHONE]):     # pre-feature: no device_type, no sid
        world.db.sessions.docs.append({"_id": ObjectId(), "user_id": world.uid, "user_agent": ua, "revoked": False,
                                       "created_at": old + timedelta(days=i), "expires_at": old + timedelta(days=90)})
    login(IPAD)
    assert len(live(world)) == 3
    assert sorted(s.get("device_type") or "legacy" for s in live(world)).count("tablet") == 1
    newest_desktop = [s for s in live(world) if s["user_agent"] == WIN][0]
    assert newest_desktop["created_at"] == old + timedelta(days=2)   # newest legacy desktop kept


def test_simultaneous_logins_converge_on_one_survivor():
    t = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a = {"_id": ObjectId(), "device_type": "desktop", "created_at": t}
    b = {"_id": ObjectId(), "device_type": "desktop", "created_at": t}     # identical timestamps
    assert {str(x["_id"]) for x in pick_losers([a, b])} == {str(x["_id"]) for x in pick_losers([b, a])}
    assert len(pick_losers([a, b])) == 1


def test_enforce_is_idempotent(world):
    login(WIN); login(IPHONE)
    assert asyncio.run(enforce_session_limits(world.db, world.uid)) == []
    assert len(live(world)) == 2


# ---------- closed sessions stay closed ----------
def test_logout_cannot_be_undone_by_refreshing(world):
    _a, refresh = login(WIN)
    asyncio.run(AuthService.logout(refresh))
    with pytest.raises(UnauthorizedError):
        asyncio.run(AuthService.refresh(refresh))
    assert live(world) == []


def test_admin_revoked_session_cannot_revive_itself(world):
    _a, refresh = login(WIN)
    world.db.sessions.docs[0].update({"revoked": True, "revoked_at": datetime.now(timezone.utc)})  # admin "sign out everywhere"
    with pytest.raises(UnauthorizedError):       # used to succeed inside a 90 s grace window and un-revoke
        asyncio.run(AuthService.refresh(refresh))
    assert world.db.sessions.docs[0]["revoked"] is True


def test_valid_refresh_issues_token_bound_to_session(world):
    _a, refresh = login(WIN)
    access, same_refresh = asyncio.run(AuthService.refresh(refresh))
    assert same_refresh == refresh
    user = asyncio.run(AuthService.get_user_from_access_token(access))
    assert user["sid"] == world.db.sessions.docs[0]["sid"]


def test_legacy_session_gets_sid_and_class_on_first_refresh(world, monkeypatch):
    _a, refresh = login(WIN)
    doc = world.db.sessions.docs[0]
    doc.pop("sid"); doc.pop("device_type")        # pretend it predates this feature
    access, _ = asyncio.run(AuthService.refresh(refresh))
    assert doc["sid"] and doc["device_type"] == "desktop"
    assert asyncio.run(AuthService.get_user_from_access_token(access))["sid"] == doc["sid"]


def test_old_access_tokens_without_sid_keep_working_until_they_expire(world):
    token = create_access_token(world.uid, {"auth_version": 0})
    assert asyncio.run(AuthService.get_user_from_access_token(token))["id"] == world.uid


# ---------- websocket + session list ----------
def test_replaced_devices_socket_is_closed_others_stay(world):
    from app.websocket.manager import ConnectionManager

    class WS:
        def __init__(self): self.closed = None
        async def accept(self): pass
        async def close(self, code=1000): self.closed = code

    async def go():
        m = ConnectionManager(); desk, phone = WS(), WS()
        await m.connect(world.uid, desk, "sid-desk"); await m.connect(world.uid, phone, "sid-phone")
        n = await m.close_sessions(world.uid, {"sid-desk"})
        return n, desk.closed, phone.closed
    n, desk, phone = asyncio.run(go())
    assert (n, desk, phone) == (1, 4403, None)


def test_session_list_marks_this_device_and_class(world, monkeypatch):
    from app.api.v1.users import router as users_router
    monkeypatch.setattr(users_router, "get_database", lambda: world.db)
    login(IPHONE); login(WIN)
    me = {"id": world.uid, "sid": next(s["sid"] for s in world.db.sessions.docs if s["device_type"] == "desktop")}
    out = asyncio.run(users_router.list_sessions(me))
    rows = out["data"] if isinstance(out, dict) else None
    if rows is None:
        import json; rows = json.loads(out.body)["data"]
    by = {r["device_type"]: r for r in rows}
    assert by["desktop"]["current"] is True and by["mobile"]["current"] is False
    assert by["mobile"]["device_label"] == "phone" and by["desktop"]["device_label"] == "computer"
