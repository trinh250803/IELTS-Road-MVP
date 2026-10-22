"""Tests and the attempt log: placement test and the weekly test of each week.

Every attempt is logged in learner["attempts"] from the moment it starts: start/submit time,
duration, time limit, each answer with right/wrong, score per section, pass/fail. Starting a
new attempt of the same test abandons an unfinished one (kept in the log as "abandoned").
A passed weekly test ticks the "weekly_test" task of that week's review day.
Each start/submit is also written to the server log.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from functools import lru_cache

from . import content, learner
from .auth import ApiError, now_iso

log = logging.getLogger("ielts.exams")

MAX_ATTEMPTS = 500
GRACE_S = 120  # submissions later than limit + grace are graded but flagged as overtime


@lru_cache
def weekly(week: int) -> dict | None:
    p = content.CONTENT / "tests" / f"week{week:02d}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None


def placement() -> dict:
    p = content.placement()
    return {"title": "Kiểm tra đầu vào", "time_limit_min": 20, "pass_pct": None, "passage": p["passage"],
            "questions": [{**q, "section": q["level"]} for q in p["questions"]]}


def definition(kind: str, week: int | None) -> dict:
    t = placement() if kind == "placement" else weekly(week) if kind == "weekly" and isinstance(week, int) else None
    if not t:
        raise ApiError(404, "Không có bài thi này")
    return t


def public(t: dict) -> list[dict]:
    return [{k: q[k] for k in ("id", "section", "q", "options")} for q in t["questions"]]


def current_week(lr: dict) -> int:
    return (learner.current_day(lr) - 1) // content.DAYS_PER_WEEK + 1


def _elapsed_s(a: dict) -> int:
    return int((datetime.now(timezone.utc) - datetime.fromisoformat(a["started_at"])).total_seconds())


def _status(a: dict) -> str:
    if a["status"] == "in_progress" and _elapsed_s(a) > a["time_limit_s"] + 30 * 60:
        return "expired"  # opened and never submitted
    return a["status"]


def summary(a: dict) -> dict:
    keys = ("id", "kind", "week", "title", "started_at", "submitted_at", "duration_s", "time_limit_s", "score", "total", "pct", "passed", "overtime")
    return {k: a.get(k) for k in keys} | {"status": _status(a)}


def hub(lr: dict) -> dict:
    cw = current_week(lr)
    attempts = lr["attempts"]
    weeks = []
    for w in range(1, content.WEEKS + 1):
        t = weekly(w)
        done = [a for a in attempts if a["kind"] == "weekly" and a["week"] == w and a["status"] == "submitted"]
        weeks.append({
            "week": w, "title": t["title"] if t else f"Kiểm tra tuần {w}", "ready": bool(t),
            "time_limit_min": t and t["time_limit_min"], "pass_pct": t and t["pass_pct"], "questions": t and len(t["questions"]),
            "available": bool(t) and w <= cw, "attempts": len(done),
            "best_pct": max((a["pct"] for a in done), default=None), "passed": any(a["passed"] for a in done),
        })
    return {"current_week": cw, "placement": lr["placement"], "weeks": weeks,
            "placement_attempts": sum(1 for a in attempts if a["kind"] == "placement" and a["status"] == "submitted")}


def start(username: str, kind: str, week) -> dict:
    t = definition(kind, week)

    def m(lr):
        if kind == "weekly" and week > current_week(lr):
            raise ApiError(403, f"Bài kiểm tra tuần {week} mở khi bạn học tới tuần {week}")
        for a in lr["attempts"]:
            if a["kind"] == kind and a.get("week") == (week if kind == "weekly" else None) and a["status"] == "in_progress":
                a["status"] = "abandoned"
        a = {"id": uuid.uuid4().hex[:12], "kind": kind, "week": week if kind == "weekly" else None, "title": t["title"],
             "status": "in_progress", "started_at": now_iso(), "time_limit_s": t["time_limit_min"] * 60,
             "pass_pct": t["pass_pct"], "question_ids": [q["id"] for q in t["questions"]]}
        lr["attempts"] = [a, *lr["attempts"]][:MAX_ATTEMPTS]
        return a
    a = learner._save(username, m)
    log.info("exam_start user=%s attempt=%s kind=%s week=%s", username, a["id"], kind, a["week"])
    return in_progress_view(a, t)


def in_progress_view(a: dict, t: dict) -> dict:
    return {**summary(a), "passage": t.get("passage"), "questions": public(t),
            "remaining_s": max(0, a["time_limit_s"] - _elapsed_s(a))}


def _grade(t: dict, answers: dict) -> tuple[dict, list[dict]]:
    sections: dict[str, dict] = {}
    review = []
    for q in t["questions"]:
        given = answers.get(q["id"])
        given = given if isinstance(given, int) and 0 <= given < len(q["options"]) else None
        ok = given == q["answer"]
        s = sections.setdefault(q["section"], {"correct": 0, "total": 0})
        s["correct"] += ok
        s["total"] += 1
        review.append({"id": q["id"], "answer": given, "correct": ok})
    return sections, review


def submit(username: str, attempt_id: str, answers) -> dict:
    if not isinstance(answers, dict):
        raise ApiError(400, "Thiếu câu trả lời")

    def m(lr):
        a = next((x for x in lr["attempts"] if x["id"] == attempt_id), None)
        if not a:
            raise ApiError(404, "Không tìm thấy lượt thi")
        if a["status"] != "in_progress":
            raise ApiError(409, "Lượt thi này đã kết thúc")
        t = definition(a["kind"], a["week"])
        sections, review = _grade(t, answers)
        score = sum(r["correct"] for r in review)
        elapsed = _elapsed_s(a)
        a.update(status="submitted", submitted_at=now_iso(), duration_s=elapsed, overtime=elapsed > a["time_limit_s"] + GRACE_S,
                 answers=review, sections=sections, score=score, total=len(review), pct=round(score / len(review) * 100))
        if a["kind"] == "placement":
            res = content.score_placement({r["id"]: r["answer"] for r in review})
            a["result"] = res
            lr["placement"] = {**res, "taken_at": a["submitted_at"]}
            lr["start_week"] = res["start_week"]
            a["passed"] = None
        else:
            a["passed"] = a["pct"] >= a["pass_pct"]
            if a["passed"]:
                _tick_weekly_task(lr, a["week"])
        return a
    a = learner._save(username, m)
    log.info("exam_submit user=%s attempt=%s kind=%s week=%s score=%s/%s pct=%s passed=%s duration_s=%s overtime=%s",
             username, a["id"], a["kind"], a["week"], a["score"], a["total"], a["pct"], a["passed"], a["duration_s"], a["overtime"])
    return detail(a)


def _tick_weekly_task(lr: dict, week: int) -> None:
    day = week * content.DAYS_PER_WEEK
    task = next(t for t in content.build_day(day)["tasks"] if t["id"] == "weekly_test")
    done = lr["done"].setdefault(str(day), [])
    if "weekly_test" not in done:
        done.append("weekly_test")
        key = learner.today().isoformat()
        lr["activity"][key] = lr["activity"].get(key, 0) + task["minutes"]


def detail(a: dict) -> dict:
    t = definition(a["kind"], a["week"])
    if a["status"] == "in_progress":
        return in_progress_view(a, t)
    out = {**summary(a), "sections": a.get("sections"), "result": a.get("result"), "pass_pct": a.get("pass_pct"), "passage": t.get("passage")}
    if a["status"] == "submitted":
        given = {r["id"]: r for r in a["answers"]}
        out["review"] = [{**q, "given": given.get(q["id"], {}).get("answer"), "correct": given.get(q["id"], {}).get("correct", False)}
                         for q in t["questions"]]
    return out


def get(lr: dict, attempt_id: str) -> dict:
    a = next((x for x in lr["attempts"] if x["id"] == attempt_id), None)
    if not a:
        raise ApiError(404, "Không tìm thấy lượt thi")
    return detail(a)
