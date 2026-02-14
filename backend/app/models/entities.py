from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from ..core.database import Base


class Season(Base):
    __tablename__ = "season"
    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, unique=True, nullable=False, index=True)
    last_refreshed = Column(DateTime, nullable=True)
    rounds = relationship("Round", back_populates="season", cascade="all, delete-orphan")


class Round(Base):
    __tablename__ = "round"
    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("season.id"), nullable=False)
    round_number = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    circuit = Column(String, nullable=True)
    country = Column(String, nullable=True)
    season = relationship("Season", back_populates="rounds")
    events = relationship("Event", back_populates="round", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "event"
    id = Column(Integer, primary_key=True, index=True)
    round_id = Column(Integer, ForeignKey("round.id"), nullable=False)
    type = Column(String, nullable=False)
    start_time_utc = Column(DateTime, nullable=True)
    end_time_utc = Column(DateTime, nullable=True)
    round = relationship("Round", back_populates="events")


class Indexer(Base):
    __tablename__ = "indexer"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    api_url = Column(String, nullable=False)
    api_key = Column(String, nullable=True)
    category = Column(String, nullable=True)
    enabled = Column(Boolean, default=True)


class Downloader(Base):
    __tablename__ = "downloader"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    api_url = Column(String, nullable=False)
    api_key = Column(String, nullable=True)
    category = Column(String, nullable=True)
    enabled = Column(Boolean, default=True)
    priority = Column(Integer, nullable=True)


class AuthConfig(Base):
    __tablename__ = "auth_config"
    id = Column(Integer, primary_key=True)
    password_hash = Column(String, nullable=False)
    updated_at = Column(DateTime, nullable=True)


class AppConfig(Base):
    __tablename__ = "app_config"
    id = Column(Integer, primary_key=True)
    log_level = Column(String, nullable=False)
    min_resolution = Column(Integer, nullable=True)
    max_resolution = Column(Integer, nullable=True)
    allow_hdr = Column(Boolean, nullable=True)
    preferred_codecs = Column(String, nullable=True)
    preferred_groups = Column(String, nullable=True)
    auto_download_threshold = Column(Integer, nullable=True)
    default_downloader_id = Column(Integer, nullable=True)
    event_allowlist = Column(String, nullable=True)


class CachedSearch(Base):
    __tablename__ = "cached_search"
    id = Column(Integer, primary_key=True)
    round_id = Column(Integer, ForeignKey("round.id"), nullable=False, index=True)
    cached_at = Column(DateTime, nullable=False)
    results_json = Column(Text, nullable=False)


class ScheduledSearch(Base):
    __tablename__ = "scheduled_search"
    __table_args__ = (
        UniqueConstraint("round_id", "event_type", name="uq_scheduled_round_event"),
    )

    id = Column(Integer, primary_key=True, index=True)
    round_id = Column(Integer, ForeignKey("round.id"), nullable=False)
    event_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    added_at = Column(DateTime, nullable=False)
    last_searched_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    last_error = Column(String, nullable=True)
    tag = Column(String, nullable=True)
    nzb_title = Column(String, nullable=True)
    nzb_url = Column(String, nullable=True)
    downloader_id = Column(Integer, ForeignKey("downloader.id"), nullable=True)
    event_start_utc = Column(DateTime, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    min_resolution = Column(Integer, nullable=True)
    max_resolution = Column(Integer, nullable=True)
    allow_hdr = Column(Boolean, nullable=True)
    auto_download_threshold = Column(Integer, nullable=True)
