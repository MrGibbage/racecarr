# Racecarr

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
npm run dev -- --host --port 5173
```

Backend listens on 8000 in dev. Frontend dev server runs on 5173 and calls the API at `/api`.

## API
- `GET /api/healthz`
- `GET /api/readyz`
- `GET /api/seasons`
 - `POST/GET /api/demo-seasons`
 - `GET /api/search-demo`
 - `GET /api/logs`

## Frontend
Vite + React + Mantine. Pages: Dashboard, Search, Settings, Logs. Proxy to backend on `/api` during `npm run dev`.

## Docker

```sh
docker compose up --build
```

Container listens on 8080. Frontend is served at `/`, API at `/api/*`.

## Notes
- Static frontend is bundled into the backend image under `backend/app/static` and served by FastAPI in Docker.
- SQLite database at `/config/data.db` by default (config volume is mapped in compose).
