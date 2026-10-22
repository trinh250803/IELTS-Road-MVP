"""IELTS Writing feedback with Claude (structured JSON output).

Disabled when ANTHROPIC_API_KEY is not set. Each learner gets WRITING_DAILY_LIMIT gradings per
day to keep API cost predictable. Only the task prompt and essay are sent, no account data.
"""
import json
import logging
import os
import re
import uuid

from . import learner, store
from .auth import ApiError, now_iso

log = logging.getLogger("ielts")

MODEL = os.environ.get("WRITING_MODEL", "claude-opus-5-5")
DAILY_LIMIT = int(os.environ.get("WRITING_DAILY_LIMIT", "5"))
MIN_WORDS = {"task1": 50, "task2": 80}
MAX_WORDS = 600
KEEP_ESSAYS = 20

SYSTEM = """Bạn là giám khảo IELTS Writing có kinh nghiệm, chấm cho học viên người Việt đang học từ trình độ thấp lên mục tiêu band 6.0.
Chấm theo 4 tiêu chí công khai của IELTS (Task Achievement/Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy), mỗi tiêu chí band 0–9 theo bước 0.5.
Chấm trung thực, không nâng điểm để động viên; nếu bài thiếu số từ tối thiểu (150 với Task 1, 250 với Task 2) thì phản ánh vào tiêu chí Task Achievement/Response.
Viết nhận xét (comment, strengths, improvements, explanation) bằng ngôn ngữ được yêu cầu trong tin nhắn (mặc định tiếng Việt), ngắn gọn, cụ thể, dễ hiểu với người mới học. Câu sửa (corrected) và đoạn mẫu viết bằng tiếng Anh.
Chỉ sửa tối đa 8 lỗi quan trọng nhất, ưu tiên lỗi lặp lại và lỗi làm giảm band."""

CRITERION = {
    "type": "object",
    "properties": {"band": {"type": "number"}, "comment": {"type": "string"}},
    "required": ["band", "comment"], "additionalProperties": False,
}
SCHEMA = {
    "type": "object",
    "properties": {
        "overall": {"type": "number"},
        "task_response": CRITERION,
        "coherence_cohesion": CRITERION,
        "lexical_resource": CRITERION,
        "grammatical_range_accuracy": CRITERION,
        "strengths": {"type": "array", "items": {"type": "string"}},
        "improvements": {"type": "array", "items": {"type": "string"}},
        "corrections": {"type": "array", "items": {
            "type": "object",
            "properties": {"original": {"type": "string"}, "corrected": {"type": "string"}, "explanation": {"type": "string"}},
            "required": ["original", "corrected", "explanation"], "additionalProperties": False}},
        "sample_paragraph": {"type": "string"},
    },
    "required": ["overall", "task_response", "coherence_cohesion", "lexical_resource", "grammatical_range_accuracy",
                 "strengths", "improvements", "corrections", "sample_paragraph"],
    "additionalProperties": False,
}
CRITERIA = ("task_response", "coherence_cohesion", "lexical_resource", "grammatical_range_accuracy")


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", text))


def _half(x) -> float:
    return min(9.0, max(0.0, round(float(x) * 2) / 2))


def _call_claude(task_type: str, prompt: str, essay: str, lang: str = "vi") -> dict:
    import anthropic

    client = anthropic.Anthropic()
    label = "Task 1 (mô tả biểu đồ/quy trình, tối thiểu 150 từ)" if task_type == "task1" else "Task 2 (bài luận, tối thiểu 250 từ)"
    feedback_lang = "English" if lang == "en" else "tiếng Việt"
    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"Ngôn ngữ nhận xét: {feedback_lang}\nDạng bài: IELTS Writing {label}\n\n"
                                                  f"Đề bài:\n{prompt}\n\nBài làm của học viên ({word_count(essay)} từ):\n{essay}"}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            # On a safety decline the API retries on a fallback model inside the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError:
        raise ApiError(503, "Hệ thống chấm đang quá tải, vui lòng thử lại sau ít phút")
    except anthropic.APIStatusError as e:
        log.error("Claude API error %s (request %s)", e.status_code, getattr(e, "request_id", None))
        raise ApiError(502, "Không chấm được bài lúc này, vui lòng thử lại sau")
    except anthropic.APIConnectionError:
        raise ApiError(502, "Không kết nối được tới dịch vụ chấm bài")
    if resp.stop_reason == "refusal":
        raise ApiError(422, "Bài viết không thể chấm tự động. Hãy kiểm tra lại nội dung bài.")
    text = next((b.text for b in resp.content if b.type == "text"), "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        log.error("Unparseable grading output (stop_reason=%s)", resp.stop_reason)
        raise ApiError(502, "Kết quả chấm không hợp lệ, vui lòng thử lại")


def grade(username: str, data: dict, lang: str = "vi") -> dict:
    if not configured():
        raise ApiError(503, "Chấm Writing bằng AI chưa được bật (thiếu ANTHROPIC_API_KEY trên máy chủ)")
    task_type = data.get("task_type")
    if task_type not in MIN_WORDS:
        raise ApiError(400, "Dạng bài phải là task1 hoặc task2")
    prompt = str(data.get("prompt") or "").strip()
    essay = str(data.get("essay") or "").strip()
    if len(prompt) < 10:
        raise ApiError(400, "Hãy nhập đề bài")
    words = word_count(essay)
    if words < MIN_WORDS[task_type]:
        raise ApiError(400, f"Bài viết cần ít nhất {MIN_WORDS[task_type]} từ để chấm (hiện có {words} từ)")
    if words > MAX_WORDS:
        raise ApiError(400, f"Bài viết tối đa {MAX_WORDS} từ")

    key =learner.today().isoformat()
    used = sum(1 for e in learner.get(store.load(), username)["essays"] if e["created_at_local"] == key)
    if used >= DAILY_LIMIT:
        raise ApiError(429, f"Mỗi ngày được chấm tối đa {DAILY_LIMIT} bài. Hãy quay lại vào ngày mai.")

    result = _call_claude(task_type, prompt, essay, lang)
    for c in CRITERIA:
        result[c]["band"] = _half(result[c]["band"])
    # IELTS overall for one task: mean of the four criteria, rounded to the nearest 0.5.
    result["overall"] = _half(sum(result[c]["band"] for c in CRITERIA) / 4)
    entry = {"id": uuid.uuid4().hex[:12], "created_at": now_iso(), "created_at_local": key,
             "task_type": task_type, "prompt": prompt, "essay": essay, "words": words, "model": MODEL, "result": result}

    def m(lr):
        lr["essays"] = [entry, *lr["essays"]][:KEEP_ESSAYS]
        learner.award(lr, learner.XP["essay"])
    learner._save(username, m)
    return entry
