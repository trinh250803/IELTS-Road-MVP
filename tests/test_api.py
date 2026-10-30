import pytest
from fastapi.testclient import TestClient

from app import content, exams, game, learner, writing


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    mp.setenv("DB_PATH", str(tmp_path_factory.mktemp("db") / "db.json"))
    mp.delenv("ANTHROPIC_API_KEY", raising=False)
    mp.setenv("DEMO_ACCOUNT", "demo:DemoPass1")
    mp.setenv("ADMIN_ACCOUNT", "boss:AdminPass1")
    from app.main import app
    with TestClient(app) as c:
        yield c
    mp.undo()


def register(client, username):
    r = client.post("/api/auth/register", json={"username": username, "password": "Password1", "full_name": "Học viên"})
    assert r.status_code == 201, r.text
    return {"Authorization": f'Bearer {r.json()["token"]}'}


def test_roadmap_shape():
    days = [content.build_day(d) for d in range(1, content.TOTAL_DAYS + 1)]
    assert len(days) == 84
    assert all(d["tasks"] for d in days)
    assert all(d["minutes"] <= 180 for d in days)
    assert [d["title"] for d in days if d["day_of_week"] == 7][0] == "Ôn tập và kiểm tra tuần"
    # Every grammar lesson referenced by the curriculum exists, and every exercise answer is a valid option.
    for w in content.curriculum()["weeks"]:
        for f in w["focus"]:
            assert not f.startswith("g_") or f in content.grammar()
    for lesson in content.grammar().values():
        for ex in lesson["exercises"]:
            assert 0 <= ex["answer"] < len(ex["options"])


def test_placement_scoring():
    qs = content.placement()["questions"]
    assert content.score_placement({})["start_week"] == 1
    all_right = {q["id"]: q["answer"] for q in qs}
    r = content.score_placement(all_right)
    assert r["score"] == 20 and r["start_week"] == 9
    assert "answer" not in exams.public(exams.placement())[0]


def test_weekly_test_files_valid():
    """Every content/tests/weekNN.json present is well-formed (files are authored by hand)."""
    files = sorted((content.CONTENT / "tests").glob("week*.json"))
    for f in files:
        week = int(f.stem[4:])
        t = exams.weekly(week)
        assert t["week"] == week and t["time_limit_min"] > 0 and 0 < t["pass_pct"] <= 100, f
        ids = [q["id"] for q in t["questions"]]
        assert len(ids) == 15 and len(set(ids)) == 15, f
        for q in t["questions"]:
            assert q["section"] in ("grammar", "vocab", "reading", "strategy"), q["id"]
            assert len(q["options"]) in (3, 4) and 0 <= q["answer"] < len(q["options"]), q["id"]
            assert q["explain"], q["id"]


FAKE_WEEK = {"week": 1, "title": "Kiểm tra tuần 1", "time_limit_min": 20, "pass_pct": 70, "passage": "Text.",
             "questions": [{"id": f"f{i}", "section": "grammar" if i < 6 else "vocab", "q": f"Q{i}", "options": ["a", "b", "c", "d"],
                            "answer": i % 4, "explain": "vì"} for i in range(10)]}


@pytest.fixture
def fake_weekly(monkeypatch):
    monkeypatch.setattr(exams, "weekly", lambda w: {**FAKE_WEEK, "week": w, "title": f"Kiểm tra tuần {w}"} if 1 <= w <= 12 else None)


def test_demo_account(client, monkeypatch):
    d = client.get("/api/auth/demo").json()
    assert d == {"username": "demo", "password": "DemoPass1"}
    assert client.post("/api/auth/login", json=d).status_code == 200  # created at startup
    monkeypatch.delenv("DEMO_ACCOUNT")
    assert client.get("/api/auth/demo").status_code == 404


