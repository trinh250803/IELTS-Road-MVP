"""State store behind a load/save interface.

- DATABASE_URL set (e.g. a free Neon PostgreSQL): the whole state is one JSONB row, kept in memory
  and written through on every save. Survives restarts and redeploys. Assumes a single app process
  (uvicorn's default), which is what the Render free plan runs.
- Otherwise: a JSON file at DB_PATH (local development; wiped on Render free-plan restarts).
"""
import copy
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EMPTY = {"users": [], "learners": {}, "revoked_tokens": {}}
lock = threading.RLock()
_cache: dict | None = None


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH") or ROOT / "data" / "db.json")


def backend() -> str:
    return "postgres" if os.environ.get("DATABASE_URL") else "file"


def _pg():
    import psycopg
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())")
    return conn


def load() -> dict:
    global _cache
    if backend() == "postgres":
        with lock:
            if _cache is None:
                with _pg() as conn:
                    row = conn.execute("SELECT data FROM app_state WHERE id = 1").fetchone()
                _cache = {**copy.deepcopy(EMPTY), **(row[0] if row else {})}
            return copy.deepcopy(_cache)
    try:
        return {**copy.deepcopy(EMPTY), **json.loads(db_path().read_text(encoding="utf-8"))}
    except (FileNotFoundError, json.JSONDecodeError):
        return copy.deepcopy(EMPTY)


def save(db: dict) -> None:
    global _cache
    raw = json.dumps(db, ensure_ascii=False)
    if backend() == "postgres":
        with lock:
            with _pg() as conn:
                conn.execute("INSERT INTO app_state (id, data) VALUES (1, %s::jsonb) "
                             "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", (raw,))
            _cache = json.loads(raw)
        return
    p = db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(raw, encoding="utf-8")
    os.replace(tmp, p)
