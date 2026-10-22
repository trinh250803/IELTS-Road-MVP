"""Motivation layer: XP, levels, badges, daily goal, weekly leaderboard, mini-game results.

XP is stored per local day in learner["xp_days"] (date → points), so totals and "last 7 days"
are sums. Badges are derived from learner state, never stored, so they cannot drift.
"""
from datetime import timedelta

from . import content, learner, store
from .auth import ApiError, now_iso
from .learner import award

GAME_XP_PER_CORRECT = 2
GAME_XP_DAILY_CAP = 100
DAILY_GOAL = 60
GAMES = ("match", "listen")


def total_xp(lr: dict) -> int:
    return sum(lr.get("xp_days", {}).values())


def xp_since(lr: dict, days: int) -> int:
    start = (learner.today() - timedelta(days=days - 1)).isoformat()
    return sum(v for k, v in lr.get("xp_days", {}).items() if k >= start)


def level_info(xp: int) -> dict:
    """Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, …"""
    lvl = 1
    while 50 * (lvl + 1) * lvl <= xp:
        lvl += 1
    lo, hi = 50 * lvl * (lvl - 1), 50 * (lvl + 1) * lvl
    return {"level": lvl, "xp": xp, "level_start": lo, "next_level": hi, "pct": round((xp - lo) / (hi - lo) * 100)}


def best_streak(lr: dict) -> int:
    days = sorted(lr["activity"])
    best = run = 0
    prev = None
    for d in days:
        cur = learner.date.fromisoformat(d)
        run = run + 1 if prev and cur - prev == timedelta(days=1) else 1
        best, prev = max(best, run), cur
    return best


def badges(lr: dict) -> list[dict]:
    weekly = [a for a in lr["attempts"] if a["kind"] == "weekly" and a["status"] == "submitted"]
    passed = {a["week"] for a in weekly if a["passed"]}
    learned = sum(1 for c in lr["cards"].values() if c.get("reps", 0) >= 1)
    streak = best_streak(lr)
    rules = [
        ("first_step", any(lr["done"].values())),
        ("placement", bool(lr["placement"])),
        ("streak_3", streak >= 3), ("streak_7", streak >= 7), ("streak_30", streak >= 30),
        ("words_25", learned >= 25), ("words_70", learned >= 70),
        ("test_pass", bool(passed)), ("perfect", any(a["pct"] == 100 for a in weekly)),
        ("phase_1", {1, 2, 3, 4} <= passed), ("phase_2", {5, 6, 7, 8} <= passed), ("finisher", set(range(1, 13)) <= passed),
        ("gamer", len(lr.get("games", [])) >= 10), ("writer", bool(lr["essays"])),
        ("xp_1000", total_xp(lr) >= 1000),
    ]
    return [{"id": i, "earned": bool(ok)} for i, ok in rules]


def profile(lr: dict) -> dict:
    xp = total_xp(lr)
    return {**level_info(xp), "today_xp": xp_since(lr, 1), "daily_goal": DAILY_GOAL, "week_xp": xp_since(lr, 7),
            "best_streak": best_streak(lr), "streak": learner.streak(lr), "badges": badges(lr),
            "games_played": len(lr.get("games", []))}


def display_name(full_name: str) -> str:
    """Leaderboard privacy: given name + initial of the family name ("Nguyễn Văn Lan" → "Lan N.")."""
    parts = full_name.split()
    return f"{parts[-1]} {parts[0][0]}." if len(parts) > 1 else full_name


def leaderboard(db: dict, username: str, limit: int = 10) -> dict:
    rows = []
    for u in db["users"]:
        if u.get("role", "learner") != "learner" or not u.get("active", True):
            continue
        lr = learner.get(db, u["username"])
        rows.append({"username": u["username"], "name": display_name(u["full_name"]), "week_xp": xp_since(lr, 7),
                     "level": level_info(total_xp(lr))["level"]})
    rows.sort(key=lambda r: (-r["week_xp"], r["name"]))
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    me = next((r for r in rows if r["username"] == username), None)
    strip = lambda r: {k: v for k, v in r.items() if k != "username"} | {"me": r["username"] == username}
    return {"top": [strip(r) for r in rows[:limit]], "me": strip(me) if me else None, "total": len(rows)}


def record_game(username: str, data: dict) -> dict:
    game = data.get("game")
    correct, total, duration = data.get("correct"), data.get("total"), data.get("duration_s")
    if game not in GAMES or not all(isinstance(x, int) for x in (correct, total, duration)) or not 0 <= correct <= total <= 50 or duration < 0:
        raise ApiError(400, "Trò chơi không hợp lệ")

    def m(lr):
        key = learner.today().isoformat()
        earned_today = sum(g["xp"] for g in lr.setdefault("games", []) if g["day"] == key)
        xp = max(0, min(correct * GAME_XP_PER_CORRECT, GAME_XP_DAILY_CAP - earned_today))
        entry = {"game": game, "correct": correct, "total": total, "duration_s": duration, "xp": xp, "at": now_iso(), "day": key}
        lr["games"] = [entry, *lr["games"]][:200]
        award(lr, xp)
        best = max((g["correct"] / g["total"] for g in lr["games"] if g["game"] == game and g["total"]), default=0)
        return {**entry, "best_pct": round(best * 100), "capped": xp < correct * GAME_XP_PER_CORRECT}
    return learner._save(username, m)


def game_words(lr: dict) -> list[dict]:
    """Words for mini-games: what the learner has unlocked, at least the first week's set."""
    words = learner.unlocked_words(lr)
    return words if len(words) >= 12 else [w for w in content.vocab() if w["day"] <= 6]


def me(username: str) -> dict:
    return profile(learner.get(store.load(), username))
