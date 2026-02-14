# Racecarr

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Python](https://img.shields.io/badge/python-3.12+-blue)
![Frontend](https://img.shields.io/badge/frontend-Vite%2FReact%2FMantine-00b894)

Skeleton implementation of the Racecarr app per the design doc.

## Quick start (dev)

```sh
# backend
cd backend
uv sync --python "C:\Python312\python.exe"
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# frontend (separate terminal)
Frontend
Vite + React + Mantine. Pages: Dashboard, Manual Search, Scheduler, Settings, Logs. Proxy to backend on `/api` during `npm run dev`.

Dashboard:
- Add or refresh a season by year.
- Hide seasons (soft delete) to remove them from the dashboard, dropdowns, and scheduler; restore hidden seasons from the Hidden panel.
- Hard delete a season (and its rounds/events/watchlist entries) from the Hidden panel.
- Expand/collapse seasons and rounds; expansion state persists in localStorage.
- Run “Search all events” for a round; cached 24h, with Reload to bypass.

Manual Search:
- Enter a title with optional limit, allowlist toggle, and raw/bypass allowlist toggle; shows event labels when available.

Scheduler page:
- Lists scheduled searches with status badges, periodicity, downloader selection, and actions (run now/delete) with busy-state disabling.
- Polls every 15s for live updates.
- Quick-add lets you enqueue all future events of a type for a season; respects duplicates.
- Demo button (when `VITE_ALLOW_DEMO_SEED=true`) seeds a fake season and scheduled searches via `/api/demo/seed-scheduler`.
- Each watch entry supports pause/resume and per-entry overrides for downloader, resolution range, HDR allowance, and score threshold.
 - Hidden seasons’ watch entries are paused and excluded from listings; restoring the season resumes scheduling.

Search & auto-download
- Event filter buttons show the big seven plus Other; All shows everything for the round.
- “Auto download best” respects the current filter: All sends the top-scoring item per event, a specific event sends only that event, and Other disables the button. Threshold/default downloader come from Settings → Search & Quality.
## Authentication
- Single-user password; default is seeded to `admin` on first start. Update it in Settings → Security.
- Session cookie `rc_session` is httpOnly with remember-me and idle timeout refresh; login at `/login`.
- Logout is available from Settings → Security (clears the cookie and returns to the login screen).

## API
- `GET /api/healthz`
- `GET /api/readyz`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/password`
- `GET/POST /api/settings/log-level`
- `GET /api/settings/about`
- `GET /api/seasons`
- `POST/GET /api/demo-seasons`
- `POST /api/seasons/{year}/refresh`
- `POST /api/seasons/{year}/hide` (soft delete)
- `POST /api/seasons/{year}/restore`
- `DELETE /api/seasons/{year}` (hard delete; removes rounds/events/watchlist/cached searches)
 - `GET /api/search-demo`
 - `POST /api/demo/seed-scheduler`
 - `GET /api/logs`
 - `GET/POST /api/indexers`
 - `PUT/DELETE /api/indexers/{id}`
 - `POST /api/indexers/{id}/test`
 - `GET/POST /api/scheduler/searches`
	- `PATCH /api/scheduler/searches/{id}` (downloader/status/quality overrides)
 - `DELETE /api/scheduler/searches/{id}`
 - `POST /api/scheduler/searches/{id}/run`

## Frontend
Vite + React + Mantine. Pages: Dashboard, Search, Scheduler, Settings, Logs. Proxy to backend on `/api` during `npm run dev`.

Scheduler page:
- Lists scheduled searches with status badges, periodicity, downloader selection, and actions (run now/delete) with busy-state disabling.
- Polls every 15s for live updates.
- Quick-add lets you enqueue all future events of a type for a season; respects duplicates.
- Demo button (when `VITE_ALLOW_DEMO_SEED=true`) seeds a fake season and scheduled searches via `/api/demo/seed-scheduler`.

## Search & auto-download
- Round search (Dashboard → “Search all events”) caches results for 24h; use Reload to bypass the cache.
- Event filter buttons show the big seven plus Other; All shows everything for the round.
- “Auto download best” respects the current filter: All sends the top-scoring item per event, a specific event sends only that event, and Other disables the button. Threshold/default downloader come from Settings → Search & Quality.

## Docker

```sh
docker compose up --build
```

Container listens on 8080. Frontend is served at `/`, API at `/api/*`.

## Notes
- Static frontend is bundled into the backend image under `backend/app/static` and served by FastAPI in Docker.
- Frontend package manifest is also baked into the image so the About page can display frontend dependency versions.
- SQLite database at `/config/data.db` by default (config volume is mapped in compose).
- Scheduler runs in-process on the backend; tick/poll interval defaults to 10 minutes (configurable via `SCHEDULER_TICK_SECONDS`).
