# Racecarr

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Python](https://img.shields.io/badge/python-3.12+-blue)
![Frontend](https://img.shields.io/badge/frontend-Vite%2FReact%2FMantine-00b894)

Racecarr is a small FastAPI + React app that searches F1 events across indexers and can auto-send matches to your downloader.

## Quick start

- Requirements:
  - Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux)
  - Access to a Usenet indexer (Newznab/Hydra-style) and a downloader (SABnzbd, NZBGet, etc.)
- Get the code (clone or download `docker-compose.yml`).
- Ensure the `config` directory exists (stores the SQLite DB and logs).
- From the repo root: `docker compose up --build`
  - Linux: same command; ensure the Compose plugin is installed (`docker compose version`).
- App URL: http://localhost:8080 (API at `/api`)
- Default login: user `admin`, password `admin` — change it in Settings → Security.

## First run checklist

- Add at least one indexer (Settings → Indexers) and test the connection.
- Add a downloader (Settings → Downloaders) and test the connection.
- From Dashboard, add or refresh a Formula One season by year; expand a round and click “Search all events.”
- Send results manually from Search, or use “Auto download best” on a round.

## Notifications

- Configure Apprise/webhook targets in Settings → Notifications.
- Supported events: download-start, download-complete, download-fail.
- Use “Send test” to verify the target; targets can opt in/out per event.

## Developers

- For local dev, architecture notes, and full API details, see [dev.md](dev.md).

## Docker compose (reference)

If you just need the compose file, copy this into `docker-compose.yml` and run `docker compose up --build`:

```yaml
version: "3.9"
services:
  app:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./config:/config
    environment:
      - LOG_LEVEL=INFO
      - SQLITE_PATH=/config/data.db
    command: ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]
```