def test_auth(client):
    assert client.get("/api/dashboard").status_code == 401
    h = register(client, "lan")
    assert client.post("/api/auth/register", json={"username": "lan", "password": "Password1"}).status_code == 409
    assert client.post("/api/auth/register", json={"username": "x", "password": "Password1"}).status_code == 400
    assert client.post("/api/auth/login", json={"username": "lan", "password": "wrong-pass"}).status_code == 401
    assert client.get("/api/auth/me", headers=h).json()["username"] == "lan"
    assert client.post("/api/auth/logout", headers=h).status_code == 204
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_learning_flow(client):
    h = register(client, "minh")
    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["today"]["day"] == 1 and dash["streak"] == 0 and dash["progress_pct"] == 0

    # Placement with a middle score moves the start to week 5.
    qs = content.placement()["questions"]
    answers = {q["id"]: q["answer"] for q in qs[:13]}
    a = client.post("/api/exams/start", headers=h, json={"kind": "placement"}).json()
    assert "answer" not in a["questions"][0]
    r = client.post(f'/api/attempts/{a["id"]}/submit', headers=h, json={"answers": answers}).json()
    assert r["result"]["start_week"] == 5 and r["score"] == 13
    assert client.get("/api/dashboard", headers=h).json()["today"]["day"] == 29
    assert client.put("/api/learner/start-week", headers=h, json={"week": 1}).json()["start_week"] == 1

    day1 = client.get("/api/days/1", headers=h).json()
    assert "g_be" in day1["lessons"] and len(day1["words"]) == 12
    assert client.put("/api/days/7/tasks/weekly_test", headers=h, json={"done": True}).status_code == 400
    for t in day1["tasks"]:
        r = client.put(f'/api/days/1/tasks/{t["id"]}', headers=h, json={"done": True})
        assert r.status_code == 200
    assert r.json()["complete"]
    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["today"]["day"] == 2 and dash["streak"] == 1 and dash["minutes_7d"] == day1["minutes"]
    assert client.put("/api/days/1/tasks/nope", headers=h, json={"done": True}).status_code == 404
    assert client.get("/api/days/85", headers=h).status_code == 404


def test_attempt_log(client, fake_weekly):
    h = register(client, "an.nguyen")
    hub = client.get("/api/exams", headers=h).json()
    assert hub["current_week"] == 1 and hub["weeks"][0]["available"] and not hub["weeks"][1]["available"]
    assert client.post("/api/exams/start", headers=h, json={"kind": "weekly", "week": 2}).status_code == 403
    assert client.post("/api/exams/start", headers=h, json={"kind": "weekly", "week": 99}).status_code == 404

    # 1st attempt is abandoned by starting a 2nd; 2nd fails; 3rd passes. All three stay in the log.
    first = client.post("/api/exams/start", headers=h, json={"kind": "weekly", "week": 1}).json()
    assert first["status"] == "in_progress" and first["remaining_s"] > 0 and "answer" not in first["questions"][0]
    second = client.post("/api/exams/start", headers=h, json={"kind": "weekly", "week": 1}).json()
    r = client.post(f'/api/attempts/{second["id"]}/submit', headers=h, json={"answers": {"f0": 0, "f1": 1, "f2": 3}}).json()
    assert (r["score"], r["total"], r["pct"], r["passed"]) == (2, 10, 20, False)
    assert r["sections"]["grammar"] == {"correct": 2, "total": 6}
    assert r["review"][2]["given"] == 3 and r["review"][2]["correct"] is False and r["review"][2]["answer"] == 2
    assert client.post(f'/api/attempts/{second["id"]}/submit', headers=h, json={"answers": {}}).status_code == 409
    assert client.get("/api/days/7", headers=h).json()["done"] == []

    third = client.post("/api/exams/start", headers=h, json={"kind": "weekly", "week": 1}).json()
    all_right = {f"f{i}": i % 4 for i in range(10)}
    r = client.post(f'/api/attempts/{third["id"]}/submit', headers=h, json={"answers": all_right}).json()
    assert r["passed"] and r["pct"] == 100 and r["duration_s"] >= 0 and not r["overtime"]
    assert client.get("/api/days/7", headers=h).json()["done"] == ["weekly_test"]  # passing ticks the review-day task

    log = client.get("/api/attempts", headers=h).json()
    assert [a["status"] for a in log] == ["submitted", "submitted", "abandoned"]
    assert log[0]["id"] == third["id"] and all(a["started_at"] for a in log)
    w1 = client.get("/api/exams", headers=h).json()["weeks"][0]
    assert (w1["attempts"], w1["best_pct"], w1["passed"]) == (2, 100, True)
    assert client.get(f'/api/attempts/{first["id"]}', headers=h).json()["status"] == "abandoned"
    # Another learner cannot read this log.
    other = register(client, "binh")
    assert client.get(f'/api/attempts/{third["id"]}', headers=other).status_code == 404


