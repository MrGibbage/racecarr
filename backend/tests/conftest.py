import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# Configure environment once for the test session.
def _configure_env() -> None:
    os.environ.setdefault("ENABLE_SCHEDULER", "false")
    sandbox_dir = Path(tempfile.mkdtemp(prefix="racecarr-test-"))
    os.environ.setdefault("SQLITE_PATH", str(sandbox_dir / "test.db"))


_configure_env()
from app.main import app  # noqa: E402  pylint: disable=wrong-import-position


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
