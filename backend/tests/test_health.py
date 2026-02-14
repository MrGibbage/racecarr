import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


def _configure_env() -> None:
    # Disable scheduler side effects and use an isolated SQLite DB per test run.
    os.environ.setdefault("ENABLE_SCHEDULER", "false")
    sandbox_dir = Path(tempfile.mkdtemp(prefix="racecarr-test-"))
    os.environ.setdefault("SQLITE_PATH", str(sandbox_dir / "test.db"))


_configure_env()
from app.main import app  # noqa: E402  pylint: disable=wrong-import-position

client = TestClient(app)


def test_healthz_returns_ok() -> None:
    resp = client.get("/api/healthz")
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"
