"""Study reminders: a daily reminder time per learner, Web Push subscriptions, and the cron-triggered sender.

All free: browsers' push services cost nothing, the VAPID key pair is generated once and kept in the
store (db["vapid"], so it survives restarts when DATABASE_URL is set), and an external free cron
(e.g. cron-job.org) calls /api/reminders/run every 10–15 minutes with CRON_SECRET. A learner gets at
most one reminder per local day, at or after their chosen time, and only when something is left to
do (cards due or today's tasks unfinished).
"""
import base64
import hmac
import json
import logging
import os
import re
from datetime import datetime

from cryptography.hazmat.primitives import serialization

from . import content, learner, store
from .auth import ApiError

log = logging.getLogger("ielts.reminders")
MAX_DEVICES = 5
DEFAULT = {"enabled": False, "time": "20:00", "lang": "vi", "last_sent": None}
_vapid_obj = None


def now() -> datetime:
    return datetime.now(learner.VN)


def _vapid():
    """The app's VAPID key pair, generated on first use and stored with the app state."""
    global _vapid_obj
    if _vapid_obj is None:
        from py_vapid import Vapid02
        with store.lock:
            db = store.load()
            if not db.get("vapid"):
                v = Vapid02()
                v.generate_keys()
                db["vapid"] = v.private_pem().decode()
                store.save(db)
            _vapid_obj = Vapid02.from_pem(db["vapid"].encode())
    return _vapid_obj


def public_key() -> str:
    raw = _vapid().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def cron_configured() -> bool:
    return bool(os.environ.get("CRON_SECRET"))


def settings(lr: dict) -> dict:
    return {**DEFAULT, **lr.get("reminder", {})}


def status(lr: dict) -> dict:
    s = settings(lr)
    return {"enabled": s["enabled"], "time": s["time"], "devices": len(lr.get("push", [])),
            "vapid_public_key": public_key(), "auto": cron_configured()}


def update(username: str, body: dict, lang: str) -> dict:
    time = body.get("time", DEFAULT["time"])
    if not isinstance(time, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time):
        raise ApiError(400, "Giờ nhắc phải có dạng HH:MM")

    def m(lr):
        lr["reminder"] = {**settings(lr), "enabled": bool(body.get("enabled")), "time": time, "lang": lang}
        return status(lr)
    return learner._save(username, m)


