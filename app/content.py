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


LABEL_EN = {"Từ vựng": "Vocabulary", "Ngữ pháp": "Grammar", "Chiến lược": "Strategy", "Nghe": "Listening", "Đọc": "Reading",
            "Viết": "Writing", "Nói": "Speaking", "Ôn từ vựng": "Vocabulary review", "Chữa lỗi": "Fix mistakes",
            "Kiểm tra tuần": "Weekly test", "Thi thử": "Mock test", "Tự đánh giá": "Self-review", "Ngữ pháp / Chiến lược": "Grammar / Strategy",
            "Viết / Nói": "Writing / Speaking"}


def _task(id_: str, kind: str, label: str, detail: str, minutes: int, detail_en: str = "", **extra) -> dict:
    return {"id": id_, "kind": kind, "label": label, "label_en": LABEL_EN[label], "detail": detail, "detail_en": detail_en or detail,
            "title": f"{label}: {detail}", "minutes": minutes, **extra}


def _focus_task(topic: str, phase: int, topic_en: str = "") -> dict:
    lesson = grammar().get(topic)
    kind, label = ("strategy", "Chiến lược") if phase == 3 else ("grammar", "Ngữ pháp")
    return _task("focus", kind, label, lesson["title"] if lesson else topic, 40,
                 detail_en=(lesson or {}).get("title_en") or topic_en, lesson_id=topic if lesson else None)


# The same five blocks every study day (~3 hours); writing and speaking alternate.
DAILY_FORMULA = [
    {"kind": "vocab", "label": "Từ vựng", "label_en": "Vocabulary", "minutes": 30},
    {"kind": "grammar", "label": "Ngữ pháp / Chiến lược", "label_en": "Grammar / Strategy", "minutes": 40},
    {"kind": "listening", "label": "Nghe", "label_en": "Listening", "minutes": 35},
    {"kind": "reading", "label": "Đọc", "label_en": "Reading", "minutes": 35},
    {"kind": "writing", "label": "Viết / Nói", "label_en": "Writing / Speaking", "minutes": 40},
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
        test_en = "Mock test under real conditions; mark it and record the band for each skill" if w["phase"] == 3 else "End-of-week test: grammar and vocabulary from the 6 study days"
        tasks = [
            _task("review_cards", "vocab", "Ôn từ vựng", "Ôn toàn bộ flashcard của tuần", 40, "Review all of this week's flashcards"),
            _task("review_mistakes", "review", "Chữa lỗi", "Làm lại các câu đã sai trong tuần", 40, "Redo the questions you got wrong this week"),
            _task("weekly_test", "test", "Thi thử" if w["phase"] == 3 else "Kiểm tra tuần", test, 70, test_en),
            _task("reflect", "review", "Tự đánh giá", "Điểm mạnh, điểm yếu, mục tiêu tuần sau", 20, "Strengths, weaknesses and next week's goals"),
        ]
        title, title_en = "Ôn tập và kiểm tra tuần", "Weekly review and test"
    else:
        out = "writing" if dow % 2 else "speaking"
        tasks = [
            _task("vocab", "vocab", "Từ vựng", f'{w["words_per_day"]} từ mới ({w["vocab_theme"]}) + ôn thẻ đến hạn', 30,
                  f'{w["words_per_day"]} new words ({w["vocab_theme_en"]}) + due flashcards'),
            _focus_task(w["focus"][dow - 1], w["phase"], w["focus_en"][dow - 1]),
            _task("listening", "listening", "Nghe", w["listening"], 35, w["listening_en"]),
            _task("reading", "reading", "Đọc", w["reading"], 35, w["reading_en"]),
            _task(out, out, "Viết" if out == "writing" else "Nói", w[out], 40, w[f"{out}_en"]),
        ]
        title, title_en = tasks[1]["detail"], tasks[1]["detail_en"]
    return {"day": day, "week": week, "day_of_week": dow, "phase": w["phase"], "week_title": w["title"], "week_title_en": w["title_en"],
            "can_do": w["can_do"], "can_do_en": w["can_do_en"], "title": title, "title_en": title_en,
            "tasks": tasks, "minutes": sum(t["minutes"] for t in tasks)}


def roadmap() -> dict:
    c = curriculum()
    keys = ("week", "phase", "title", "title_en", "can_do", "can_do_en", "vocab_theme", "vocab_theme_en", "words_per_day")
    return {"note": c["note"], "note_en": c["note_en"], "minutes_per_day": c["minutes_per_day"], "phases": c["phases"], "daily_formula": DAILY_FORMULA,
            "weeks": [{k: w[k] for k in keys} |
                      {"topics": [_focus_task(f, w["phase"])["detail"] for f in w["focus"]],
                       "topics_en": [_focus_task(f, w["phase"], fe)["detail_en"] for f, fe in zip(w["focus"], w["focus_en"])]} for w in c["weeks"]]}


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
            "level": band["level"], "level_en": band["level_en"], "ielts_estimate": band["ielts"],
            "ielts_estimate_en": band["ielts"].replace("dưới", "below").replace("khoảng", "about"), "start_week": band["start_week"],
            "advice": band["advice"], "advice_en": band["advice_en"],
            "note": "Ước lượng sơ bộ từ 20 câu ngữ pháp, từ vựng và đọc hiểu; chưa đo Nghe, Nói, Viết.",
            "note_en": "A rough estimate from 20 grammar, vocabulary and reading questions; listening, speaking and writing are not measured."}
