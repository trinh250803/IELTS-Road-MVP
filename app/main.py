"""IELTS Road — FastAPI backend: accounts, placement test, 12-week roadmap, flashcards, AI writing feedback."""
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import auth, content, exams, game, learner, reports, store, writing
from .auth import ApiError
from .i18n import lang_of, translate

ROOT = Path(__file__).resolve().parent.parent
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ielts")

@asynccontextmanager
async def lifespan(_: FastAPI):
    auth.ensure_accounts()
    yield


app = FastAPI(title="IELTS Road API", version="0.1.0", lifespan=lifespan,
              description="Lộ trình 12 tuần từ mất gốc tới IELTS 6.0. Mọi API (trừ đăng ký, đăng nhập, /api/health) "
                          "cần header `Authorization: Bearer <token>`.")
USER = Depends(auth.current_user)
ADMIN = Depends(auth.require_admin)


@app.exception_handler(ApiError)
async def api_error(request: Request, e: ApiError):
    return JSONResponse({"error": translate(e.message, lang_of(request))}, status_code=e.status)


@app.exception_handler(Exception)
async def unhandled(request: Request, e: Exception):
    # Log without request bodies: essays are learners' own writing.
    log.exception("[%s %s] %s", request.method, request.url.path, e)
    return JSONResponse({"error": translate("Lỗi máy chủ", lang_of(request))}, status_code=500)


async def body_json(request: Request) -> dict:
    raw = await request.body()
    if not raw:
        return {}
    try:
        b = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ApiError(400, "JSON không hợp lệ (cần mã hóa UTF-8)")
    if not isinstance(b, dict):
        raise ApiError(400, "Cần một đối tượng JSON")
    return b


def learner_of(user: dict) -> dict:
    return learner.get(store.load(), user["username"])


@app.middleware("http")
async def no_stale_web_app(request: Request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api/") and request.url.path.endswith(("/", ".html", ".js", ".css")):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/api/health")
def health():
    return {"ok": True, "writing_ai": writing.configured()}


# ---------- Accounts ----------
@app.post("/api/auth/register", status_code=201)
async def register(request: Request):
    return auth.register(await body_json(request))


@app.post("/api/auth/login")
async def login(request: Request):
    b = await body_json(request)
    return auth.login(b.get("username"), b.get("password"))


@app.get("/api/auth/demo")
def demo():
    d = auth.demo_account()
    if not d:
        raise ApiError(404, "Không có tài khoản dùng thử")
    return d


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, user=USER):
    auth.logout(request.state.session)


@app.get("/api/auth/me")
def me(user=USER):
    return auth.public_user(user)


# ---------- Tests and attempt log ----------
@app.get("/api/exams")
def exam_hub(user=USER):
    return exams.hub(learner_of(user))


@app.post("/api/exams/start")
async def exam_start(request: Request, user=USER):
    b = await body_json(request)
    return exams.start(user["username"], b.get("kind"), b.get("week"))


@app.get("/api/attempts")
def list_attempts(user=USER):
    return [exams.summary(a) for a in learner_of(user)["attempts"]]


@app.get("/api/attempts/{attempt_id}")
def get_attempt(attempt_id: str, user=USER):
    return exams.get(learner_of(user), attempt_id)


