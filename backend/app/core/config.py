from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings


# Resolve backend directory so the default DB path is stable across platforms and working directories.
BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = BASE_DIR / "config" / "data.db"
DEFAULT_LOG_PATH = BASE_DIR / "config" / "app.log"


class Settings(BaseSettings):
    app_name: str = "Racecarr"
    env: str = Field("development", validation_alias="ENV")
    api_prefix: str = "/api"
    log_level: str = Field("INFO", validation_alias="LOG_LEVEL")
    sqlite_path: Path = Field(default_factory=lambda: DEFAULT_SQLITE_PATH, validation_alias="SQLITE_PATH")
    log_path: Path = Field(default_factory=lambda: DEFAULT_LOG_PATH, validation_alias="LOG_PATH")
    f1api_base_url: str = Field("https://f1api.dev", validation_alias="F1API_BASE_URL")
    scheduler_tick_seconds: int = Field(600, validation_alias="SCHEDULER_TICK_SECONDS")
    enable_scheduler: bool = Field(True, validation_alias="ENABLE_SCHEDULER")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
