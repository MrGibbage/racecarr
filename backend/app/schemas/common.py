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


class LogEntry(BaseModel):
    timestamp: str
    level: str
    message: str


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
