# Racecarr Developer Guide

## Local development
- Prereqs: Python 3.12, Node 20+, Docker Desktop (optional for end-to-end), uv (packaging).
- Backend: `cd backend && uv sync --python "C:\\Python312\\python.exe" && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` (hot reload; stop with Ctrl+C).
- Frontend: `cd frontend && npm install` (first run), then `npm run dev -- --host --port 5173` (reads `VITE_API_URL`, else `http://localhost:8000/api`).
- Demo data: `POST /api/demo-seasons` seeds 2024–2026; the Dashboard/Search pages then have data to explore.
- Docker (full stack): from repo root `docker compose up --build` (serves UI at `http://localhost:8080`, API at `/api`). Re-run `docker compose build` after backend/frontend changes.
- Auth: single-user login; default password is `admin`. Change it in Settings → Security. Session cookie `rc_session` is httpOnly with remember-me + idle timeout refresh.

## Docker runbook

Here’s a concise Docker runbook you can follow now, plus prep for publishing an image later.

**Local run (from source)**
- Ensure Docker (Desktop or Engine + Compose plugin) is installed and running; verify with `docker compose version`.
- Create a config dir for persistent DB/logs: `mkdir -p config`.
- Build and start: `docker compose up --build` (add `-d` to run detached).
- App lives at http://localhost:8080 (API at `/api`). Default creds: admin/admin (change in Settings → Security).
- Stop: `docker compose down`. To clean containers/images: `docker compose down --rmi local --volumes`.

**Tweaks**
- Change port: edit `ports` to `"9090:8080"` (host:container).
- Change data location: adjust the `./config:/config` volume mapping.

**Keeping the image fresh**
- Rebuild after backend/frontend changes: `docker compose build` (or `docker compose up --build`).
- If you prefer caching speedups, add a multi-stage build and ensure frontend assets are built during the image build.

**When you publish an image**
- Add `image: your-dockerhub-username/racecarr:latest` under `services.app` in `docker-compose.yml`.
- Build and tag locally: `docker build -t your-dockerhub-username/racecarr:latest .`
- Push: `docker push your-dockerhub-username/racecarr:latest`
- Users can then run without cloning: `docker run -p 8080:8080 -v $(pwd)/config:/config your-dockerhub-username/racecarr:latest`

## Project layout
- backend/: FastAPI app, scheduler, downloader/indexer integrations, notifications, static bundle for Docker.
- frontend/: Vite + React + Mantine UI (Dashboard, Manual Search, Scheduler, Settings, Logs).
- docker-compose.yml: local container orchestration (backend serves bundled frontend).
- testing.md: manual test checklist (no automated tests yet; pytest reports 0 collected).

## API reference (auth required unless noted)
- Health: `GET /api/healthz` (no auth), `GET /api/readyz` (no auth)
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`
- Settings: `GET/POST /api/settings/log-level`, `GET /api/settings/about`, `GET/POST /api/settings/search`
- Notifications: `GET/POST/DELETE /api/notifications/targets`, `POST /api/notifications/test`
- Seasons: `GET /api/seasons`, `POST/GET /api/demo-seasons`, `POST /api/seasons/{year}/refresh`, `POST /api/seasons/{year}/hide`, `POST /api/seasons/{year}/restore`, `DELETE /api/seasons/{year}`
- Search: `GET /api/search`, `GET /api/search-demo`, `GET /api/rounds/{round_id}/search` (24h cache; `force` to refresh), `POST /api/rounds/{round_id}/autograb` (auto-download best)
- Indexers: `GET/POST /api/indexers`, `PUT/DELETE /api/indexers/{id}`, `POST /api/indexers/{id}/test`
- Downloaders: `GET/POST /api/downloaders`, `PUT/DELETE /api/downloaders/{id}`, `POST /api/downloaders/{id}/test`, `POST /api/downloaders/{id}/send`
- Scheduler: `GET/POST /api/scheduler/searches`, `PATCH /api/scheduler/searches/{id}`, `DELETE /api/scheduler/searches/{id}`, `POST /api/scheduler/searches/{id}/run`
- Logs: `GET /api/logs`
- Demo helpers: `GET /api/search-demo`, `POST /api/demo/seed-scheduler`

## Notifications & downloads
- Notification targets (Apprise/webhook) can be filtered by event; defaults include download-start, download-complete, and download-fail. `/api/notifications/test` bypasses filtering to verify connectivity.
- Downloader sends (manual and auto) are tagged so polling can emit completion/fail events.

## Frontend notes
- Dashboard: manage seasons, search rounds (cached 24h with Reload), trigger auto-download best per round.
- Manual Search: freeform query with limit selector, allowlist toggle, raw bypass, and send-to-downloader action.
- Scheduler: list/create searches, pause/resume, edit downloader/quality/threshold; polling every 15s; optional demo seed when `VITE_ALLOW_DEMO_SEED=true`.

## Storage & config
- SQLite DB at `/config/data.db` by default; volume mapped in docker-compose.
- Scheduler tick interval defaults to 10 minutes (`SCHEDULER_TICK_SECONDS`).
- Static frontend bundle is served by FastAPI in Docker; package manifest is embedded for the About page.