@app.post("/api/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, request: Request, user=USER):
    return exams.submit(user["username"], attempt_id, (await body_json(request)).get("answers"))


# ---------- Roadmap and daily plan ----------
@app.get("/api/roadmap")
def get_roadmap(user=USER):
    lr = learner_of(user)
    done_days = {int(d) for d, ids in lr["done"].items() if len(ids) == len(content.build_day(int(d))["tasks"])}
    return {**content.roadmap(), "start_week": lr["start_week"], "current_day": learner.current_day(lr), "done_days": sorted(done_days)}


@app.put("/api/learner/start-week")
async def put_start_week(request: Request, user=USER):
    return {"start_week": learner.set_start_week(user["username"], (await body_json(request)).get("week"))}


@app.get("/api/dashboard")
def get_dashboard(user=USER):
    lr = learner_of(user)
    return {**learner.dashboard(lr), "profile": game.profile(lr)}


@app.get("/api/days/{day}")
def get_day(day: int, user=USER):
    try:
        plan = content.build_day(day)
    except ValueError:
        raise ApiError(404, "Không có ngày học này")
    lessons = {t["lesson_id"]: content.grammar()[t["lesson_id"]] for t in plan["tasks"] if t.get("lesson_id")}
    words = [w for w in content.vocab() if w["day"] == day]
    return {**plan, "done": learner_of(user)["done"].get(str(day), []), "lessons": lessons, "words": words}


@app.put("/api/days/{day}/tasks/{task_id}")
async def put_task(day: int, task_id: str, request: Request, user=USER):
    return learner.set_task(user["username"], day, task_id, bool((await body_json(request)).get("done", True)))


# ---------- Flashcards ----------
@app.get("/api/vocab/queue")
def vocab_queue(user=USER):
    return learner.review_queue(learner_of(user))


@app.get("/api/vocab/words")
def vocab_words(user=USER):
    lr = learner_of(user)
    return [{**w, "card": lr["cards"].get(w["id"])} for w in learner.unlocked_words(lr)]


@app.post("/api/vocab/review")
async def vocab_review(request: Request, user=USER):
    b = await body_json(request)
    return learner.review(user["username"], b.get("word_id"), b.get("grade"))


# ---------- Writing feedback ----------
@app.get("/api/writing/status")
def writing_status(user=USER):
    return {"enabled": writing.configured(), "daily_limit": writing.DAILY_LIMIT, "model": writing.MODEL}


@app.post("/api/writing/grade")
async def writing_grade(request: Request, user=USER):
    b = await body_json(request)
    return await run_in_threadpool(writing.grade, user["username"], b, lang_of(request))


@app.get("/api/writing/history")
def writing_history(user=USER):
    return learner_of(user)["essays"]


# ---------- Motivation: profile, leaderboard, mini-games ----------
@app.get("/api/me/profile")
def my_profile(user=USER):
    return game.profile(learner_of(user))


@app.get("/api/leaderboard")
def get_leaderboard(user=USER):
    return game.leaderboard(store.load(), user["username"])


@app.get("/api/games/words")
def game_words(user=USER):
    return game.game_words(learner_of(user))


@app.post("/api/games/result")
async def game_result(request: Request, user=USER):
    return game.record_game(user["username"], await body_json(request))


# ---------- Admin: learners and reports ----------
@app.get("/api/admin/overview")
def admin_overview(user=ADMIN):
    return reports.overview(store.load())


@app.get("/api/admin/learners")
def admin_learners(user=ADMIN):
    return reports.learners(store.load())


@app.post("/api/admin/learners", status_code=201)
async def admin_create_learners(request: Request, user=ADMIN):
    return auth.create_learners((await body_json(request)).get("learners"))


@app.get("/api/admin/learners/{username}")
def admin_learner(username: str, user=ADMIN):
    d = reports.learner_detail(store.load(), username)
    if not d:
        raise ApiError(404, "Không tìm thấy học viên")
    return d


@app.put("/api/admin/learners/{username}")
async def admin_update_learner(username: str, request: Request, user=ADMIN):
    return auth.set_active(username, (await body_json(request)).get("active", True))


@app.post("/api/admin/learners/{username}/reset-password")
def admin_reset_password(username: str, user=ADMIN):
    return auth.reset_password(username)


@app.get("/api/admin/attempts")
def admin_attempts(user=ADMIN):
    return reports.attempts(store.load())


@app.get("/api/admin/export/{name}.csv")
def admin_export(name: str, user=ADMIN):
    db = store.load()
    if name == "learners":
        body = reports.to_csv(reports.learners(db), reports.LEARNER_COLUMNS)
    elif name == "attempts":
        body = reports.to_csv(reports.attempts(db, limit=100_000), reports.ATTEMPT_COLUMNS)
    else:
        raise ApiError(404, "Không tìm thấy")
    return Response(body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="ielts-road-{name}-{learner.today().isoformat()}.csv"'})


app.mount("/", StaticFiles(directory=ROOT / "public", html=True), name="web")
