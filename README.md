# Racecarr

<img width="571" height="373" alt="image" src="https://github.com/user-attachments/assets/32ce0cb5-2c38-4d7d-b5ee-bff920f82c36" />

![Version](https://img.shields.io/badge/version-0.5.0--beta-blue)
![Python](https://img.shields.io/badge/python-3.12+-blue)
![Frontend](https://img.shields.io/badge/frontend-Vite%2FReact%2FMantine-00b894)

- Docker Hub: https://hub.docker.com/r/mrgibbage/racecarr
- GitHub (for issues): https://github.com/MrGibbage/racecarr

Racecarr searches F1 events on usenet and can auto-send matches to your downloader. It relies on your own usenet services.

## Requirements

- Docker Desktop (Windows/macOS) or Docker Engine + Compose plugin (Linux)
- A usenet indexer (e.g., nzbgeek)
- A usenet downloader (e.g., SABnzbd)

## Run with Docker (no cloning)

1) Make a folder on your machine and create a `config` subfolder for the app data.
2) Save this as `docker-compose.yml` in that folder:

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
```

3) Start it: `docker compose up -d`
4) Open http://localhost:8080 (API is at `/api`). Default login: `admin` / `admin` (change in Settings → Security).
5) In Settings, add your indexer (e.g., nzbgeek) and downloader (e.g., SABnzbd), test both, then search a season and send downloads.

## Notes

- Supports Apprise/webhook notifications; use “Send test” in Settings → Notifications.
- If you just need email, see the Apprise service list: https://appriseit.com/services/
- More screenshots: https://github.com/MrGibbage/racecarr/blob/main/screenshots.md

## Developers

Developer setup, API reference, and troubleshooting live in [dev.md](dev.md).
