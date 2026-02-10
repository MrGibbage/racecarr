import json
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Iterable
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text, select
from sqlalchemy.orm import Session
from ..core.database import get_session
from ..core.config import get_settings
from ..core.logging_config import log_response
from ..schemas.common import HealthStatus, SeasonOut, SearchResult, LogEntry
from ..models.entities import Season

router = APIRouter()


@router.get("/healthz", response_model=HealthStatus)
def healthz() -> HealthStatus:
    return HealthStatus(status="ok")


@router.get("/readyz", response_model=HealthStatus)
def readyz(session: Session = Depends(get_session)) -> HealthStatus:
    try:
        session.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - readiness probe
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return HealthStatus(status="ready")


@router.get("/seasons", response_model=list[SeasonOut])
def list_seasons(session: Session = Depends(get_session)) -> list[SeasonOut]:
    seasons = session.query(Season).order_by(Season.year.desc()).all()
    log_response("list_seasons", count=len(seasons))
    return seasons


@router.api_route("/demo-seasons", methods=["POST", "GET"], response_model=list[SeasonOut])
def seed_demo_seasons(session: Session = Depends(get_session)) -> list[SeasonOut]:
    """Insert three example seasons if they don't already exist."""
    existing_years = {row.year for row in session.execute(select(Season.year)).all()}
    current_year = datetime.utcnow().year
    sample_years = [current_year, current_year - 1, current_year - 2]

    new_seasons = []
    for year in sample_years:
        if year in existing_years:
            continue
        season = Season(year=year, last_refreshed=None)
        session.add(season)
        new_seasons.append(season)

    session.commit()
    log_response("seed_demo_seasons", inserted=len(new_seasons), total=len(existing_years) + len(new_seasons))
    # Return all seasons sorted desc
    return session.query(Season).order_by(Season.year.desc()).all()


@router.get("/search-demo", response_model=list[SearchResult])
def search_demo() -> list[SearchResult]:
    """Return sample search results for UI demo purposes."""
    results = [
        SearchResult(
            title="F1.2026.Round01.Bahrain.1080p.HDR.DSNP", indexer="F1API", size_mb=3200,
            age_days=1, seeders=1240, leechers=85, quality="1080p HDR"
        ),
        SearchResult(
            title="F1.2025.Round22.AbuDhabi.720p.NF", indexer="F1API", size_mb=2100,
            age_days=45, seeders=640, leechers=40, quality="720p"
        ),
        SearchResult(
            title="F1.2024.Round10.Silverstone.2160p.UHD.BluRay", indexer="Archive", size_mb=7200,
            age_days=210, seeders=310, leechers=12, quality="4K HDR"
        ),
    ]
    log_response("search_demo", count=len(results))
    return results


def _tail_lines(path: Path, max_lines: int = 50) -> Iterable[str]:
    if not path.exists():
        return []
    dq: deque[str] = deque(maxlen=max_lines)
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            dq.append(line.rstrip())
    return list(dq)


@router.get("/logs", response_model=list[LogEntry])
def recent_logs() -> list[LogEntry]:
    settings = get_settings()
    lines = _tail_lines(settings.log_path)
    entries: list[LogEntry] = []
    for line in lines:
        try:
            data = json.loads(line)
            record = data.get("record", {})
            entries.append(
                LogEntry(
                    timestamp=record.get("time", {}).get("repr") or record.get("time") or data.get("time", ""),
                    level=record.get("level", {}).get("name", "") or str(record.get("level", "")),
                    message=record.get("message") or data.get("message") or data.get("text", ""),
                )
            )
        except Exception:
            continue
    log_response("recent_logs", count=len(entries))
    return entries
