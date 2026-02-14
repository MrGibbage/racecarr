from __future__ import annotations

from typing import Literal, Any
import json
from sqlalchemy.orm import Session
from ..models.entities import AppConfig
from ..core.config import get_settings
from ..core.logging_config import configure_logging
from ..schemas.common import SearchSettings

LogLevel = Literal["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

ALLOWED_LOG_LEVELS: set[str] = {"TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


DEFAULT_MIN_RES = 720
DEFAULT_MAX_RES = 2160
DEFAULT_ALLOW_HDR = True
DEFAULT_AUTO_DOWNLOAD_THRESHOLD = 50
DEFAULT_EVENT_ALLOWLIST = ["race", "qualifying", "sprint", "sprint-qualifying", "fp1", "fp2", "fp3"]


def _parse_json(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _dump_json(value: Any) -> str:
    return json.dumps(value or [])


def _normalize_level(level: str) -> LogLevel:
    upper = level.upper()
    if upper not in ALLOWED_LOG_LEVELS:
        raise ValueError(f"Invalid log level: {level}")
    return upper  # type: ignore[return-value]


def ensure_app_config(session: Session) -> AppConfig:
    row = session.get(AppConfig, 1)
    if row:
        # Backfill nullable fields with defaults if missing
        changed = False
        if row.min_resolution is None:
            row.min_resolution = DEFAULT_MIN_RES
            changed = True
        if row.max_resolution is None:
            row.max_resolution = DEFAULT_MAX_RES
            changed = True
        if row.allow_hdr is None:
            row.allow_hdr = DEFAULT_ALLOW_HDR
            changed = True
        if row.auto_download_threshold is None:
            row.auto_download_threshold = DEFAULT_AUTO_DOWNLOAD_THRESHOLD
            changed = True
        if not row.event_allowlist:
            row.event_allowlist = _join_csv(DEFAULT_EVENT_ALLOWLIST)
            changed = True
        if row.notification_targets is None:
            row.notification_targets = _dump_json([])
            changed = True
        if changed:
            session.commit()
            session.refresh(row)
        return row
    default_level = _normalize_level(get_settings().log_level)
    row = AppConfig(
        id=1,
        log_level=default_level,
        min_resolution=DEFAULT_MIN_RES,
        max_resolution=DEFAULT_MAX_RES,
        allow_hdr=DEFAULT_ALLOW_HDR,
        auto_download_threshold=DEFAULT_AUTO_DOWNLOAD_THRESHOLD,
        event_allowlist=_join_csv(DEFAULT_EVENT_ALLOWLIST),
        notification_targets=_dump_json([]),
    )
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


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part and part.strip()]


def _join_csv(items: list[str]) -> str:
    return ",".join(sorted({i.strip() for i in items if i and i.strip()}))


def get_search_settings(session: Session) -> SearchSettings:
    row = ensure_app_config(session)
    allowlist = [et.lower() for et in _split_csv(row.event_allowlist)] or [et.lower() for et in DEFAULT_EVENT_ALLOWLIST]
    return SearchSettings(
        min_resolution=row.min_resolution or DEFAULT_MIN_RES,
        max_resolution=row.max_resolution or DEFAULT_MAX_RES,
        allow_hdr=row.allow_hdr if row.allow_hdr is not None else DEFAULT_ALLOW_HDR,
        preferred_codecs=_split_csv(row.preferred_codecs),
        preferred_groups=_split_csv(row.preferred_groups),
        auto_download_threshold=row.auto_download_threshold or DEFAULT_AUTO_DOWNLOAD_THRESHOLD,
        default_downloader_id=row.default_downloader_id,
        event_allowlist=allowlist,
    )


def update_search_settings(session: Session, payload: SearchSettings) -> SearchSettings:
    row = ensure_app_config(session)
    row.min_resolution = payload.min_resolution
    row.max_resolution = payload.max_resolution
    row.allow_hdr = payload.allow_hdr
    row.preferred_codecs = _join_csv(payload.preferred_codecs)
    row.preferred_groups = _join_csv(payload.preferred_groups)
    row.auto_download_threshold = payload.auto_download_threshold
    row.default_downloader_id = payload.default_downloader_id
    normalized_allowlist = [et.lower() for et in payload.event_allowlist]
    row.event_allowlist = _join_csv(normalized_allowlist)
    session.commit()
    session.refresh(row)
    return get_search_settings(session)


def list_notification_targets(session: Session) -> list[dict[str, Any]]:
    row = ensure_app_config(session)
    targets = _parse_json(row.notification_targets) or []
    if not isinstance(targets, list):
        targets = []
    return targets


def save_notification_targets(session: Session, targets: list[dict[str, Any]]) -> None:
    row = ensure_app_config(session)
    row.notification_targets = _dump_json(targets)
    session.commit()
    session.refresh(row)
