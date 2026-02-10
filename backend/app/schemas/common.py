from datetime import datetime
from pydantic import BaseModel


class SeasonOut(BaseModel):
    id: int
    year: int
    last_refreshed: datetime | None = None

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
