"""Course content: the 12-week roadmap, grammar lessons, vocabulary bank and placement test.

Days are not stored: each week in content/curriculum.json defines its focus topics and skill
tasks, and build_day() expands that into 6 study days + 1 review day (84 days in total).
"""
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
DAYS_PER_WEEK = 7
WEEKS = 12
TOTAL_DAYS = WEEKS * DAYS_PER_WEEK


@lru_cache
def _load(name: str):
    return json.loads((CONTENT / name).read_text(encoding="utf-8"))


def curriculum() -> dict:
    return _load("curriculum.json")


def grammar() -> dict:
    return _load("grammar.json")


def vocab() -> list[dict]:
    return _load("vocab.json")


def placement() -> dict:
    return _load("placement.json")


def week_def(week: int) -> dict:
    return next(w for w in curriculum()["weeks"] if w["week"] == week)


def phase_def(phase: int) -> dict:
    return next(p for p in curriculum()["phases"] if p["phase"] == phase)


def first_day_of_week(week: int) -> int:
    return (week - 1) * DAYS_PER_WEEK + 1


def _task(id_: str, kind: str, label: str, detail: str, minutes: int, **extra) -> dict:
    return {"id": id_, "kind": kind, "label": label, "detail": detail, "title": f"{label}: {detail}", "minutes": minutes, **extra}


def _focus_task(topic: str, phase: int) -> dict:
    lesson = grammar().get(topic)
    kind, label = ("strategy", "Chiến lược") if phase == 3 else ("grammar", "Ngữ pháp")
    return _task("focus", kind, label, lesson["title"] if lesson else topic, 40, lesson_id=topic if lesson else None)


# The same five blocks every study day (~3 hours); writing and speaking alternate.
DAILY_FORMULA = [
    {"kind": "vocab", "label": "Từ vựng", "minutes": 30},
    {"kind": "grammar", "label": "Ngữ pháp / Chiến lược", "minutes": 40},
    {"kind": "listening", "label": "Nghe", "minutes": 35},
    {"kind": "reading", "label": "Đọc", "minutes": 35},
    {"kind": "writing", "label": "Viết / Nói", "minutes": 40},
]


def build_day(day: int) -> dict:
    """Day 1..84 → plan for that day. Day 7 of each week is review (phase 3: mock test)."""
    if not 1 <= day <= TOTAL_DAYS:
        raise ValueError(day)
    week = (day - 1) // DAYS_PER_WEEK + 1
    dow = (day - 1) % DAYS_PER_WEEK + 1
    w = week_def(week)
    if dow == DAYS_PER_WEEK:
        test = "Thi thử theo điều kiện thật, chấm và ghi lại band từng kỹ năng" if w["phase"] == 3 else "Bài kiểm tra cuối tuần: ngữ pháp + từ vựng của 6 ngày học"
        tasks = [
            _task("review_cards", "vocab", "Ôn từ vựng", "Ôn toàn bộ flashcard của tuần", 40),
            _task("review_mistakes", "review", "Chữa lỗi", "Làm lại các câu đã sai trong tuần", 40),
            _task("weekly_test", "test", "Thi thử" if w["phase"] == 3 else "Kiểm tra tuần", test, 70),
            _task("reflect", "review", "Tự đánh giá", "Điểm mạnh, điểm yếu, mục tiêu tuần sau", 20),
        ]
        title = "Ôn tập và kiểm tra tuần"
    else:
        output = ("writing", "Viết", w["writing"]) if dow % 2 else ("speaking", "Nói", w["speaking"])
        tasks = [
            _task("vocab", "vocab", "Từ vựng", f'{w["words_per_day"]} từ mới ({w["vocab_theme"]}) + ôn thẻ đến hạn', 30),
            _focus_task(w["focus"][dow - 1], w["phase"]),
            _task("listening", "listening", "Nghe", w["listening"], 35),
            _task("reading", "reading", "Đọc", w["reading"], 35),
            _task(output[0], output[0], output[1], output[2], 40),
        ]
        title = tasks[1]["detail"]
    return {"day": day, "week": week, "day_of_week": dow, "phase": w["phase"], "week_title": w["title"], "can_do": w["can_do"],
            "title": title, "tasks": tasks, "minutes": sum(t["minutes"] for t in tasks)}


def roadmap() -> dict:
    c = curriculum()
    return {"note": c["note"], "minutes_per_day": c["minutes_per_day"], "phases": c["phases"], "daily_formula": DAILY_FORMULA,
            "weeks": [{k: w[k] for k in ("week", "phase", "title", "can_do", "vocab_theme", "words_per_day")} |
                      {"topics": [_focus_task(f, w["phase"])["detail"] for f in w["focus"]]} for w in c["weeks"]]}


def placement_public() -> dict:
    p = placement()
    return {"passage": p["passage"], "questions": [{k: q[k] for k in ("id", "level", "q", "options") } | {"passage": q.get("passage", False)}
                                                   for q in p["questions"]]}


def score_placement(answers: dict) -> dict:
    p = placement()
    by_level: dict[str, list[int]] = {}
    correct = 0
    for q in p["questions"]:
        ok = answers.get(q["id"]) == q["answer"]
        correct += ok
        by_level.setdefault(q["level"], [0, 0])
        by_level[q["level"]][0] += ok
        by_level[q["level"]][1] += 1
    band = next(b for b in p["bands"] if b["min"] <= correct <= b["max"])
    return {"score": correct, "total": len(p["questions"]), "by_level": {k: {"correct": v[0], "total": v[1]} for k, v in by_level.items()},
            "level": band["level"], "ielts_estimate": band["ielts"], "start_week": band["start_week"], "advice": band["advice"],
            "note": "Ước lượng sơ bộ từ 20 câu ngữ pháp, từ vựng và đọc hiểu; chưa đo Nghe, Nói, Viết."}
