"""Admin reports: overview KPIs and trends, per-learner rows, one learner's detail, all attempts, CSV."""
import csv
import io
from datetime import timedelta

from . import content, exams, game, learner, store

TREND_DAYS = 14


def _learners(db: dict) -> list[tuple[dict, dict]]:
    return [(u, learner.get(db, u["username"])) for u in db["users"] if u.get("role", "learner") == "learner"]


def _last_active(lr: dict) -> str | None:
    dates = list(lr["activity"]) + [k for k, v in lr["xp_days"].items() if v] + [a["started_at"][:10] for a in lr["attempts"]]
    return max(dates) if dates else None


def learner_row(u: dict, lr: dict) -> dict:
    weekly = [a for a in lr["attempts"] if a["kind"] == "weekly" and a["status"] == "submitted"]
    dash = learner.dashboard(lr)
    xp = game.total_xp(lr)
    return {
        "username": u["username"], "full_name": u["full_name"], "active": u.get("active", True), "created_at": u["created_at"],
        "last_active": _last_active(lr), "start_week": lr["start_week"], "current_day": dash["today"]["day"],
        "progress_pct": dash["progress_pct"], "streak": dash["streak"], "minutes_7d": dash["minutes_7d"],
        "xp": xp, "level": game.level_info(xp)["level"], "week_xp": game.xp_since(lr, 7),
        "placement_level": (lr["placement"] or {}).get("level"), "placement_level_en": (lr["placement"] or {}).get("level_en"),
        "tests_passed": len({a["week"] for a in weekly if a["passed"]}), "attempts": sum(1 for a in lr["attempts"] if a["status"] == "submitted"),
        "avg_test_pct": round(sum(a["pct"] for a in weekly) / len(weekly)) if weekly else None,
        "words_learned": sum(1 for c in lr["cards"].values() if c.get("reps", 0) >= 1), "essays": len(lr["essays"]),
    }


def overview(db: dict) -> dict:
    pairs = _learners(db)
    today = learner.today()
    days = [(today - timedelta(days=i)).isoformat() for i in range(TREND_DAYS - 1, -1, -1)]
    week_ago = days[-7]
    trend = [{"date": d, "active": sum(1 for _, lr in pairs if lr["activity"].get(d) or lr["xp_days"].get(d)),
              "minutes": sum(lr["activity"].get(d, 0) for _, lr in pairs)} for d in days]
    weekly = []
    for w in range(1, content.WEEKS + 1):
        per_learner = [[a for a in lr["attempts"] if a["kind"] == "weekly" and a["week"] == w and a["status"] == "submitted"] for _, lr in pairs]
        atts = [a for xs in per_learner for a in xs]
        weekly.append({"week": w, "attempts": len(atts), "learners": sum(1 for xs in per_learner if xs),
                       "passed_learners": sum(1 for xs in per_learner if any(a["passed"] for a in xs)),
                       "pass_rate": round(sum(a["passed"] for a in atts) / len(atts) * 100) if atts else None,
                       "avg_pct": round(sum(a["pct"] for a in atts) / len(atts)) if atts else None})
    placement = {}
    for _, lr in pairs:
        if lr["placement"]:
            key = lr["placement"]["level"]
            placement.setdefault(key, {"level": key, "level_en": lr["placement"].get("level_en", key), "count": 0})["count"] += 1
    rows = [learner_row(u, lr) for u, lr in pairs]
    submitted = [a for _, lr in pairs for a in lr["attempts"] if a["status"] == "submitted"]
    return {
        "learners": len(pairs), "active_today": trend[-1]["active"],
        "active_7d": sum(1 for _, lr in pairs if any(d >= week_ago for d in lr["activity"]) or game.xp_since(lr, 7)),
        "new_7d": sum(1 for u, _ in pairs if u["created_at"][:10] >= week_ago),
        "minutes_7d": sum(t["minutes"] for t in trend[-7:]), "attempts_total": len(submitted),
        "pass_rate": (lambda w: round(sum(1 for a in w if a["passed"]) / len(w) * 100) if w else None)([a for a in submitted if a["kind"] == "weekly"]),
        "avg_progress": round(sum(r["progress_pct"] for r in rows) / len(rows)) if rows else 0,
        "trend": trend, "weekly": weekly, "placement": sorted(placement.values(), key=lambda x: -x["count"]),
        "top": sorted(rows, key=lambda r: -r["week_xp"])[:5],
        "storage": store.backend(),
    }


def learners(db: dict) -> list[dict]:
    return sorted((learner_row(u, lr) for u, lr in _learners(db)), key=lambda r: r["last_active"] or "", reverse=True)


def learner_detail(db: dict, username: str) -> dict | None:
    u = next((x for x in db["users"] if x["username"] == username and x.get("role", "learner") == "learner"), None)
    if not u:
        return None
    lr = learner.get(db, username)
    return {**learner_row(u, lr), "placement": lr["placement"], "profile": game.profile(lr),
            "attempts": [exams.summary(a) for a in lr["attempts"]], "activity": lr["activity"], "xp_days": lr["xp_days"],
            "games": lr["games"][:20], "essays": [{k: e[k] for k in ("created_at", "task_type", "words")} | {"overall": e["result"]["overall"]}
                                                 for e in lr["essays"]]}


def attempts(db: dict, limit: int = 500) -> list[dict]:
    rows = [exams.summary(a) | {"username": u["username"], "full_name": u["full_name"]}
            for u, lr in _learners(db) for a in lr["attempts"]]
    return sorted(rows, key=lambda r: r["started_at"], reverse=True)[:limit]


def to_csv(rows: list[dict], columns: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)
    return "﻿" + buf.getvalue()  # BOM so Excel opens Vietnamese text correctly


LEARNER_COLUMNS = ["username", "full_name", "active", "created_at", "last_active", "placement_level", "start_week", "current_day",
                   "progress_pct", "streak", "minutes_7d", "xp", "level", "tests_passed", "avg_test_pct", "attempts", "words_learned", "essays"]
ATTEMPT_COLUMNS = ["started_at", "submitted_at", "username", "full_name", "kind", "week", "title", "status", "score", "total", "pct",
                   "passed", "duration_s", "time_limit_s", "overtime"]
