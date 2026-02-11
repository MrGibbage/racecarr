import json
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Iterable
from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy import text, select
from sqlalchemy.orm import Session
from ..core.database import get_session
from ..core.config import get_settings
from ..core.logging_config import log_response
from ..schemas.common import (
    HealthStatus,
    SeasonOut,
    SeasonDetail,
    SearchResult,
    LogEntry,
    IndexerCreate,
    IndexerUpdate,
    IndexerOut,
    IndexerTestResult,
    DownloaderCreate,
    DownloaderUpdate,
    DownloaderOut,
    DownloaderTestResult,
    DownloaderSendRequest,
    DownloaderSendResult,
    AuthLoginRequest,
    AuthLoginResponse,
    AuthMeResponse,
    AuthChangePasswordRequest,
)
from ..models.entities import Season, Round, Indexer, Downloader
from ..services.f1api import refresh_season
from ..services.indexer_client import test_indexer_connection
from ..services.downloader_client import test_downloader_connection, send_to_downloader
from ..services.auth import (
    ensure_auth_row,
    verify_password,
    create_session_token,
    parse_session_token,
    refresh_session_token,
    update_password,
    AuthSession,
)

router = APIRouter()


COOKIE_NAME = "rc_session"


def require_auth(request: Request, response: Response, session: Session = Depends(get_session)) -> AuthSession:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    auth_session = parse_session_token(token)
    # Refresh idle timestamp (sliding window) but keep original expiry
    new_token = refresh_session_token(token)
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        new_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.auth_remember_days * 24 * 3600,
        path="/",
    )
    return auth_session


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


@router.post("/auth/login", response_model=AuthLoginResponse)
def login(payload: AuthLoginRequest, response: Response, session: Session = Depends(get_session)) -> AuthLoginResponse:
    row = ensure_auth_row(session)
    if not verify_password(payload.password, row.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")
    token = create_session_token(user_id=1, remember_me=payload.remember_me)
    settings = get_settings()
    max_age = (settings.auth_remember_days if payload.remember_me else settings.auth_session_days) * 24 * 3600
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=max_age,
        path="/",
    )
    log_response("auth_login", ok=True)
    return AuthLoginResponse(ok=True, message="Logged in")


@router.post("/auth/logout", response_model=AuthLoginResponse)
def logout(response: Response) -> AuthLoginResponse:
    response.delete_cookie(COOKIE_NAME, path="/")
    log_response("auth_logout")
    return AuthLoginResponse(ok=True, message="Logged out")


@router.get("/auth/me", response_model=AuthMeResponse)
def auth_me(request: Request) -> AuthMeResponse:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    session = parse_session_token(token)
    return AuthMeResponse(
        authenticated=True,
        expires_at=session.expires_at,
        idle_timeout_minutes=get_settings().auth_idle_timeout_minutes,
    )


@router.post("/auth/password", response_model=AuthLoginResponse)
def change_password(
    payload: AuthChangePasswordRequest,
    auth: AuthSession = Depends(require_auth),
    session: Session = Depends(get_session),
) -> AuthLoginResponse:
    row = ensure_auth_row(session)
    if not verify_password(payload.current_password, row.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password invalid")
    update_password(session, payload.new_password)
    log_response("auth_change_password")
    return AuthLoginResponse(ok=True, message="Password updated")


@router.get("/seasons", response_model=list[SeasonDetail])
def list_seasons(session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)) -> list[SeasonDetail]:
    seasons = (
        session.query(Season)
        .options(selectinload(Season.rounds).selectinload(Round.events))
        .order_by(Season.year.desc())
        .all()
    )
    log_response("list_seasons", count=len(seasons))
    return seasons


@router.api_route("/demo-seasons", methods=["POST", "GET"], response_model=list[SeasonDetail])
def seed_demo_seasons(session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)) -> list[SeasonDetail]:
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
    return (
        session.query(Season)
        .options(selectinload(Season.rounds).selectinload(Round.events))
        .order_by(Season.year.desc())
        .all()
    )

@router.post("/seasons/{year}/refresh", response_model=SeasonDetail)
def refresh_season_data(
    year: int, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)
) -> SeasonDetail:
    season = refresh_season(session, year)
    log_response("refresh_season", year=year, rounds=len(season.rounds))
    return season

