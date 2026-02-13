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
 - `GET /api/logs`
 - `GET/POST /api/indexers`
 - `PUT/DELETE /api/indexers/{id}`
 - `POST /api/indexers/{id}/test`

## Frontend
Vite + React + Mantine. Pages: Dashboard, Search, Settings, Logs. Proxy to backend on `/api` during `npm run dev`.

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
