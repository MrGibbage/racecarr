import time
from datetime import datetime
from typing import Any
import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from loguru import logger

from ..core.config import get_settings
from ..models.entities import Season, Round, Event


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # Accept ISO with trailing Z
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value)
    except Exception:
        return None


SESSION_KEY_TO_TYPE = {
    "race": "Race",
    "qualy": "Qualifying",
    "fp1": "FP1",
    "fp2": "FP2",
    "fp3": "FP3",
    "sprintQualy": "Sprint Qualifying",
    "sprintRace": "Sprint",
}


def _extract_events(schedule: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for key, label in SESSION_KEY_TO_TYPE.items():
        entry = schedule.get(key)
        if not entry:
            continue
        # Prefer explicit start, otherwise combine date+time if provided
        start = entry.get("start") or entry.get("datetime")
        if not start:
            date = entry.get("date")
            time = entry.get("time")
            if date and time:
                start = f"{date}T{time}"
            elif date:
                start = date
        end = entry.get("end") or None
        events.append({
            "type": label,
            "start": _parse_dt(start),
            "end": _parse_dt(end),
        })
    return events


def refresh_season(session: Session, year: int) -> Season:
    settings = get_settings()
    url = f"{settings.f1api_base_url}/api/{year}"
    started = time.monotonic()
    logger.info("f1api_fetch_start", url=url, year=year)
    try:
        resp = httpx.get(url, timeout=15)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "f1api_fetch_non_200",
            url=url,
            year=year,
            status=exc.response.status_code,
            duration_ms=duration_ms,
        )
        detail = f"f1api responded {exc.response.status_code} for {url}"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    except httpx.RequestError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning("f1api_fetch_failed", url=url, year=year, error=str(exc), duration_ms=duration_ms)
        detail = f"f1api request failed for {url}: {exc}"
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=detail) from exc
    payload = resp.json()
    races = payload.get("races", [])
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "f1api_fetch_ok",
        url=url,
        year=year,
        status=resp.status_code,
        races=len(races),
        duration_ms=duration_ms,
    )

    season: Season | None = session.query(Season).filter_by(year=year).first()
    if not season:
        season = Season(year=year)
        session.add(season)
        session.flush()

    # Refreshing should unhide the season if it was previously hidden.
    season.is_deleted = False

    # Clear existing rounds/events for this season
    season.rounds.clear()
    session.flush()

    event_count = 0
    for race in races:
        round_number = int(race.get("round", 0)) if race.get("round") else 0
        round_obj = Round(
            season_id=season.id,
            round_number=round_number,
            name=race.get("raceName") or race.get("name") or f"Round {round_number}",
            circuit=(race.get("circuit") or {}).get("circuitName") or (race.get("circuit") or {}).get("name"),
            country=(race.get("circuit") or {}).get("country"),
        )

        schedule = race.get("schedule") or {}
        for ev in _extract_events(schedule):
            round_obj.events.append(
                Event(
                    type=ev["type"],
                    start_time_utc=ev["start"],
                    end_time_utc=ev["end"],
                )
            )
            event_count += 1

        season.rounds.append(round_obj)

    season.last_refreshed = datetime.utcnow()
    session.commit()
    session.refresh(season)
    total_duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "f1api_refresh_done",
        year=year,
        rounds=len(season.rounds),
        events=event_count,
        duration_ms=total_duration_ms,
    )
    return season