@router.get("/search-demo", response_model=list[SearchResult])
def search_demo(auth: AuthSession = Depends(require_auth)) -> list[SearchResult]:
    """Return sample search results for UI demo purposes."""
    results = [
        SearchResult(
            title="F1.2026.Round01.Bahrain.1080p.HDR.DSNP",
            indexer="F1API",
            size_mb=3200,
            age_days=1,
            seeders=1240,
            leechers=85,
            quality="1080p HDR",
            nzb_url="https://example.com/nzb/2026-bahrain-1080p",
        ),
        SearchResult(
            title="F1.2025.Round22.AbuDhabi.720p.NF",
            indexer="F1API",
            size_mb=2100,
            age_days=45,
            seeders=640,
            leechers=40,
            quality="720p",
            nzb_url="https://example.com/nzb/2025-abu-720p",
        ),
        SearchResult(
            title="F1.2024.Round10.Silverstone.2160p.UHD.BluRay",
            indexer="Archive",
            size_mb=7200,
            age_days=210,
            seeders=310,
            leechers=12,
            quality="4K HDR",
            nzb_url="https://example.com/nzb/2024-silverstone-uhd",
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
def recent_logs(auth: AuthSession = Depends(require_auth)) -> list[LogEntry]:
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


@router.get("/indexers", response_model=list[IndexerOut])
def list_indexers(session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)) -> list[IndexerOut]:
    rows = session.query(Indexer).order_by(Indexer.name.asc()).all()
    log_response("list_indexers", count=len(rows))
    return rows


@router.post("/indexers", response_model=IndexerOut, status_code=status.HTTP_201_CREATED)
def create_indexer(
    payload: IndexerCreate, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)
) -> IndexerOut:
    item = Indexer(
        name=payload.name,
        api_url=payload.api_url,
        api_key=payload.api_key,
        category=payload.category,
        enabled=payload.enabled,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    log_response("create_indexer", id=item.id)
    return item


@router.put("/indexers/{indexer_id}", response_model=IndexerOut)
def update_indexer(
    indexer_id: int, payload: IndexerUpdate, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)
) -> IndexerOut:
    item: Indexer | None = session.query(Indexer).filter_by(id=indexer_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Indexer not found")

    if payload.name is not None:
        item.name = payload.name
    if payload.api_url is not None:
        item.api_url = payload.api_url
    if payload.api_key is not None:
        item.api_key = payload.api_key
    if payload.category is not None:
        item.category = payload.category
    if payload.enabled is not None:
        item.enabled = payload.enabled

    session.commit()
    session.refresh(item)
    log_response("update_indexer", id=item.id)
    return item


@router.delete("/indexers/{indexer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_indexer(indexer_id: int, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)) -> None:
    item: Indexer | None = session.query(Indexer).filter_by(id=indexer_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Indexer not found")
    session.delete(item)
    session.commit()
    log_response("delete_indexer", id=indexer_id)
    return None


@router.post("/indexers/{indexer_id}/test", response_model=IndexerTestResult)
def test_indexer(indexer_id: int, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)) -> IndexerTestResult:
    item: Indexer | None = session.query(Indexer).filter_by(id=indexer_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Indexer not found")
    ok, message = test_indexer_connection(item)
    log_response("test_indexer", id=indexer_id, ok=ok)
    return IndexerTestResult(ok=ok, message=message)


@router.get("/downloaders", response_model=list[DownloaderOut])
def list_downloaders(session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)) -> list[DownloaderOut]:
    rows = session.query(Downloader).order_by(Downloader.name.asc()).all()
    log_response("list_downloaders", count=len(rows))
    return rows


@router.post("/downloaders", response_model=DownloaderOut, status_code=status.HTTP_201_CREATED)
def create_downloader(
    payload: DownloaderCreate, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)
) -> DownloaderOut:
    item = Downloader(
        name=payload.name,
        type=payload.type,
        api_url=payload.api_url,
        api_key=payload.api_key,
        category=payload.category,
        priority=payload.priority,
        enabled=payload.enabled,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    log_response("create_downloader", id=item.id)
    return item


@router.put("/downloaders/{downloader_id}", response_model=DownloaderOut)
def update_downloader(
    downloader_id: int,
    payload: DownloaderUpdate,
    session: Session = Depends(get_session),
    auth: AuthSession = Depends(require_auth),
) -> DownloaderOut:
    item: Downloader | None = session.query(Downloader).filter_by(id=downloader_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Downloader not found")

    if payload.name is not None:
        item.name = payload.name
    if payload.type is not None:
        item.type = payload.type
    if payload.api_url is not None:
        item.api_url = payload.api_url
    if payload.api_key is not None:
        item.api_key = payload.api_key
    if payload.category is not None:
        item.category = payload.category
    if payload.priority is not None:
        item.priority = payload.priority
    if payload.enabled is not None:
        item.enabled = payload.enabled

    session.commit()
    session.refresh(item)
    log_response("update_downloader", id=item.id)
    return item


@router.delete("/downloaders/{downloader_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_downloader(
    downloader_id: int, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)
) -> None:
    item: Downloader | None = session.query(Downloader).filter_by(id=downloader_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Downloader not found")
    session.delete(item)
    session.commit()
    log_response("delete_downloader", id=downloader_id)
    return None


@router.post("/downloaders/{downloader_id}/test", response_model=DownloaderTestResult)
def test_downloader(
    downloader_id: int, session: Session = Depends(get_session), auth: AuthSession = Depends(require_auth)
) -> DownloaderTestResult:
    item: Downloader | None = session.query(Downloader).filter_by(id=downloader_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Downloader not found")
    ok, message = test_downloader_connection(item)
    log_response("test_downloader", id=downloader_id, ok=ok)
    return DownloaderTestResult(ok=ok, message=message)


@router.post("/downloaders/{downloader_id}/send", response_model=DownloaderSendResult)
def send_to_downloader_route(
    downloader_id: int,
    payload: DownloaderSendRequest,
    session: Session = Depends(get_session),
    auth: AuthSession = Depends(require_auth),
) -> DownloaderSendResult:
    item: Downloader | None = session.query(Downloader).filter_by(id=downloader_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Downloader not found")
    ok, message = send_to_downloader(
        item,
        nzb_url=payload.nzb_url,
        title=payload.title,
        category=payload.category or item.category,
        priority=payload.priority if payload.priority is not None else item.priority,
    )
    log_response("send_to_downloader", id=downloader_id, ok=ok)
    return DownloaderSendResult(ok=ok, message=message)
