import sys
from pathlib import Path
from loguru import logger
from .config import get_settings


def configure_logging(level: str | None = None) -> None:
    settings = get_settings()
    settings.log_path.parent.mkdir(parents=True, exist_ok=True)
    log_level = (level or settings.log_level).upper()
    logger.remove()
    logger.add(
        sys.stdout,
        level=log_level,
        serialize=True,
        backtrace=False,
        diagnose=False,
        enqueue=True,
    )
    logger.add(
        settings.log_path,
        level=log_level,
        serialize=True,
        backtrace=False,
        diagnose=False,
        enqueue=True,
        rotation="10 MB",
        retention="14 days",
    )


def log_response(message: str, **fields) -> None:
    logger.bind(**fields).info(message)


def log_error(message: str, **fields) -> None:
    logger.bind(**fields).error(message)
