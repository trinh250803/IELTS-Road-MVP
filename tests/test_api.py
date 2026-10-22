import pytest
from fastapi.testclient import TestClient

from app import content, exams, learner, writing


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    mp.setenv("DB_PATH", str(tmp_path_factory.mktemp("db") / "db.json"))
    mp.delenv("ANTHROPIC_API_KEY", raising=False)
    mp.setenv("DEMO_ACCOUNT", "demo:DemoPass1")
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
    card = client.post("/api/vocab/review", headers=h, json={"word_id": q[0]["id"], "grade": "good"}).json()
    assert card["interval"] == 1 and card["due"] > learner.today().isoformat()
    again = client.post("/api/vocab/review", headers=h, json={"word_id": q[1]["id"], "grade": "again"}).json()
    assert again["due"] == learner.today().isoformat()
    ids = [w["id"] for w in client.get("/api/vocab/queue", headers=h).json()]
    assert q[0]["id"] not in ids and q[1]["id"] in ids
    assert client.post("/api/vocab/review", headers=h, json={"word_id": q[0]["id"], "grade": "meh"}).status_code == 400


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
