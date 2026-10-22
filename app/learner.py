"""Per-learner state: placement result, start week, completed tasks, study minutes, flashcards.

Stored in db["learners"][username]. Dates use Vietnam time (UTC+7) so a study day ends at
local midnight.
"""
from datetime import date, datetime, timedelta, timezone

from . import content, store
from .auth import ApiError, now_iso

VN = timezone(timedelta(hours=7))
NEW_CARDS_PER_QUEUE = 20
GRADES = ("again", "hard", "good", "easy")


def today() -> date:
    return datetime.now(VN).date()


def _blank() -> dict:
    return {"placement": None, "start_week": 1, "done": {}, "activity": {}, "cards": {}, "essays": []}


def get(db: dict, username: str) -> dict:
    return {**_blank(), **db["learners"].get(username, {})}


def _save(username: str, mutate):
    """Load → mutate(learner) → save, under the store lock. Returns mutate's result."""
    with store.lock:
        db = store.load()
        lr = get(db, username)
        out = mutate(lr)
        db["learners"][username] = lr
        store.save(db)
    return out


def current_day(lr: dict) -> int:
    """First day from the start week whose tasks are not all done."""
    for d in range(content.first_day_of_week(lr["start_week"]), content.TOTAL_DAYS + 1):
        if len(lr["done"].get(str(d), [])) < len(content.build_day(d)["tasks"]):
            return d
    return content.TOTAL_DAYS


def streak(lr: dict) -> int:
    d, n = today(), 0
    if d.isoformat() not in lr["activity"]:
        d -= timedelta(days=1)  # today not studied yet: streak still counts up to yesterday
    while d.isoformat() in lr["activity"]:
        n += 1
        d -= timedelta(days=1)
    return n


def save_placement(username: str, result: dict) -> dict:
    def m(lr):
        lr["placement"] = {**result, "taken_at": now_iso()}
        lr["start_week"] = result["start_week"]
        return lr["placement"]
    return _save(username, m)


def set_start_week(username: str, week) -> int:
    if not isinstance(week, int) or not 1 <= week <= content.WEEKS:
        raise ApiError(400, f"Tuần bắt đầu phải từ 1 đến {content.WEEKS}")

    def m(lr):
        lr["start_week"] = week
        return week
    return _save(username, m)


def set_task(username: str, day: int, task_id: str, done: bool) -> dict:
    try:
        plan = content.build_day(day)
    except ValueError:
        raise ApiError(404, "Không có ngày học này")
    task = next((t for t in plan["tasks"] if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Không có nhiệm vụ này")

    def m(lr):
        done_ids = lr["done"].setdefault(str(day), [])
        key = today().isoformat()
        if done and task_id not in done_ids:
            done_ids.append(task_id)
            lr["activity"][key] = lr["activity"].get(key, 0) + task["minutes"]
        elif not done and task_id in done_ids:
            done_ids.remove(task_id)
            if key in lr["activity"]:
                lr["activity"][key] = max(0, lr["activity"][key] - task["minutes"])
                if not lr["activity"][key]:
                    del lr["activity"][key]
        return {"day": day, "done": done_ids, "complete": len(done_ids) == len(plan["tasks"])}
    return _save(username, m)


def dashboard(lr: dict) -> dict:
    day = current_day(lr)
    plan = content.build_day(day)
    start = content.first_day_of_week(lr["start_week"])
    span = content.TOTAL_DAYS - start + 1
    finished = sum(1 for d in range(start, content.TOTAL_DAYS + 1) if len(lr["done"].get(str(d), [])) == len(content.build_day(d)["tasks"]))
    week_ago = today() - timedelta(days=6)
    return {
        "today": {**plan, "done": lr["done"].get(str(day), [])},
        "phase": content.phase_def(plan["phase"]),
        "start_week": lr["start_week"], "placement": lr["placement"],
        "streak": streak(lr),
        "minutes_7d": sum(m for k, m in lr["activity"].items() if k >= week_ago.isoformat()),
        "days_finished": finished, "days_total": span, "progress_pct": round(finished / span * 100),
        "cards_due": len(review_queue(lr)),
    }


# ---------- Flashcards: SM-2 with four buttons ----------
def unlocked_words(lr: dict) -> list[dict]:
    day = current_day(lr)
    return [w for w in content.vocab() if w["day"] <= day]


def review_queue(lr: dict, limit_new: int = NEW_CARDS_PER_QUEUE) -> list[dict]:
    t = today().isoformat()
    due, new = [], []
    for w in unlocked_words(lr):
        card = lr["cards"].get(w["id"])
        if card is None:
            new.append({**w, "card": None})
        elif card["due"] <= t:
            due.append({**w, "card": card})
    due.sort(key=lambda x: x["card"]["due"])
    return due + new[:limit_new]


def schedule(card: dict | None, grade: str) -> dict:
    card = dict(card or {"ease": 2.5, "interval": 0, "reps": 0, "lapses": 0})
    q = GRADES.index(grade) + 2  # again=2 … easy=5 on the SM-2 0–5 scale
    card["ease"] = round(max(1.3, card["ease"] + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), 2)
    if grade == "again":
        card.update(reps=0, interval=0, lapses=card["lapses"] + 1)
    else:
        if card["reps"] == 0:
            interval = 1
        elif card["reps"] == 1:
            interval = 3
        else:
            interval = card["interval"] * card["ease"]
        if grade == "hard":
            interval = max(1, card["interval"] * 1.2) if card["reps"] else 1
        elif grade == "easy":
            interval *= 1.3
        card.update(reps=card["reps"] + 1, interval=round(interval, 1))
    card["due"] = (today() + timedelta(days=round(card["interval"]))).isoformat()
    card["last_review"] = now_iso()
    return card


def review(username: str, word_id: str, grade: str) -> dict:
    if grade not in GRADES:
        raise ApiError(400, "Mức đánh giá không hợp lệ")
    if not any(w["id"] == word_id for w in content.vocab()):
        raise ApiError(404, "Không có từ này")

    def m(lr):
        lr["cards"][word_id] = schedule(lr["cards"].get(word_id), grade)
        return lr["cards"][word_id]
    return _save(username, m)
