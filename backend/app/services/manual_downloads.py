from __future__ import annotations

from datetime import datetime
from typing import Iterable
from sqlalchemy import text
from sqlalchemy.orm import Session
from loguru import logger

STATUS_PENDING = "pending"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"


def _ensure_table(session: Session) -> None:
    session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS manual_download (
                tag TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                downloader_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_error TEXT NULL
            )
            """
        )
    )


def record_manual_download(session: Session, *, tag: str, title: str, downloader_id: int) -> None:
    _ensure_table(session)
    session.execute(
        text(
            """
            INSERT OR REPLACE INTO manual_download (tag, title, downloader_id, status, created_at, last_error)
            VALUES (:tag, :title, :downloader_id, :status, :created_at, NULL)
            """
        ),
        {
            "tag": tag,
            "title": title,
            "downloader_id": downloader_id,
            "status": STATUS_PENDING,
            "created_at": datetime.utcnow().isoformat() + "Z",
        },
    )
    session.commit()
    logger.info(
        "manual_download_recorded",
        tag=tag,
        title=title,
        downloader_id=downloader_id,
        status=STATUS_PENDING,
    )


def list_manual_pending(session: Session) -> list[dict]:
    _ensure_table(session)
    rows = session.execute(
        text(
            """
            SELECT tag, title, downloader_id, status, last_error
            FROM manual_download
            WHERE status = :status
            """
        ),
        {"status": STATUS_PENDING},
    ).mappings()
    data = [dict(row) for row in rows]
    logger.debug("manual_download_pending", count=len(data))
    return data


def update_manual_status(
    session: Session,
    *,
    tag: str,
    status: str,
    last_error: str | None = None,
) -> None:
    _ensure_table(session)
    session.execute(
        text(
            """
            UPDATE manual_download
            SET status = :status, last_error = :last_error
            WHERE tag = :tag
            """
        ),
        {"status": status, "last_error": last_error, "tag": tag},
    )
    session.commit()
    logger.info("manual_download_updated", tag=tag, status=status, has_error=bool(last_error), last_error=last_error)
