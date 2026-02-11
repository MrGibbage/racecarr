from __future__ import annotations

from typing import Literal
from sqlalchemy.orm import Session
from ..models.entities import AppConfig
from ..core.config import get_settings
from ..core.logging_config import configure_logging

LogLevel = Literal["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

ALLOWED_LOG_LEVELS: set[str] = {"TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


def _normalize_level(level: str) -> LogLevel:
    upper = level.upper()
    if upper not in ALLOWED_LOG_LEVELS:
        raise ValueError(f"Invalid log level: {level}")
    return upper  # type: ignore[return-value]


def ensure_app_config(session: Session) -> AppConfig:
    row = session.get(AppConfig, 1)
    if row:
        return row
    default_level = _normalize_level(get_settings().log_level)
    row = AppConfig(id=1, log_level=default_level)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def get_app_config(session: Session) -> AppConfig:
    return ensure_app_config(session)


def set_log_level(session: Session, level: str) -> AppConfig:
    normalized = _normalize_level(level)
    row = ensure_app_config(session)
    row.log_level = normalized
    session.commit()
    session.refresh(row)
    configure_logging(normalized)
    return row
