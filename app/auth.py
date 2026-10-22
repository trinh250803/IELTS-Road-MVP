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
    return {k: u.get(k) for k in ("username", "full_name", "created_at")}


def check_password_policy(pw) -> None:
    if not isinstance(pw, str) or len(pw) < MIN_PASSWORD:
        raise ApiError(400, f"Mật khẩu phải có ít nhất {MIN_PASSWORD} ký tự")


def register(data: dict) -> dict:
    username = str(data.get("username") or "").strip().lower()
    if not USERNAME_RE.match(username):
        raise ApiError(400, "Tên đăng nhập 3–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới")
    check_password_policy(data.get("password"))
    with store.lock:
        db = store.load()
        if any(u["username"] == username for u in db["users"]):
            raise ApiError(409, "Tên đăng nhập đã tồn tại")
        user = {"username": username, "full_name": str(data.get("full_name") or "").strip()[:80] or username,
                "password_hash": hash_password(data["password"]), "session_epoch": 0, "created_at": now_iso()}
        db["users"].append(user)
        store.save(db)
    return {"token": issue_token(user), "user": public_user(user)}


def demo_account() -> dict | None:
    """DEMO_ACCOUNT=username:password (test environments only). Returned to the login page for prefill."""
    raw = os.environ.get("DEMO_ACCOUNT", "")
    username, _, password = raw.partition(":")
    return {"username": username.strip().lower(), "password": password} if username and password else None


def ensure_demo_account() -> None:
    demo = demo_account()
    if not demo or any(u["username"] == demo["username"] for u in store.load()["users"]):
        return
    register({**demo, "full_name": "Học viên dùng thử"})


def login(username: str, password: str) -> dict:
    username = str(username or "").strip().lower()
    u = next((x for x in store.load()["users"] if x["username"] == username), None)
    if not u or not verify_password(password or "", u["password_hash"]):
        raise ApiError(401, "Sai tên đăng nhập hoặc mật khẩu")
    return {"token": issue_token(u), "user": public_user(u)}


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
    if not u or u.get("session_epoch", 0) != payload.get("e", 0):
        raise ApiError(401, "Tài khoản không còn hiệu lực hoặc mật khẩu đã đổi")
    request.state.session = payload
    return u


def logout(payload: dict) -> None:
    with store.lock:
        db = store.load()
        now = time.time()
        db["revoked_tokens"] = {j: exp for j, exp in db["revoked_tokens"].items() if exp > now}
        db["revoked_tokens"][payload["jti"]] = payload["exp"]
        store.save(db)
