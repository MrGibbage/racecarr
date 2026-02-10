# Racecarr

Skeleton implementation of the Racecarr app per the design doc.

## Quick start (dev)

```sh
make dev
```

This builds the frontend, starts FastAPI with hot reload, and mounts `/config` locally.

## API
- `GET /api/healthz`
- `GET /api/readyz`
- `GET /api/seasons`

## Frontend
Vite + React + Mantine. Pages: Dashboard, Search, Settings, Logs. Proxy to backend on `/api` during `npm run dev`.

## Notes
- Static frontend is served by FastAPI when built (`frontend/dist`).
- SQLite database at `/config/data.db` by default.