def subscribe(username: str, sub: dict) -> dict:
    endpoint = sub.get("endpoint")
    keys = sub.get("keys") or {}
    if not (isinstance(endpoint, str) and endpoint.startswith("https://") and isinstance(keys.get("p256dh"), str) and isinstance(keys.get("auth"), str)):
        raise ApiError(400, "Đăng ký thông báo không hợp lệ")
    clean = {"endpoint": endpoint, "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]}}
    with store.lock:
        db = store.load()
        # A device belongs to whoever signed in on it last.
        for lr in db["learners"].values():
            lr["push"] = [s for s in lr.get("push", []) if s["endpoint"] != endpoint]
        lr = learner.get(db, username)
        lr["push"] = lr.get("push", [])[-(MAX_DEVICES - 1):] + [clean]
        db["learners"][username] = lr
        store.save(db)
        return status(lr)


def unsubscribe(username: str, endpoint) -> dict:
    def m(lr):
        lr["push"] = [s for s in lr.get("push", []) if s["endpoint"] != endpoint]
        return status(lr)
    return learner._save(username, m)


TEXT = {
    "vi": {"cards": ("Bạn có {0} từ sắp quên 🧠", "Ôn 5 phút ngay bây giờ để nhớ lâu hơn."),
           "tasks": ("Đến giờ học rồi! 📚", "Còn {0} nhiệm vụ hôm nay."), "streak": " Giữ chuỗi {0} ngày nhé!",
           "new": ("{0} từ mới đang chờ bạn ✨", "Học vài từ trước khi ngủ là cách nhớ lâu."),
           "test": ("IELTS Road 🔔", "Thông báo đã hoạt động. Bạn sẽ được nhắc học đúng giờ.")},
    "en": {"cards": ("{0} words are about to slip 🧠", "A 5-minute review now makes them stick."),
           "tasks": ("Time to study! 📚", "{0} tasks left today."), "streak": " Keep your {0}-day streak!",
           "new": ("{0} new words are waiting ✨", "A few words before bed is a great way to remember."),
           "test": ("IELTS Road 🔔", "Notifications work. You'll be reminded at your study time.")},
}


def message(lr: dict, lang: str) -> dict | None:
    """What to remind about, most urgent first; None when there is nothing left for today."""
    tx = TEXT.get(lang, TEXT["vi"])
    queue = learner.review_queue(lr)
    due = sum(1 for w in queue if w["card"])
    day = learner.current_day(lr)
    left = len(content.build_day(day)["tasks"]) - len(lr["done"].get(str(day), []))
    studied = learner.today().isoformat() in lr["activity"]
    if due:
        title, body, url = *tx["cards"], "/#/cards"
        title = title.format(due)
    elif left and not studied:
        title, body, url = tx["tasks"][0], tx["tasks"][1].format(left), "/#/today"
        streak = learner.streak(lr)
        if streak:
            body += tx["streak"].format(streak)
    elif len(queue) and not studied:
        title, body, url = tx["new"][0].format(len(queue)), tx["new"][1], "/#/cards"
    else:
        return None
    return {"title": title, "body": body, "url": url, "tag": "ielts-reminder"}


def _push(sub: dict, data: dict) -> int:
    """Send one notification; returns the push service's HTTP status (0 on network error). Tests replace this."""
    from pywebpush import WebPushException, webpush
    try:
        webpush(sub, json.dumps(data, ensure_ascii=False), vapid_private_key=_vapid(), ttl=6 * 3600, timeout=10,
                vapid_claims={"sub": os.environ.get("VAPID_SUBJECT") or "mailto:ielts-road@example.com"})
        return 201
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0
    except Exception as e:  # network errors must not stop the run for other learners
        log.warning("push failed: %s", e)
        return 0


def _deliver(jobs: list[tuple[str, list, dict]]) -> int:
    """Send outside the store lock, then forget devices whose subscription has expired (404/410)."""
    sent, gone = 0, set()
    for _, subs, data in jobs:
        for s in subs:
            code = _push(s, data)
            if code in (404, 410):
                gone.add(s["endpoint"])
            elif 200 <= code < 300:
                sent += 1
    if gone:
        with store.lock:
            db = store.load()
            for username, _, _ in jobs:
                lr = db["learners"].get(username)
                if lr:
                    lr["push"] = [s for s in lr.get("push", []) if s["endpoint"] not in gone]
            store.save(db)
    return sent


def send_test(username: str, lang: str) -> dict:
    lr = learner.get(store.load(), username)
    if not lr.get("push"):
        raise ApiError(400, "Thiết bị này chưa bật thông báo")
    title, body = TEXT.get(lang, TEXT["vi"])["test"]
    return {"sent": _deliver([(username, lr["push"], {"title": title, "body": body, "url": "/#/today", "tag": "ielts-test"})])}


def check_key(key: str | None) -> None:
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        raise ApiError(503, "Chưa cấu hình CRON_SECRET trên máy chủ")
    if not key or not hmac.compare_digest(key, secret):
        raise ApiError(403, "Sai khóa cron")


def run() -> dict:
    """Called by the cron: send today's reminder to every learner whose time has come."""
    t = now()
    hhmm, today = t.strftime("%H:%M"), t.date().isoformat()
    jobs = []
    with store.lock:
        db = store.load()
        active = {u["username"] for u in db["users"] if u.get("role", "learner") == "learner" and u.get("active", True)}
        for username, raw in db["learners"].items():
            lr = learner.get(db, username)
            s = settings(lr)
            if username not in active or not s["enabled"] or not lr.get("push") or s["last_sent"] == today or hhmm < s["time"]:
                continue
            msg = message(lr, s["lang"])
            raw["reminder"] = {**s, "last_sent": today}  # checked for today, even when there was nothing to say
            if msg:
                jobs.append((username, list(lr["push"]), msg))
        store.save(db)
    sent = _deliver(jobs)
    log.info("reminders_run at=%s learners=%s sent=%s", hhmm, len(jobs), sent)
    return {"time": hhmm, "learners": len(jobs), "sent": sent}
