# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

IELTS Road: a web app with a 12-week roadmap taking Vietnamese beginners toward IELTS 6.0. All user-facing text, content and error messages are Vietnamese; English appears only as learning material. Same stack and conventions as the sibling GreenRoute project (FastAPI + JSON-file store + plain HTML/JS).

## Commands

```powershell
python -m venv .venv; .\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q                                   # all tests
.\.venv\Scripts\python -m pytest tests/test_api.py::test_flashcards -q   # single test
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000            # http://localhost:8000, Swagger at /docs
```

## Architecture

- **Content is data, days are computed.** `content/curriculum.json` defines 3 phases and 12 weeks (focus topics ×6, skill task text, vocab theme). `content.build_day(n)` expands a week into 6 study days + day 7 review/mock test (84 days); days are never stored. A `focus` entry starting with `g_` links to a lesson in `content/grammar.json` (explanation + multiple-choice exercises with answer index); any other string is a title only, shown as "đang soạn". Vocabulary in `content/vocab.json` is keyed to a curriculum day number. Task ids within a day (`vocab`, `focus`, `listening`, …) are what completion is recorded against — renaming them orphans saved progress.
- **Learner state** lives in `db["learners"][username]` (`learner.py`): placement result, `start_week`, `done` (day → task ids), `activity` (local date → minutes, drives streak), `cards` (SM-2 state per word id), `essays`. "Current day" is the first incomplete day from the start week. Dates use fixed UTC+7 (no tzdata on Windows).
- **Writes**: `learner._save(username, mutate)` wraps load → mutate → save under `store.lock`; use it for every learner change.
- **Tests and attempt log** (`exams.py`): placement (`content/placement.json`, 20 questions A1–B2, score bands → start week) and one weekly test per week (`content/tests/weekNN.json`, 15 questions: 8 grammar|strategy, 4 vocab, 3 reading on `passage`; TFNG items have 3 options). Flow is `POST /api/exams/start` → attempt logged as `in_progress` → `POST /api/attempts/{id}/submit`. Every attempt stays in `learner["attempts"]` (abandoned when a new one of the same test starts, `expired` if never submitted) and is also logged as `exam_start`/`exam_submit` lines. Answers are stripped by `exams.public()` — never return raw test files to the client. Passing a weekly test (≥ `pass_pct`) is the only way to tick the review day's `weekly_test` task; `set_task` rejects it.
- **Writing feedback** (`writing.py`): Claude via `client.beta.messages.create` with `output_config.format` JSON schema and server-side `fallbacks="default"`. Per-criterion bands are rounded to 0.5 and `overall` is recomputed server-side — do not trust the model's overall. Disabled (503) without `ANTHROPIC_API_KEY`; daily cap `WRITING_DAILY_LIMIT`. Tests monkeypatch `_call_claude`, so no test hits the API.
- **Auth** (`auth.py`): self-registration, PBKDF2 passwords, HMAC-signed 7-day bearer tokens with a revocation list; one role (learner).
- **Frontend** (`public/`): single `app.js` with hash routes (`#/today`, `#/day/N`, `#/roadmap`, `#/cards`, `#/writing`, `#/test`). Bump the `?v=` cache-buster in `index.html` when changing JS/CSS.

## Status

README.md lists which features are real vs. placeholder (only week 1 has lessons and vocabulary; listening/reading/speaking are task descriptions only). Keep that table current.
