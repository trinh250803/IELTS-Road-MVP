"""Loads a local .env (KEY=value lines) before any module reads the environment.
Real environment variables win, so hosts like Render are unaffected."""
import os
from pathlib import Path

_env = Path(__file__).resolve().parent.parent / ".env"
if _env.is_file():
    for _line in _env.read_text(encoding="utf-8").splitlines():
        _key, _sep, _value = _line.strip().partition("=")
        if _sep and _key and not _key.startswith("#") and _value:
            os.environ.setdefault(_key.strip(), _value.strip())
