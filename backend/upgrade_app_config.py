from sqlalchemy import create_engine, text, inspect
from app.core.config import get_settings


def ensure_columns():
    db = str(get_settings().sqlite_path)
    eng = create_engine(f"sqlite:///{db}")
    insp = inspect(eng)
    existing = {c.get("name") for c in insp.get_columns("app_config")}
    needed = [
        ("min_resolution", "INTEGER"),
        ("max_resolution", "INTEGER"),
        ("allow_hdr", "BOOLEAN"),
        ("preferred_codecs", "VARCHAR"),
        ("preferred_groups", "VARCHAR"),
        ("auto_download_threshold", "INTEGER"),
        ("default_downloader_id", "INTEGER"),
        ("event_allowlist", "VARCHAR"),
    ]
    added = []
    with eng.begin() as conn:
        for col, typ in needed:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE app_config ADD COLUMN {col} {typ}"))
                added.append(col)
    print("DB:", db)
    print("Added:", added)
    print("Columns now:", [c.get("name") for c in inspect(eng).get_columns("app_config")])


if __name__ == "__main__":
    ensure_columns()
