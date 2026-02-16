# Racecarr

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Python](https://img.shields.io/badge/python-3.12+-blue)
![Frontend](https://img.shields.io/badge/frontend-Vite%2FReact%2FMantine-00b894)

Racecarr is a small FastAPI + React app that searches F1 events across indexers and can auto-send matches to your downloader. F1 uploads to usenet do not follow typical S00E00 episode naming conventions, so sonarr can't reliably find them. This app aims to fill the gap. It's not perfect due to the highly inconsistent naming of F1 uploads, but you should be able to find suitable downloads for most events.

As of Feb 2026 (ver 0.1), this app is very early in testing because I am waiting for a live F1 season to actually test the scheduling. But if you want to give it a shot and provide me feedback, I could use the help!

## Quick start (Docker)

- Prereqs: Docker Desktop (Windows/macOS) or Docker Engine + Compose plugin (Linux).
- Clone the repo (or copy `docker-compose.yml`) and ensure a `config/` folder exists for the SQLite DB and logs.
- From the repo root: `docker compose up -d` (pulls the image `mrgibbage/racecarr:latest`; use `--pull always` if you want to force-update). Linux is the same; verify with `docker compose version`.
- App URL: http://localhost:8080 (API at `/api`). Default login is `admin`/`admin`; change it immediately in Settings → Security.

## Local development

- Backend: `cd backend && uv sync --python "C:\\Python312\\python.exe" && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
- Frontend: `cd frontend && npm install` (first run), then `npm run dev -- --host --port 5173` (uses `VITE_API_URL`; falls back to `http://localhost:8000/api`).
- Demo data: call `POST /api/demo-seasons` to seed 2024–2026 sample seasons, then browse the Dashboard and Search pages.

## Docs

- Developer guide: [dev.md](dev.md) (commands, API reference, Docker runbook).
- Testing checklist: [testing.md](testing.md) (manual coverage status; no automated tests yet).
- Design + roadmap: [software-design-doc.md](software-design-doc.md) (feature scope and UX/arch notes).

## First run checklist

- Head to the settings page
- Update your login password. The default password is 'admin'. There is no username and there are no user accounts.
- Add at least one indexer (Settings → Indexers) and test the connection.
- Add a downloader (Settings → Downloaders) and test the connection.
- Add a notification if you want, and set your preferred quality profiles, and event types you are interested in.
- From Dashboard, add or refresh a Formula One season by year; expand a round and click “Search all events.”
- Send results manually from Search, or use “Auto download best” on a round.

## Notifications

- Configure Apprise/webhook targets in Settings → Notifications.
- Supported events: download-start, download-complete, download-fail.
- Use “Send test” to verify the target; targets can opt in/out per event.
- If you just need email, see the Apprise service list (https://appriseit.com/services/) and email guide (https://appriseit.com/services/email/).

## Developers

- For local dev, architecture notes, and full API details, see [dev.md](dev.md).

## Docker compose (reference)

If you just need the compose file, copy this into `docker-compose.yml` and run `docker compose up -d`:

```yaml
version: "3.9"
services:
  app:
    image: mrgibbage/racecarr:latest
    ports:
      - "8080:8080"
    volumes:
      - ./config:/config
    environment:
      - LOG_LEVEL=INFO
      - SQLITE_PATH=/config/data.db
    command: ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]
```