def test_overtime_flag(client, fake_weekly, monkeypatch):
    h = register(client, "cuong")
    a = client.post("/api/exams/start", headers=h, json={"kind": "weekly", "week": 1}).json()
    monkeypatch.setattr(exams, "_elapsed_s", lambda a: 20 * 60 + exams.GRACE_S + 1)
    r = client.post(f'/api/attempts/{a["id"]}/submit', headers=h, json={"answers": {}}).json()
    assert r["overtime"] is True and r["score"] == 0


def test_flashcards(client):
    h = register(client, "hoa")
    q = client.get("/api/vocab/queue", headers=h).json()
    assert len(q) == 12 and all(w["card"] is None for w in q)  # day 1 words only
    assert q[0]["preview"] == {"again": 0, "hard": 1, "good": 1, "easy": 1}
    card =client.post("/api/vocab/review", headers=h, json={"word_id": q[0]["id"], "grade": "good"}).json()
    assert card["interval"] == 1 and card["due"] > learner.today().isoformat()
    again = client.post("/api/vocab/review", headers=h, json={"word_id": q[1]["id"], "grade": "again"}).json()
    assert again["due"] == learner.today().isoformat()
    ids = [w["id"] for w in client.get("/api/vocab/queue", headers=h).json()]
    assert q[0]["id"] not in ids and q[1]["id"] in ids
    assert client.post("/api/vocab/review", headers=h, json={"word_id": q[0]["id"], "grade": "meh"}).status_code == 400
    s = client.get("/api/vocab/stats", headers=h).json()
    assert s["total"] == 12 and s["stages"] == {"new": 10, "learning": 2, "young": 0, "mature": 0}
    assert len(s["forecast"]) == 7 and s["forecast"][0]["due"] == 1 and s["forecast"][1]["due"] == 1


def test_memory_stage():
    assert learner.stage(None) == "new"
    assert [learner.stage({"interval": i}) for i in (0, 3, 21)] == ["learning", "young", "mature"]


def test_sm2_intervals_grow():
    c = None
    intervals = []
    for _ in range(4):
        c = learner.schedule(c, "good")
        intervals.append(c["interval"])
    assert intervals[:2] == [1, 3] and intervals[3] > intervals[2] > 3


def test_writing_disabled_without_key(client):
    h = register(client, "tuan")
    assert client.get("/api/writing/status", headers=h).json()["enabled"] is False
    r = client.post("/api/writing/grade", headers=h, json={"task_type": "task2", "prompt": "Some people think...", "essay": "word " * 100})
    assert r.status_code == 503


def test_writing_validation_and_rounding(client, monkeypatch):
    h = register(client, "mai")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    fake = {c: {"band": 5.3, "comment": "ok"} for c in writing.CRITERIA}
    fake["task_response"]["band"] = 6.2
    monkeypatch.setattr(writing, "_call_claude", lambda *a: {**fake, "overall": 9, "strengths": [], "improvements": [], "corrections": [], "sample_paragraph": ""})
    short = client.post("/api/writing/grade", headers=h, json={"task_type": "task2", "prompt": "Discuss both views.", "essay": "too short"})
    assert short.status_code == 400
    r = client.post("/api/writing/grade", headers=h, json={"task_type": "task2", "prompt": "Discuss both views.", "essay": "word " * 120})
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert res["task_response"]["band"] == 6.0 and res["lexical_resource"]["band"] == 5.5
    assert res["overall"] == 5.5  # recomputed from criteria, not trusted from the model
    assert len(client.get("/api/writing/history", headers=h).json()) == 1


