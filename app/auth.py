"""Learner accounts and sessions.

Passwords: PBKDF2-SHA256 with per-user salt.
Sessions: HMAC-signed tokens valid 7 days, stateless so a server restart does not log anyone
out. Logout adds the token id to a deny list; changing the password bumps session_epoch.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone

from fastapi import Request

from . import store

SESSION_TTL_S = 7 * 24 * 3600
PBKDF2_ITER = 200_000
MIN_PASSWORD = 8
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.]{3,32}$")


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, PBKDF2_ITER)
    return f"pbkdf2_sha256${PBKDF2_ITER}${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, it, salt, dk = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(calc.hex(), dk)
    except (ValueError, AttributeError):
        return False


_SECRET: bytes | None = None


def _secret() -> bytes:
    """SESSION_SECRET from the environment; otherwise a random secret persisted next to the db."""
    global _SECRET
    if _SECRET is None:
        env = os.environ.get("SESSION_SECRET")
        if env:
            _SECRET = env.encode()
        else:
            p = store.db_path().parent / ".session_secret"
            try:
                _SECRET = p.read_bytes()
            except FileNotFoundError:
                p.parent.mkdir(parents=True, exist_ok=True)
                _SECRET = secrets.token_hex(32).encode()
                p.write_bytes(_SECRET)
    return _SECRET


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(user: dict) -> str:
    payload = {"u": user["username"], "e": user.get("session_epoch", 0), "jti": secrets.token_hex(8), "exp": int(time.time()) + SESSION_TTL_S}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".")
        good = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    return payload if payload.get("exp", 0) > time.time() else None


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("username", "full_name", "created_at")} | {"role": u.get("role", "learner"), "active": u.get("active", True)}


def check_password_policy(pw) -> None:
    if not isinstance(pw, str) or len(pw) < MIN_PASSWORD:
        raise ApiError(400, f"Mật khẩu phải có ít nhất {MIN_PASSWORD} ký tự")


def _new_user(db: dict, data: dict, role: str = "learner") -> dict:
    username = str(data.get("username") or "").strip().lower()
    if not USERNAME_RE.match(username):
        raise ApiError(400, "Tên đăng nhập 3–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới")
    check_password_policy(data.get("password"))
    if any(u["username"] == username for u in db["users"]):
        raise ApiError(409, "Tên đăng nhập đã tồn tại")
    user = {"username": username, "full_name": str(data.get("full_name") or "").strip()[:80] or username, "role": role, "active": True,
            "password_hash": hash_password(data["password"]), "session_epoch": 0, "created_at": now_iso()}
    db["users"].append(user)
    return user


def register(data: dict) -> dict:
    with store.lock:
        db = store.load()
        user = _new_user(db, data)
        store.save(db)
    return {"token": issue_token(user), "user": public_user(user)}


def _env_account(name: str) -> dict | None:
    raw = os.environ.get(name, "")
    username, _, password = raw.partition(":")
    return {"username": username.strip().lower(), "password": password} if username and password else None


def demo_account() -> dict | None:
    """DEMO_ACCOUNT=username:password (test environments only). Returned to the login page for prefill."""
    return _env_account("DEMO_ACCOUNT")


def ensure_accounts() -> None:
    """Create the demo learner (DEMO_ACCOUNT) and the admin (ADMIN_ACCOUNT) if missing.
    The admin's password always follows the environment, so changing it on the host takes effect."""
    with store.lock:
        db = store.load()
        demo = demo_account()
        if demo and not any(u["username"] == demo["username"] for u in db["users"]):
            _new_user(db, {**demo, "full_name": "Học viên dùng thử"})
        admin = _env_account("ADMIN_ACCOUNT")
        if admin:
            u = next((x for x in db["users"] if x["username"] == admin["username"]), None)
            if not u:
                _new_user(db, {**admin, "full_name": "Quản trị viên"}, role="admin")
            elif u.get("role") != "admin" or not verify_password(admin["password"], u["password_hash"]):
                u.update(role="admin", active=True, password_hash=hash_password(admin["password"]), session_epoch=u.get("session_epoch", 0) + 1)
        store.save(db)


def login(username: str, password: str) -> dict:
    username = str(username or "").strip().lower()
    u = next((x for x in store.load()["users"] if x["username"] == username), None)
    if not u or not verify_password(password or "", u["password_hash"]):
        raise ApiError(401, "Sai tên đăng nhập hoặc mật khẩu")
    if not u.get("active", True):
        raise ApiError(403, "Tài khoản đã bị khóa")
    return {"token": issue_token(u), "user": public_user(u)}


# ---------- Admin: managing learner accounts ----------
def gen_password() -> str:
    return secrets.token_urlsafe(6).replace("-", "x").replace("_", "y") + "9"


def create_learners(rows) -> list[dict]:
    """rows: [{username, full_name, password?}]. All or nothing; generated passwords are returned once."""
    if not isinstance(rows, list) or not rows:
        raise ApiError(400, "Danh sách trống")
    out = []
    with store.lock:
        db = store.load()
        for i, r in enumerate(rows, 1):
            pw = str((r or {}).get("password") or "") or gen_password()
            try:
                u = _new_user(db, {**(r or {}), "password": pw})
            except ApiError as e:
                raise ApiError(e.status, f"Dòng {i}: {e.message}")
            out.append({"username": u["username"], "full_name": u["full_name"], "password": pw})
        store.save(db)
    return out


def _update_learner(username: str, mutate) -> dict:
    with store.lock:
        db = store.load()
        u = next((x for x in db["users"] if x["username"] == username and x.get("role", "learner") == "learner"), None)
        if not u:
            raise ApiError(404, "Không tìm thấy học viên")
        out = mutate(u)
        store.save(db)
    return out


def set_active(username: str, active: bool) -> dict:
    def m(u):
        u["active"] = bool(active)
        u["session_epoch"] = u.get("session_epoch", 0) + 1  # signs the learner out everywhere
        return public_user(u)
    return _update_learner(username, m)


def reset_password(username: str) -> dict:
    pw = gen_password()

    def m(u):
        u.update(password_hash=hash_password(pw), session_epoch=u.get("session_epoch", 0) + 1)
        return {"username": u["username"], "password": pw}
    return _update_learner(username, m)


def _token(request: Request) -> str | None:
    h = request.headers.get("authorization", "")
    return h[7:] if h.lower().startswith("bearer ") else None


def current_user(request: Request) -> dict:
    token = _token(request)
    if not token:
        raise ApiError(401, "Chưa đăng nhập")
    payload = read_token(token)
    if not payload:
        raise ApiError(401, "Phiên đăng nhập hết hạn")
    db = store.load()
    if payload["jti"] in db["revoked_tokens"]:
        raise ApiError(401, "Phiên đăng nhập đã kết thúc")
    u = next((x for x in db["users"] if x["username"] == payload["u"]), None)
    if not u or not u.get("active", True) or u.get("session_epoch", 0) != payload.get("e", 0):
        raise ApiError(401, "Tài khoản không còn hiệu lực hoặc mật khẩu đã đổi")
    request.state.session = payload
    return u


def require_admin(request: Request) -> dict:
    u = current_user(request)
    if u.get("role") != "admin":
        raise ApiError(403, "Bạn không có quyền thực hiện thao tác này")
    return u


def logout(payload: dict) -> None:
    with store.lock:
        db = store.load()
        now = time.time()
        db["revoked_tokens"] = {j: exp for j, exp in db["revoked_tokens"].items() if exp > now}
        db["revoked_tokens"][payload["jti"]] = payload["exp"]
        store.save(db)
