import json
import sys
import importlib.metadata
import json as jsonlib
import subprocess
import re
from collections import deque, Counter
from datetime import datetime, timedelta
from pathlib import Path
from time import perf_counter
from typing import Iterable
from loguru import logger
from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Query
from sqlalchemy import text, select
from sqlalchemy.orm import Session
from ..core.database import get_session
from ..core.config import get_settings, BASE_DIR
from ..core.logging_config import log_response
from ..schemas.common import (
    HealthStatus,
    SeasonOut,
    SeasonDetail,
    SearchResult,
    CachedSearchResponse,
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
    LogLevelRequest,
    LogLevelResponse,
    AboutResponse,
    DependencyVersion,
)
from ..models.entities import Season, Round, Indexer, Downloader, CachedSearch
from ..services.f1api import refresh_season
from ..services.indexer_client import test_indexer_connection, search_indexer
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
from ..services.app_config import get_app_config, set_log_level

router = APIRouter()

SERVER_STARTED_AT = datetime.utcnow().isoformat() + "Z"


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


@router.get("/settings/log-level", response_model=LogLevelResponse)
def get_log_level(auth: AuthSession = Depends(require_auth), session: Session = Depends(get_session)) -> LogLevelResponse:
    cfg = get_app_config(session)
    return LogLevelResponse(log_level=cfg.log_level)


@router.post("/settings/log-level", response_model=LogLevelResponse)
def update_log_level(
    payload: LogLevelRequest,
    auth: AuthSession = Depends(require_auth),
    session: Session = Depends(get_session),
) -> LogLevelResponse:
    try:
        cfg = set_log_level(session, payload.log_level)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    log_response("log_level_updated", level=cfg.log_level)
    return LogLevelResponse(log_level=cfg.log_level)


def _gather_backend_dependencies() -> list[DependencyVersion]:
    packages = [
        "fastapi",
        "uvicorn",
        "SQLAlchemy",
        "alembic",
        "pydantic",
        "httpx",
        "apscheduler",
        "loguru",
        "passlib",
        "itsdangerous",
    ]
    deps: list[DependencyVersion] = []
    for pkg in packages:
        try:
            version = importlib.metadata.version(pkg)
        except importlib.metadata.PackageNotFoundError:
            version = "unknown"
        deps.append(DependencyVersion(name=pkg, version=version))
    return deps


def _gather_frontend_dependencies() -> list[DependencyVersion]:
    repo_root = BASE_DIR.parent
    pkg_path = repo_root / "frontend" / "package.json"
    if not pkg_path.exists():
        return []
    try:
        with pkg_path.open("r", encoding="utf-8") as f:
            pkg = jsonlib.load(f)
    except Exception:
        return []

    deps: list[DependencyVersion] = []
    merged: dict[str, str] = {}
    merged.update(pkg.get("dependencies", {}) or {})
    merged.update(pkg.get("devDependencies", {}) or {})

    if not merged:
        return deps

    for name in sorted(merged.keys()):
        deps.append(DependencyVersion(name=name, version=str(merged.get(name, "unknown"))))
    return deps


