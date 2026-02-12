from datetime import datetime
from pydantic import BaseModel, Field


class SeasonOut(BaseModel):
    id: int
    year: int
    last_refreshed: datetime | None = None

    class Config:
        from_attributes = True


class EventOut(BaseModel):
    id: int | None = None
    type: str
    start_time_utc: datetime | None = None
    end_time_utc: datetime | None = None

    class Config:
        from_attributes = True


class RoundOut(BaseModel):
    id: int | None = None
    round_number: int
    name: str
    circuit: str | None = None
    country: str | None = None
    events: list[EventOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SeasonDetail(BaseModel):
    id: int
    year: int
    last_refreshed: datetime | None = None
    rounds: list[RoundOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class HealthStatus(BaseModel):
    status: str
    detail: str | None = None


class SearchResult(BaseModel):
    title: str
    indexer: str
    size_mb: float
    age_days: int
    seeders: int
    leechers: int
    quality: str
    nzb_url: str | None = None
    event_type: str | None = None
    event_label: str | None = None


class LogEntry(BaseModel):
    timestamp: str
    level: str
    message: str


class CachedSearchResponse(BaseModel):
    results: list[SearchResult]
    from_cache: bool
    cached_at: datetime | None = None
    ttl_hours: int = 24


class IndexerBase(BaseModel):
    name: str
    api_url: str
    api_key: str | None = None
    category: str | None = None
    enabled: bool = True


class IndexerCreate(IndexerBase):
    pass


class IndexerUpdate(BaseModel):
    name: str | None = None
    api_url: str | None = None
    api_key: str | None = None
    category: str | None = None
    enabled: bool | None = None


class IndexerOut(IndexerBase):
    id: int

    class Config:
        from_attributes = True


class IndexerTestResult(BaseModel):
    ok: bool
    message: str


class DownloaderBase(BaseModel):
    name: str
    type: str
    api_url: str
    api_key: str | None = None
    category: str | None = None
    priority: int | None = None
    enabled: bool = True


class DownloaderCreate(DownloaderBase):
    pass


class DownloaderUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    api_url: str | None = None
    api_key: str | None = None
    category: str | None = None
    priority: int | None = None
    enabled: bool | None = None


class DownloaderOut(DownloaderBase):
    id: int

    class Config:
        from_attributes = True


class DownloaderTestResult(BaseModel):
    ok: bool
    message: str


class DownloaderSendRequest(BaseModel):
    nzb_url: str
    title: str | None = None
    category: str | None = None
    priority: int | None = None


class DownloaderSendResult(BaseModel):
    ok: bool
    message: str


class AuthLoginRequest(BaseModel):
    password: str
    remember_me: bool = False


class AuthLoginResponse(BaseModel):
    ok: bool
    message: str


class AuthMeResponse(BaseModel):
    authenticated: bool
    expires_at: datetime | None = None
    idle_timeout_minutes: int | None = None


class AuthChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class LogLevelRequest(BaseModel):
    log_level: str


class LogLevelResponse(BaseModel):
    log_level: str


class DependencyVersion(BaseModel):
    name: str
    version: str


class AboutResponse(BaseModel):
    app_name: str
    app_version: str
    python_version: str
    backend_dependencies: list[DependencyVersion] = Field(default_factory=list)
    frontend_dependencies: list[DependencyVersion] = Field(default_factory=list)
    github_url: str | None = None
    git_sha: str | None = None
    server_started_at: str | None = None
