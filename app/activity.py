"""Self-contained daily skill activities — Listening, Reading and Speaking —
generated from the day's vocabulary so they run entirely in the browser with no
API key. Each returns auto-scorable items; the frontend marks the task done when
the learner finishes and moves on to the next one.

Days without vocabulary yet (weeks 2–12) return ``ready: False`` so the frontend
shows a short "đang soạn" screen with a manual "đã học xong" button instead.
"""
import random
import re

from . import content
from .auth import ApiError

ITEMS = 6  # questions / sentences per activity


def _day_words(day: int) -> list[dict]:
    return [w for w in content.vocab() if w["day"] == day]


def _distractors(rnd: random.Random, pool: list[str], n: int, exclude: str) -> list[str]:
    opts = list(dict.fromkeys(x for x in pool if x != exclude))  # unique, keep order
    rnd.shuffle(opts)
    return opts[:n]


def _choices(rnd: random.Random, pool: list[str], correct: str) -> tuple[list[str], int]:
    opts = _distractors(rnd, pool, 3, correct) + [correct]
    rnd.shuffle(opts)
    return opts, opts.index(correct)


def _listening(rnd: random.Random, words: list[dict]) -> list[dict]:
    """Hear the English example sentence, pick its Vietnamese meaning."""
    vis = [w["vi"] for w in words]
    out = []
    for w in words[:ITEMS]:
        opts, answer = _choices(rnd, vis, w["vi"])
        out.append({"say": w["example"], "word": w["word"], "options": opts, "answer": answer})
    return out


def _reading(rnd: random.Random, words: list[dict]) -> list[dict]:
    """Read the sentence with one word blanked out, choose the right word."""
    terms = [w["word"] for w in words]
    out = []
    for w in words[:ITEMS]:
        sentence = re.sub(rf"\b{re.escape(w['word'])}\w*", "______", w["example"], count=1, flags=re.I)
        if "______" not in sentence:
            sentence = f"{w['example']} (______)"
        opts, answer = _choices(rnd, terms, w["word"])
        out.append({"sentence": sentence, "hint": w["vi"], "options": opts, "answer": answer})
    return out


def _speaking(rnd: random.Random, words: list[dict]) -> list[dict]:
    """Read each English sentence aloud; the browser listens and compares."""
    return [{"text": w["example"], "word": w["word"], "vi": w["vi"], "ipa": w["ipa"]} for w in words[:ITEMS]]


BUILDERS = {"listening": _listening, "reading": _reading, "speaking": _speaking}


def build(day: int, task_id: str) -> dict:
    try:
        plan = content.build_day(day)
    except ValueError:
        raise ApiError(404, "Không có ngày học này")
    task = next((t for t in plan["tasks"] if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Không có nhiệm vụ này")
    base = {"day": day, "task_id": task_id, "kind": task["kind"], "label": task["label"], "label_en": task["label_en"],
            "detail": task["detail"], "detail_en": task["detail_en"], "minutes": task["minutes"]}
    builder = BUILDERS.get(task["kind"])
    words = _day_words(day)
    if not builder or not words:
        return {**base, "ready": False}
    rnd = random.Random(f"{day}:{task_id}")
    return {**base, "ready": True, "items": builder(rnd, words)}