def _get_git_sha() -> str:
    try:
        result = subprocess.run([
            "git",
            "-C",
            str(BASE_DIR),
            "rev-parse",
            "HEAD",
        ], capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except Exception:
        return "unknown"


@router.get("/settings/about", response_model=AboutResponse)
def about(auth: AuthSession = Depends(require_auth)) -> AboutResponse:
    settings = get_settings()
    backend_dependencies = _gather_backend_dependencies()
    frontend_dependencies = _gather_frontend_dependencies()
    python_version = sys.version.split(" ")[0]
    git_sha = _get_git_sha()
    return AboutResponse(
        app_name=settings.app_name,
        app_version=settings.app_version,
        python_version=python_version,
        backend_dependencies=backend_dependencies,
        frontend_dependencies=frontend_dependencies,
        github_url="https://github.com/MrGibbage/racecarr",
        git_sha=git_sha,
        server_started_at=SERVER_STARTED_AT,
    )


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


def _normalize_query_text(q: str) -> str:
    normalized = re.sub(r"[._-]+", " ", q)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _swap_formula_tokens(tokens: list[str]) -> list[str]:
    swapped: list[str] = []
    skip_next = False
    for idx, tok in enumerate(tokens):
        if skip_next:
            skip_next = False
            continue
        lower_tok = tok.lower()
        if lower_tok in ("formula1", "formula"):  # normalize to F1
            swapped.append("f1")
            # If the pattern is ["formula", "1"], skip the numeric token
            if idx + 1 < len(tokens) and tokens[idx + 1].lower() == "1":
                skip_next = True
        else:
            swapped.append(tok)
    return swapped


def _query_variants(q: str) -> list[str]:
    # Generate a small set of progressively looser queries.
    stopwords = {"grand", "prix", "race", "round", "gp", "etihad", "airways"}
    variants: list[str] = []

    def add_variant(val: str) -> None:
        val = val.strip()
        if val and val not in variants:
            variants.append(val)

    normalized = _normalize_query_text(q)
    add_variant(q)
    add_variant(normalized)

    tokens = normalized.split()
    if tokens:
        filtered = [t for t in tokens if t.lower() not in stopwords]
        if filtered and filtered != tokens:
            add_variant(" ".join(filtered))

        if len(tokens) > 5:
            add_variant(" ".join(tokens[:5]))

        swapped = _swap_formula_tokens(tokens)
        if swapped != tokens:
            add_variant(" ".join(swapped))

    return variants


def _build_event_queries(year: int, round_name: str, round_number: int, event_type: str) -> list[str]:
    venue = round_name
    round_tag = f"Round {round_number}"
    gp_tag = f"{venue} Grand Prix"

    type_lower = event_type.lower()
    variants: list[str] = []
    if type_lower.startswith("fp1") or type_lower in {"practice 1", "practice one"}:
        variants.extend(["FP1", "Practice One", "Practice 1"])
    elif type_lower.startswith("fp2") or type_lower in {"practice 2", "practice two"}:
        variants.extend(["FP2", "Practice Two", "Practice 2"])
    elif type_lower.startswith("fp3") or type_lower in {"practice 3", "practice three"}:
        variants.extend(["FP3", "Practice Three", "Practice 3"])
    elif "qualifying" in type_lower and "sprint" in type_lower:
        variants.extend(["Sprint Qualifying", "Sprint Shootout", "Sprint.Q", "Sprint Quali"])
    elif "sprint" in type_lower:
        variants.extend(["Sprint", "Sprint Race"])
    elif "race" in type_lower:
        variants.extend(["Race", "Grand Prix"])
    elif "qual" in type_lower:
        variants.extend(["Qualifying", "Quali"])
    else:
        variants.append(event_type)

    bases = [
        f"Formula1 {year} {gp_tag}",
        f"Formula 1 {year} {gp_tag}",
        f"F1 {year} {gp_tag}",
        f"Formula1 {year} {round_tag} {venue}",
        f"Formula 1 {year} {round_tag} {venue}",
        f"F1 {year} {round_tag} {venue}",
    ]

    queries: list[str] = []
    for base in bases:
        for variant in variants:
            combined = f"{base} {variant}".strip()
            if combined not in queries:
                queries.append(combined)
    return queries


def _canonical_round_name(name: str) -> str:
    # Drop embedded year tokens and common sponsor noise, collapse whitespace to avoid overly specific queries.
    cleaned = re.sub(r"\b\d{4}\b", "", name)
    cleaned = re.sub(r"\b(airways|crypto\.com|aramco|heineken|pirelli|rolex)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or name


def _is_round_match(title: str, season: Season, round_obj: Round) -> bool:
    norm_title = _normalize_query_text(title).lower()
    year_hit = str(season.year) in norm_title

    # Exclude other series (F3, Academy, etc.).
    if re.search(r"\bf3\b|formula\s*3|academy", norm_title):
        return False

    # Require Formula 1 signals to avoid other series sneaking in.
    if not ("f1" in norm_title or "formula 1" in norm_title or "formula1" in norm_title):
        return False

    # Extract any explicit round numbers in the title.
    round_num_matches = re.findall(r"\b(?:round|rnd|rd|r)\s*(\d{1,2})\b", norm_title)
    round_nums = {int(n) for n in round_num_matches if n.isdigit()}
    has_wrong_round = round_nums and round_obj.round_number not in round_nums
    round_hit = round_obj.round_number in round_nums

    # Location signals from round name/country/circuit, excluding generic words.
    loc_terms: list[str] = []
    canon = _canonical_round_name(round_obj.name).lower()
    stop_terms = {"grand", "prix", "grand prix", "round", "gp", "formula", "f1"}
    if canon:
        parts = canon.split()
        for p in parts:
            if p and p not in stop_terms and len(p) >= 3:
                loc_terms.append(p)
        if len(parts) >= 2:
            tail = " ".join(parts[-2:])
            if tail.lower() not in stop_terms:
                loc_terms.append(tail.lower())
    if round_obj.country:
        loc_terms.append(round_obj.country.lower())
    if round_obj.circuit:
        loc_terms.append(round_obj.circuit.lower())

    loc_terms = [t for t in loc_terms if t and len(t) >= 3 and t not in stop_terms]
    loc_hit = any(term in norm_title for term in loc_terms)

    if not year_hit:
        return False
    if has_wrong_round:
        return False
    # Require location match; only if no location terms exist (unlikely) fall back to explicit matching round number.
    if loc_terms and loc_hit:
        return True
    if not loc_terms and round_hit:
        return True
    return False


_EVENT_TYPE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("full-broadcast", re.compile(r"uncut|full broadcast|full\.broadcast", re.IGNORECASE)),
    ("f1-kids", re.compile(r"f1\s*kids", re.IGNORECASE)),
    ("pre-race-show", re.compile(r"pre[-\s]?race\s+show", re.IGNORECASE)),
    ("post-race-show", re.compile(r"post[-\s]?race\s+show", re.IGNORECASE)),
    ("teds-notebook-sprint", re.compile(r"teds.*sprint.*notebook", re.IGNORECASE)),
    ("teds-notebook-qual", re.compile(r"teds.*qualifying.*notebook", re.IGNORECASE)),
    ("teds-notebook-race", re.compile(r"teds.*notebook", re.IGNORECASE)),
    ("post-sprint-show", re.compile(r"post[-\s]?sprint\s+show", re.IGNORECASE)),
    ("pre-sprint-show", re.compile(r"pre[-\s]?sprint\s+show", re.IGNORECASE)),
    ("sprint-qualifying", re.compile(r"sprint\s*qual(ifying)?|sprint\s*shootout", re.IGNORECASE)),
    ("sprint", re.compile(r"\bsprint( race)?\b", re.IGNORECASE)),
    ("qualifying", re.compile(r"\bqual(?!ity)\w*|\bq\d{1,2}\b", re.IGNORECASE)),
    ("fp3", re.compile(r"fp\s*3|practice three", re.IGNORECASE)),
    ("fp2", re.compile(r"fp\s*2|practice two", re.IGNORECASE)),
    ("fp1", re.compile(r"fp\s*1|practice one", re.IGNORECASE)),
    ("f1-live", re.compile(r"f1[\s.-]*live", re.IGNORECASE)),
    ("f1-show", re.compile(r"f1[\s.-]*show", re.IGNORECASE)),
    ("press-conference-drivers", re.compile(r"drivers?\s+press\s+conference", re.IGNORECASE)),
    ("press-conference-principals", re.compile(r"team principals?\s+press\s+conference", re.IGNORECASE)),
    # Treat "grand prix" as race only when no other session token appears; still catch explicit "race" or "GP".
    (
        "race",
        re.compile(r"\brace\b|(?!(?:.*(fp\s*\d|practice|qual|shootout|sprint)))\bgrand[\s.-]*prix\b|\bgp\b", re.IGNORECASE),
    ),
]

_DEFAULT_EVENT_ALLOWLIST = {"race", "qualifying", "sprint", "sprint-qualifying", "fp1", "fp2", "fp3"}


def _classify_event_type(title: str) -> str | None:
    normalized = _normalize_query_text(title).lower()
    for evt_type, pattern in _EVENT_TYPE_PATTERNS:
        if pattern.search(normalized):
            return evt_type
    return None


def _build_event_allowlist(event_types: list[str] | None) -> set[str]:
    if event_types:
        normalized = {et.strip().lower() for et in event_types if et and et.strip()}
        if normalized:
            return normalized
    return set(_DEFAULT_EVENT_ALLOWLIST)


def _derive_event_allowlist(query: str, event_types: list[str] | None) -> set[str]:
    """Resolve the allowlist from explicit params or by inferring from the query itself."""
    explicit = _build_event_allowlist(event_types)
    inferred = _classify_event_type(query)

    # If the caller explicitly provided event_types, respect them.
    if event_types:
        # But if they passed the full default set, narrow to the inferred type when possible.
        if inferred and explicit == set(_DEFAULT_EVENT_ALLOWLIST):
            return {inferred}
        return explicit

    # No explicit allowlist: infer from the query when possible.
    if inferred:
        return {inferred}
    return explicit


def _search_indexer_with_variants(indexer: Indexer, variants: list[str], limit: int) -> list[SearchResult]:
    results: list[SearchResult] = []
    seen: set[str | tuple[str, str]] = set()

    for variant in variants:
        if len(results) >= limit:
            break
        variant_start = perf_counter()
        batch = search_indexer(indexer, variant, limit=limit)
        logger.debug(
            "Variant search timing",
            indexer=indexer.name,
            variant=variant,
            items=len(batch),
            elapsed_ms=int((perf_counter() - variant_start) * 1000),
        )
        for item in batch:
            key = item.nzb_url or (item.indexer.lower(), item.title.lower())
            if key in seen:
                continue
            seen.add(key)
            results.append(item)
            if len(results) >= limit:
                break

    return results


@router.get("/search", response_model=list[SearchResult])
def search(
    q: str,
    limit: int = 25,
    event_types: list[str] | None = Query(None, description="Allowed event types (e.g. race,qualifying,sprint,sprint-qualifying,fp1)"),
    session: Session = Depends(get_session),
    auth: AuthSession = Depends(require_auth),
) -> list[SearchResult]:
    query = q.strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query is required")

    limit = max(1, min(limit, 50))
    indexers = session.query(Indexer).filter_by(enabled=True).order_by(Indexer.name.asc()).all()
    if not indexers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No enabled indexers")

    variants = _query_variants(query)
    allowlist = _derive_event_allowlist(query, event_types)
    all_results: list[SearchResult] = []
    seen_global: set[str | tuple[str, str]] = set()
    search_start = perf_counter()
    for ix in indexers:
        ix_results = _search_indexer_with_variants(ix, variants, limit)
        for item in ix_results:
            key = item.nzb_url or (item.indexer.lower(), item.title.lower())
            if key in seen_global:
                continue
            event_type = _classify_event_type(item.title) or "other"
            item.event_type = event_type
            if allowlist and event_type not in allowlist:
                continue
            seen_global.add(key)
            all_results.append(item)

    # Basic sort: newest first (age_days ascending), then size desc
    all_results.sort(key=lambda r: (r.age_days, -r.size_mb))
    type_counts = Counter(r.event_type or "unknown" for r in all_results)
    elapsed_ms = int((perf_counter() - search_start) * 1000)
    log_response(
        "search",
        count=len(all_results),
        query=query,
        allowed=list(allowlist),
        variants=len(variants),
        indexers=len(indexers),
        type_counts=dict(type_counts),
        elapsed_ms=elapsed_ms,
    )
    return all_results


def _search_round_events(
    season: Season,
    round_obj: Round,
    indexers: list[Indexer],
    limit_per_query: int = 50,
) -> list[SearchResult]:
    results: list[SearchResult] = []
    seen: set[str | tuple[str, str]] = set()
    now = datetime.utcnow()

    past_events = [e for e in round_obj.events or [] if not e.start_time_utc or e.start_time_utc <= now]
    if not past_events:
        return []

    # Map classified schedule types to their labels so we can tag results after lean round-level queries.
    schedule_labels: dict[str, str] = {}
    for ev in past_events:
        classified = _classify_event_type(ev.type) or ev.type.lower()
        if classified not in schedule_labels:
            schedule_labels[classified] = ev.type

    clean_name = _canonical_round_name(round_obj.name)
    tokens = clean_name.split()
    short_tail = " ".join(tokens[-2:]) if len(tokens) >= 2 else clean_name

    base_names = []
    if "grand prix" in clean_name.lower():
        base_names.append(clean_name)
    else:
        base_names.append(f"{clean_name} Grand Prix")
    base_names.append(f"Round {round_obj.round_number} {clean_name}")
    base_names.append(clean_name)
    if short_tail not in base_names:
        base_names.append(short_tail)

    queries: list[str] = []
    for prefix in ("F1", "Formula 1"):
        for bn in base_names:
            q = f"{prefix} {season.year} {bn}".strip()
            if q not in queries:
                queries.append(q)

    for ix in indexers:
        for q in queries:
            batch = search_indexer(ix, q, limit=limit_per_query)
            for item in batch:
                evt_type = _classify_event_type(item.title) or "other"
                item.event_type = evt_type
                label = schedule_labels.get(evt_type)
                if not label:
                    label = "Other"
                item.event_label = label
                if not _is_round_match(item.title, season, round_obj):
                    continue
                key = item.nzb_url or (item.indexer.lower(), item.title.lower())
                if key in seen:
                    continue
                seen.add(key)
                results.append(item)
    # Sort newest first like /search
    results.sort(key=lambda r: (r.age_days, -r.size_mb))
    return results


def _serialize_results(items: list[SearchResult]) -> str:
    def _to_dict(item: SearchResult) -> dict:
        data = item.model_dump()
        return data

    return json.dumps([_to_dict(i) for i in items])


@router.get("/rounds/{round_id}/search", response_model=CachedSearchResponse)
def search_round(
    round_id: int,
    force: bool = Query(False, description="Force refresh instead of using cached results"),
    session: Session = Depends(get_session),
    auth: AuthSession = Depends(require_auth),
) -> CachedSearchResponse:
    round_obj: Round | None = session.query(Round).options(selectinload(Round.events), selectinload(Round.season)).filter_by(id=round_id).first()
    if not round_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if not round_obj.season:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round missing season context")

    ttl = timedelta(hours=24)
    cache: CachedSearch | None = session.query(CachedSearch).filter_by(round_id=round_id).first()
    now = datetime.utcnow()
    if cache and not force and cache.cached_at and now - cache.cached_at <= ttl:
        try:
            payload = json.loads(cache.results_json)
            results = [SearchResult(**item) for item in payload]
        except Exception:
            results = []
        log_response("search_round_cache_hit", round_id=round_id, count=len(results))
        return CachedSearchResponse(results=results, from_cache=True, cached_at=cache.cached_at, ttl_hours=24)

    indexers = session.query(Indexer).filter_by(enabled=True).order_by(Indexer.name.asc()).all()
    if not indexers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No enabled indexers")

    results = _search_round_events(round_obj.season, round_obj, indexers, limit_per_query=50)

    # Upsert cache row
    serialized = _serialize_results(results)
    if cache:
        cache.results_json = serialized
        cache.cached_at = now
    else:
        cache = CachedSearch(round_id=round_id, cached_at=now, results_json=serialized)
        session.add(cache)
    session.commit()

    log_response(
        "search_round_refreshed",
        round_id=round_id,
        count=len(results),
        events=len(round_obj.events or []),
        indexers=len(indexers),
    )
    return CachedSearchResponse(results=results, from_cache=False, cached_at=cache.cached_at, ttl_hours=24)


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
    if "api_key" in payload.__fields_set__:
        item.api_key = payload.api_key
    if "category" in payload.__fields_set__:
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
    if "api_key" in payload.__fields_set__:
        item.api_key = payload.api_key
    if "category" in payload.__fields_set__:
        item.category = payload.category
    if "priority" in payload.__fields_set__:
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
