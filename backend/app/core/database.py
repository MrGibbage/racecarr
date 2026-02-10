from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from .config import get_settings

settings = get_settings()
settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(
    f"sqlite:///{settings.sqlite_path}", connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


@contextmanager
def session_scope() -> Session:
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Session:
    with session_scope() as session:
        yield session
