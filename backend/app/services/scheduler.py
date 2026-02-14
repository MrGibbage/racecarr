from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Iterable, Optional
from loguru import logger
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.entities import ScheduledSearch, Round, Downloader, Indexer
from ..schemas.common import ScheduledSearchCreate
from ..services.app_config import get_search_settings, DEFAULT_AUTO_DOWNLOAD_THRESHOLD
from ..services.downloader_client import send_to_downloader, list_history
from ..api.routes import _search_round_events, _apply_scoring


STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_WAITING = "waiting-download"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
STATUS_PAUSED = "paused"


class SchedulerService:
    def __init__(self, tick_seconds: int = 600, poll_seconds: int = 600) -> None:
        self._tick_seconds = max(60, tick_seconds)
        self._poll_seconds = max(60, poll_seconds)
        self._task: asyncio.Task | None = None
        self._poll_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="scheduler-tick")
        self._poll_task = asyncio.create_task(self._poll_loop(), name="scheduler-poll")
        logger.info("Scheduler service started")

    async def stop(self) -> None:
        self._running = False
        for task in (self._task, self._poll_task):
            if task:
                task.cancel()
        for task in (self._task, self._poll_task):
            if task:
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        logger.info("Scheduler service stopped")

    async def _run_loop(self) -> None:
        while self._running:
            try:
                await self.run_due()
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Scheduler tick failed", error=str(exc))
            await asyncio.sleep(self._tick_seconds)

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self.poll_downloads()
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Scheduler poll failed", error=str(exc))
            await asyncio.sleep(self._poll_seconds)

    async def run_due(self) -> None:
        now = datetime.utcnow()
        with SessionLocal() as session:
            due_items = (
                session.query(ScheduledSearch)
                .filter(ScheduledSearch.status.in_([STATUS_PENDING, STATUS_FAILED]))
                .filter((ScheduledSearch.next_run_at.is_(None)) | (ScheduledSearch.next_run_at <= now))
                .all()
            )
            for item in due_items:
                await self._run_single(session, item, now)
            session.commit()

    async def poll_downloads(self) -> None:
        now = datetime.utcnow()
        with SessionLocal() as session:
            waiting_items = session.query(ScheduledSearch).filter_by(status=STATUS_WAITING).all()
            if not waiting_items:
                return

            downloader_cache: dict[int, Downloader | None] = {}
            for item in waiting_items:
                downloader_id = item.downloader_id
                if not downloader_id:
                    item.status = STATUS_FAILED
                    item.last_error = "Missing downloader"
                    item.next_run_at = self._compute_next_run(item.event_start_utc, now)
                    continue

                downloader = downloader_cache.get(downloader_id)
                if downloader is None:
                    downloader = session.query(Downloader).filter_by(id=downloader_id, enabled=True).first()
                    downloader_cache[downloader_id] = downloader
                if not downloader:
                    item.status = STATUS_FAILED
                    item.last_error = "Downloader not available"
                    item.next_run_at = self._compute_next_run(item.event_start_utc, now)
                    continue

                tag = self._ensure_tag(item)
                history = list_history(downloader, limit=80)
                match = next((row for row in history if tag.lower() in (row.get("name") or "").lower()), None)
                if not match:
                    continue

                status = (match.get("status") or "").lower()
                if status in {"completed", "success", "ok"}:
                    item.status = STATUS_COMPLETED
                    item.last_error = None
                    item.next_run_at = None
                elif status in {"failed", "failure", "error"}:
                    item.status = STATUS_FAILED
                    item.last_error = "Downloader reported failure"
                    item.next_run_at = self._compute_next_run(item.event_start_utc, now)

            session.commit()

    def _event_start_time(self, round_obj: Round, event_type: str) -> Optional[datetime]:
        target = event_type.lower()
        for ev in round_obj.events or []:
            if (ev.type or "").lower() == target:
                return ev.start_time_utc
        return None

    def _compute_next_run(self, event_start: Optional[datetime], now: datetime) -> datetime:
        if event_start is None:
            return now + timedelta(hours=6)
        anchor = event_start + timedelta(minutes=30)
        if now < anchor:
            return anchor
        elapsed = now - event_start
        if elapsed <= timedelta(hours=48):
            return now + timedelta(minutes=10)
        if elapsed <= timedelta(hours=168):
            return now + timedelta(hours=6)
        return now + timedelta(hours=24)

    def _ensure_tag(self, item: ScheduledSearch) -> str:
        if item.tag:
            return item.tag
        tag = f"rc-{item.round_id}-{item.event_type.lower()}"
        item.tag = tag
        return tag

    def _pick_best(self, results: list, threshold: int) -> Optional:
        best = None
        for r in results:
            if r.score is None or r.score < threshold:
                continue
            if best is None or (r.score or 0) > (best.score or 0):
                best = r
        return best

    async def _run_single(self, session: Session, item: ScheduledSearch, now: datetime) -> None:
        round_obj: Round | None = (
            session.query(Round)
            .filter_by(id=item.round_id)
            .first()
        )
        if not round_obj:
            item.status = STATUS_FAILED
            item.last_error = "Round not found"
            item.next_run_at = None
            return

        event_start = item.event_start_utc or self._event_start_time(round_obj, item.event_type)
        item.event_start_utc = event_start
        next_due = self._compute_next_run(event_start, now)
        if event_start and now < event_start + timedelta(minutes=30):
            item.status = STATUS_PENDING
            item.next_run_at = next_due
            item.last_error = None
            return

        cfg = get_search_settings(session)
        allowlist = set(cfg.event_allowlist or [])
        if allowlist and item.event_type.lower() not in allowlist:
            item.status = STATUS_PENDING
            item.next_run_at = next_due
            item.last_error = "Event type disallowed"
            return

        indexers: Iterable[Indexer] = (
            session.query(Indexer)
            .filter_by(enabled=True)
            .order_by(Indexer.name.asc())
            .all()
        )
        if not indexers:
            item.status = STATUS_FAILED
            item.last_error = "No enabled indexers"
            item.next_run_at = next_due
            return

        item.status = STATUS_RUNNING
        item.last_searched_at = now
        item.attempts = (item.attempts or 0) + 1
        results = _search_round_events(round_obj.season, round_obj, list(indexers), {item.event_type.lower()}, limit_per_query=50)
        if not results:
            item.status = STATUS_PENDING
            item.last_error = "No results"
            item.next_run_at = next_due
            return

        _apply_scoring(results, cfg)
        threshold = cfg.auto_download_threshold or DEFAULT_AUTO_DOWNLOAD_THRESHOLD
        best = self._pick_best(results, threshold)
        if not best or not best.nzb_url:
            item.status = STATUS_PENDING
            item.last_error = "No result above threshold"
            item.next_run_at = next_due
            return

        downloader: Downloader | None = None
        if item.downloader_id:
            downloader = session.query(Downloader).filter_by(id=item.downloader_id, enabled=True).first()
        if not downloader:
            downloader = session.query(Downloader).filter_by(enabled=True).order_by(Downloader.id.asc()).first()
        if not downloader:
            item.status = STATUS_FAILED
            item.last_error = "No enabled downloaders"
            item.next_run_at = next_due
            return

        tag = self._ensure_tag(item)
        title_with_tag = f"{best.title} [{tag}]"
        ok, message = send_to_downloader(
            downloader,
            nzb_url=best.nzb_url,
            title=title_with_tag,
            category=downloader.category,
            priority=downloader.priority,
        )
        if ok:
            item.status = STATUS_WAITING
            item.nzb_title = best.title
            item.nzb_url = best.nzb_url
            item.downloader_id = downloader.id
            item.last_error = None
            item.next_run_at = now + timedelta(hours=6)  # safety retry window while waiting
        else:
            item.status = STATUS_PENDING
            item.last_error = message
            item.next_run_at = next_due

    def list_searches(self, session: Session) -> list[ScheduledSearch]:
        return (
            session.query(ScheduledSearch)
            .order_by(ScheduledSearch.next_run_at.asc().nullsfirst(), ScheduledSearch.added_at.asc())
            .all()
        )

    def create_search(self, session: Session, payload: ScheduledSearchCreate) -> ScheduledSearch:
        existing = (
            session.query(ScheduledSearch)
            .filter_by(round_id=payload.round_id, event_type=payload.event_type.lower())
            .first()
        )
        if existing:
            return existing
        round_obj: Round | None = session.query(Round).filter_by(id=payload.round_id).first()
        event_start = None
        if round_obj:
            for ev in round_obj.events or []:
                if (ev.type or "").lower() == payload.event_type.lower():
                    event_start = ev.start_time_utc
                    break
        now = datetime.utcnow()
        next_run = self._compute_next_run(event_start, now)
        item = ScheduledSearch(
            round_id=payload.round_id,
            event_type=payload.event_type.lower(),
            status=STATUS_PENDING,
            added_at=now,
            next_run_at=next_run,
            downloader_id=payload.downloader_id,
            event_start_utc=event_start,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item

    def update_search(self, session: Session, search_id: int, *, downloader_id: int | None = None, status: str | None = None) -> ScheduledSearch | None:
        item: ScheduledSearch | None = session.query(ScheduledSearch).filter_by(id=search_id).first()
        if not item:
            return None

        now = datetime.utcnow()

        if downloader_id is not None:
            item.downloader_id = downloader_id

        if status:
            normalized = status.lower()
            if normalized not in {STATUS_PENDING, STATUS_PAUSED}:
                raise ValueError("Invalid status")
            item.status = normalized
            item.last_error = None
            if normalized == STATUS_PAUSED:
                item.next_run_at = None
            else:
                next_due = self._compute_next_run(item.event_start_utc, now)
                item.next_run_at = next_due

        session.commit()
        session.refresh(item)
        return item

    def delete_search(self, session: Session, search_id: int) -> bool:
        item: ScheduledSearch | None = session.query(ScheduledSearch).filter_by(id=search_id).first()
        if not item:
            return False
        session.delete(item)
        session.commit()
        return True

    async def run_now(self, search_id: int) -> None:
        now = datetime.utcnow()
        with SessionLocal() as session:
            item: ScheduledSearch | None = session.query(ScheduledSearch).filter_by(id=search_id).first()
            if not item:
                return
            await self._run_single(session, item, now)
            session.commit()
