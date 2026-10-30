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
- **Learner state** lives in `db["learners"][username]` (`learner.py`): placement result, `start_week`, `done` (day → task ids), `activity` (local date → minutes, drives streak), `cards` (SM-2 state per word id), `essays`. "Current day" is the first incomplete day from the start week. `review_queue` attaches a `preview` (days to next review per grade) for the grade buttons; `memory_stats` (`/api/vocab/stats`) counts words per stage (`new`/`learning` <3d/`young` <21d/`mature`) and a 7-day due forecast. Dates use fixed UTC+7 (no tzdata on Windows).
- **Writes**: `learner._save(username, mutate)` wraps load → mutate → save under `store.lock`; use it for every learner change.
- **Tests and attempt log** (`exams.py`): placement (`content/placement.json`, 20 questions A1–B2, score bands → start week) and one weekly test per week (`content/tests/weekNN.json`, 15 questions: 8 grammar|strategy, 4 vocab, 3 reading on `passage`; TFNG items have 3 options). Flow is `POST /api/exams/start` → attempt logged as `in_progress` → `POST /api/attempts/{id}/submit`. Every attempt stays in `learner["attempts"]` (abandoned when a new one of the same test starts, `expired` if never submitted) and is also logged as `exam_start`/`exam_submit` lines. Answers are stripped by `exams.public()` — never return raw test files to the client. Passing a weekly test (≥ `pass_pct`) is the only way to tick the review day's `weekly_test` task; `set_task` rejects it.
- **Writing feedback** (`writing.py`): Claude via `client.beta.messages.create` with `output_config.format` JSON schema and server-side `fallbacks="default"`. Per-criterion bands are rounded to 0.5 and `overall` is recomputed server-side — do not trust the model's overall. Disabled (503) without `ANTHROPIC_API_KEY`; daily cap `WRITING_DAILY_LIMIT`. Tests monkeypatch `_call_claude`, so no test hits the API.
- **Auth & roles** (`auth.py`): self-registration (role `learner`), PBKDF2 passwords, HMAC-signed 7-day bearer tokens with a revocation list. `ensure_accounts()` at startup creates `DEMO_ACCOUNT` (learner) and `ADMIN_ACCOUNT` (role `admin`, password re-synced from the env on every start). Admin routes use `Depends(auth.require_admin)`; the frontend shows a separate admin nav and admins never see learner pages.
- **Storage** (`store.py`): `DATABASE_URL` → whole state as one JSONB row in PostgreSQL, cached in memory and written through (single process only); otherwise the JSON file at `DB_PATH`.
- **Motivation** (`game.py` + `learner.award`): XP per local day in `learner["xp_days"]` (values in `learner.XP`), levels at 50·L·(L−1) XP, badges derived from state (never stored), weekly leaderboard showing "Given N." names, mini-game results with a daily XP cap.
- **Reminders** (`reminders.py`): `learner["reminder"]` (enabled, HH:MM, lang, last_sent) and `learner["push"]` (Web Push subscriptions, max 5, a device belongs to the last learner who subscribed on it). VAPID keys are generated once into `db["vapid"]`. `/api/reminders/run` (cron, `CRON_SECRET` via `?key=` or `X-Cron-Key`) sends at most one push per learner per day; 404/410 subscriptions are dropped. Tests monkeypatch `reminders._push`. Frontend: `public/sw.js` shows pushes; when push is not active an open tab reminds with a Web Audio chime; `sfx` in `app.js` plays effect sounds (off via `localStorage.ielts_sound`).
- **Reports** (`reports.py`): admin overview/trends, learner rows, learner detail, all attempts, CSV export (UTF-8 BOM for Excel).
- **i18n**: UI strings in `public/i18n.js` (`t(key)`, every key in both `vi` and `en`); content fields have `*_en` siblings picked client-side by `L(obj, key)`; server errors are raised in Vietnamese and translated by `app/i18n.py` when the client sends `X-Lang: en` — add a pattern there for every new error message.
- **Frontend** (`public/`): single `app.js` with hash routes (`#/today`, `#/day/N`, `#/roadmap`, `#/cards`, `#/writing`, `#/test`). After each route `enter()` staggers the page in and counts up `[data-count]` numbers; `confetti()` celebrates completions; page keyboard shortcuts go through `setKeys()` (cleared on route change). All motion is disabled under `prefers-reduced-motion`. Layout rule (the owner uses an iPhone 14, 390px): labels never wrap — they stay on one line with an ellipsis, long content titles get a fixed two-line box, boxes of one kind share one size, and settings rows are `[title | control]` with the description underneath. Check new UI at 390px in both VI and EN. Bump the `?v=` cache-buster in `index.html` when changing JS/CSS.

## Status

README.md lists which features are real vs. placeholder (only week 1 has lessons and vocabulary; listening/reading/speaking are task descriptions only). Keep that table current.