def admin_headers(client):
    r = client.post("/api/auth/login", json={"username": "boss", "password": "AdminPass1"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    return {"Authorization": f'Bearer {r.json()["token"]}'}


def test_admin_access_and_accounts(client):
    learner_h = register(client, "hocvien1")
    assert client.get("/api/admin/overview", headers=learner_h).status_code == 403
    h = admin_headers(client)
    created = client.post("/api/admin/learners", headers=h, json={"learners": [
        {"username": "lop10a.an", "full_name": "Nguyễn Văn An"}, {"username": "lop10a.binh", "full_name": "Trần Thị Bình", "password": "Binh12345"}]})
    assert created.status_code == 201, created.text
    pw = created.json()[0]["password"]
    assert len(pw) >= 8 and created.json()[1]["password"] == "Binh12345"
    assert client.post("/api/auth/login", json={"username": "lop10a.an", "password": pw}).status_code == 200
    # All or nothing: a duplicate on line 2 creates nobody, and the error names the line.
    dup = client.post("/api/admin/learners", headers=h, json={"learners": [{"username": "lop10a.cuong"}, {"username": "lop10a.an"}]})
    assert dup.status_code == 409 and dup.json()["error"].startswith("Dòng 2")
    assert client.post("/api/auth/login", json={"username": "lop10a.cuong", "password": "x" * 8}).status_code == 401
    # Lock signs the learner out and blocks login; reset password issues a new one.
    an = {"Authorization": f'Bearer {client.post("/api/auth/login", json={"username": "lop10a.an", "password": pw}).json()["token"]}'}
    assert client.put("/api/admin/learners/lop10a.an", headers=h, json={"active": False}).json()["active"] is False
    assert client.get("/api/auth/me", headers=an).status_code == 401
    assert client.post("/api/auth/login", json={"username": "lop10a.an", "password": pw}).status_code == 403
    client.put("/api/admin/learners/lop10a.an", headers=h, json={"active": True})
    new_pw = client.post("/api/admin/learners/lop10a.an/reset-password", headers=h).json()["password"]
    assert client.post("/api/auth/login", json={"username": "lop10a.an", "password": new_pw}).status_code == 200
    assert client.post("/api/admin/learners/boss/reset-password", headers=h).status_code == 404  # admins are not learners


def test_xp_badges_leaderboard_and_games(client):
    h = register(client, "xp.player")
    for t in content.build_day(1)["tasks"]:
        client.put(f'/api/days/1/tasks/{t["id"]}', headers=h, json={"done": True})
    p = client.get("/api/me/profile", headers=h).json()
    assert p["xp"] == 5 * 10 + 20 and p["today_xp"] == 70 and p["level"] == 1
    assert {b["id"] for b in p["badges"] if b["earned"]} == {"first_step"}
    client.put("/api/days/1/tasks/vocab", headers=h, json={"done": False})
    assert client.get("/api/me/profile", headers=h).json()["xp"] == 60  # un-ticking takes the task XP back, the day bonus stays
    words = client.get("/api/games/words", headers=h).json()
    assert len(words) >= 12
    r = client.post("/api/games/result", headers=h, json={"game": "match", "correct": 6, "total": 6, "duration_s": 30}).json()
    assert r["xp"] == 12 and r["best_pct"] == 100
    assert client.post("/api/games/result", headers=h, json={"game": "chess", "correct": 1, "total": 1, "duration_s": 1}).status_code == 400
    assert client.post("/api/games/result", headers=h, json={"game": "match", "correct": 9, "total": 6, "duration_s": 1}).status_code == 400
    for _ in range(10):  # daily cap on game XP
        client.post("/api/games/result", headers=h, json={"game": "listen", "correct": 10, "total": 10, "duration_s": 20})
    assert sum(g["xp"] for g in learner.get(__import__("app.store", fromlist=["load"]).load(), "xp.player")["games"]) == game.GAME_XP_DAILY_CAP
    lb = client.get("/api/leaderboard", headers=h).json()
    assert lb["me"]["rank"] == 1 and lb["top"][0]["me"] and "username" not in lb["top"][0]


def test_admin_reports_and_csv(client):
    h = admin_headers(client)
    ov = client.get("/api/admin/overview", headers=h).json()
    assert ov["learners"] >= 3 and len(ov["trend"]) == 14 and len(ov["weekly"]) == 12 and ov["storage"] == "file"
    rows = client.get("/api/admin/learners", headers=h).json()
    xp_row = next(r for r in rows if r["username"] == "xp.player")
    assert xp_row["xp"] > 0 and xp_row["current_day"] == 1
    assert all(r["username"] != "boss" for r in rows)
    d = client.get("/api/admin/learners/minh", headers=h).json()
    assert d["attempts"] and d["placement"]["start_week"] == 5
    assert client.get("/api/admin/learners/nobody", headers=h).status_code == 404
    att = client.get("/api/admin/attempts", headers=h).json()
    assert att and {"username", "full_name", "status", "started_at"} <= set(att[0])
    r = client.get("/api/admin/export/learners.csv", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv") and "username,full_name" in r.text
    assert "minh" in client.get("/api/admin/export/attempts.csv", headers=h).text
    assert client.get("/api/admin/export/secrets.csv", headers=h).status_code == 404


def test_english_error_messages(client):
    r = client.post("/api/auth/login", headers={"X-Lang": "en"}, json={"username": "nobody", "password": "whatever1"})
    assert r.json()["error"] == "Wrong username or password"
    r = client.post("/api/auth/register", headers={"X-Lang": "en"}, json={"username": "abcd", "password": "short"})
    assert r.json()["error"] == "Password must be at least 8 characters"
    assert client.post("/api/auth/login", json={"username": "nobody", "password": "whatever1"}).json()["error"] == "Sai tên đăng nhập hoặc mật khẩu"


def test_english_content_complete():
    for d in (1, 7, 29, 84):
        plan = content.build_day(d)
        assert plan["title_en"] and plan["week_title_en"] and plan["can_do_en"]
        assert all(t["label_en"] and t["detail_en"] for t in plan["tasks"])
    rm = content.roadmap()
    assert rm["note_en"] and all(p["title_en"] and p["goal_en"] for p in rm["phases"])
    assert all(len(w["topics_en"]) == 6 and w["title_en"] for w in rm["weeks"])
    for w in range(1, 13):
        t = exams.weekly(w)
        assert t["title_en"] and all(q["explain_en"] for q in t["questions"]), w


def test_postgres_store_roundtrip(monkeypatch):
    """The DATABASE_URL path with a fake connection: upsert on save, one SELECT then served from memory."""
    import json as _json
    from app import store
    calls, row = [], {}

    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, sql, params=None):
            calls.append(sql.split()[0])
            if sql.startswith("INSERT"):
                row["data"] = _json.loads(params[0])
            return self
        def fetchone(self):
            return (row["data"],) if row else None

    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setattr(store, "_pg", lambda: FakeConn())
    monkeypatch.setattr(store, "_cache", None)
    assert store.backend() == "postgres"
    db = store.load()
    assert db["users"] == [] and calls == ["SELECT"]
    db["users"].append({"username": "pg.user"})
    store.save(db)
    assert row["data"]["users"][0]["username"] == "pg.user" and calls == ["SELECT", "INSERT"]
    again = store.load()
    again["users"].clear()  # callers get a copy; the cache is untouched
    assert store.load()["users"][0]["username"] == "pg.user" and calls == ["SELECT", "INSERT"]


def test_reminders_and_push(client, monkeypatch):
    from app import reminders
    h = register(client, "nhac")
    s = client.get("/api/reminders", headers=h).json()
    assert s["enabled"] is False and s["devices"] == 0 and len(s["vapid_public_key"]) == 87  # 65-byte P-256 point
    assert client.put("/api/reminders", headers=h, json={"enabled": True, "time": "25:00"}).status_code == 400
    assert client.put("/api/reminders", headers=h, json={"enabled": True, "time": "00:00"}).json()["enabled"] is True
    sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k", "auth": "a"}}
    assert client.post("/api/push/subscribe", headers=h, json={"endpoint": "http://x"}).status_code == 400
    assert client.post("/api/push/subscribe", headers=h, json=sub).json()["devices"] == 1
    assert client.post("/api/push/subscribe", headers=h, json=sub).json()["devices"] == 1  # same device once

    sent = []
    monkeypatch.setattr(reminders, "_push", lambda s, data: sent.append((s["endpoint"], data)) or 201)
    assert client.post("/api/push/test", headers=h).json()["sent"] == 1

    monkeypatch.delenv("CRON_SECRET", raising=False)
    assert client.post("/api/reminders/run").status_code == 503
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    assert client.post("/api/reminders/run?key=nope").status_code == 403
    sent.clear()
    r = client.post("/api/reminders/run", headers={"X-Cron-Key": "s3cret"}).json()
    assert r["sent"] == 1 and sent[0][1]["url"] == "/#/today"  # nothing studied yet: today's tasks come first
    assert client.get("/api/reminders/run?key=s3cret").json()["sent"] == 0  # once per day

    # The device moves to whoever subscribes on it last; an expired subscription (410) is dropped.
    h2 = register(client, "nhac2")
    client.post("/api/push/subscribe", headers=h2, json=sub)
    assert client.get("/api/reminders", headers=h).json()["devices"] == 0
    monkeypatch.setattr(reminders, "_push", lambda s, data: 410)
    assert client.post("/api/push/test", headers=h2).json()["sent"] == 0
    assert client.get("/api/reminders", headers=h2).json()["devices"] == 0
    assert client.post("/api/push/test", headers=h2).status_code == 400
