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
cd frontend
npm install
npm run dev
# (add --host if you need LAN access; --port 5173 if you want to pin the port)
```

Backend listens on 8000 in dev. Frontend dev server runs on 5173; API base resolves to `VITE_API_URL` when set, otherwise falls back to `http://localhost:8000/api`.

### Dev/demo toggles
- `ALLOW_DEMO_SEED=true` (backend env) exposes `/api/demo/seed-scheduler` to insert a demo season/round with nearby events and sample scheduled searches.
- `VITE_ALLOW_DEMO_SEED=true` (frontend env) shows a "Create demo events" button on the Scheduler page that calls the endpoint above.
Restart backend/frontend after changing these flags.

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
 - `GET /api/search-demo`
 - `POST /api/demo/seed-scheduler`
 - `GET /api/logs`
 - `GET/POST /api/indexers`
 - `PUT/DELETE /api/indexers/{id}`
 - `POST /api/indexers/{id}/test`
 - `GET/POST /api/scheduler/searches`
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
