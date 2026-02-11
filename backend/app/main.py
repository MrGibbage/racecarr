from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from .core.config import get_settings
from .core.logging_config import configure_logging
from .core.database import Base, engine, SessionLocal
from .api.routes import router as api_router
from .services.auth import ensure_auth_row


def _ensure_downloader_priority_column() -> None:
    inspector = inspect(engine)
    if "downloader" not in inspector.get_table_names():
        return
    cols = {col["name"] for col in inspector.get_columns("downloader")}
    if "priority" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE downloader ADD COLUMN priority INTEGER"))


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    _ensure_downloader_priority_column()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        ensure_auth_row(session)

    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ],
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)

    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
