from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
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


class CachedSearch(Base):
    __tablename__ = "cached_search"
    id = Column(Integer, primary_key=True)
    round_id = Column(Integer, ForeignKey("round.id"), nullable=False, index=True)
    cached_at = Column(DateTime, nullable=False)
    results_json = Column(Text, nullable=False)
