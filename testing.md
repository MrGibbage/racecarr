## Testing Checklist

> Status note: Unchecked items are future work per the design doc unless noted as completed.

### Pre-reqs
- [x] Python 3.12 installed
- [x] Docker Desktop running
- [x] Repo cloned

### Local dev setup
- [x] Backend: from `backend` run `uv sync --python "C:\Python312\python.exe"`
- [x] Backend: run `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- [x] Frontend: from `frontend` run `npm install` (first time), then `npm run dev -- --host --port 5173`

### API smoke (local 8000)
- [x] GET http://localhost:8000/api/healthz → {"status":"ok"}
- [x] GET http://localhost:8000/api/readyz → {"status":"ready"}
- [x] POST/GET http://localhost:8000/api/demo-seasons → three seasons (2026, 2025, 2024)
- [x] POST http://localhost:8000/api/seasons/{year}/refresh → fetches rounds/events from f1api.dev
- [x] GET http://localhost:8000/api/seasons → lists seasons (count 3)
- [x] GET http://localhost:8000/api/search-demo → returns 3 mock rows
- [x] GET http://localhost:8000/api/logs → last 50 JSON log entries visible
- [x] GET/POST http://localhost:8000/api/indexers → list/create indexers
- [x] PUT/DELETE http://localhost:8000/api/indexers/{id} → update/remove
- [x] POST http://localhost:8000/api/indexers/{id}/test → connectivity check (caps)

### Frontend (local dev)
- [x] Dashboard: shows 3 season cards; “Seed demo seasons” works; “Refresh” reloads list
- [x] Search: shows 3 demo results table; “Refresh demo results” reloads
- [x] Logs: shows last log entries table (timestamp/level/message)
> Note: frontend calls `VITE_API_URL` if provided, otherwise `http://localhost:8000/api`.

### Round search & caching
- [ ] “Search all events” runs a single round-level query per indexer, respects 24h cache, and “Reload” bypasses cache
- [ ] Results are filtered to the selected round by year/location; event filter buttons include the big seven plus “Other”; “All” shows everything for that round

### Settings / Auth
- [x] Single-password auth: login flow, password change, session idle timeout (remember-me + logout)
- [x] Log level setting persists and changes verbosity
- [x] About/version displays current build

### Docker end-to-end (container on 8080)
- [x] From repo root: `docker compose up --build`
- [x] App served at http://localhost:8080/
- [x] API at http://localhost:8080/api/... (healthz/readyz/seasons/search-demo/logs)
- [x] Navigate UI (Dashboard/Search/Logs) and confirm data renders

### Indexers & Search (real integrations)
- [ ] Add/indexer settings form (NZBGeek/Newznab/Hydra2) saves and tests connection
- [ ] Search against real indexer returns normalized results
- [ ] Scoring/filters apply (season/round/session/quality) per design
- [ ] Fan-out query set respects maxage/category settings

### Downloaders
- [ ] Add SABnzbd/NZBGet downloader and test connection
- [ ] “Send to downloader” from a search result creates a job in downloader
- [ ] Status polling shows queue/completed/failed items

### Scheduler / Refresh
- [ ] Scheduler tick runs on interval, refreshes current season from f1api.dev
- [ ] Manual “refresh season” triggers f1api fetch and updates rounds/events
- [ ] Auto-download rules run on schedule and create downloads when score threshold met

### Watchlists / Rules
- [ ] Create/edit/disable a watch rule (season/round/event types, quality profile, downloader selection)
- [ ] Rule respects quality profile and category/priority when sending to downloader

### Quality Profiles
- [ ] Define default quality profile (min/max resolution, codec, HDR/HLG allowed)
- [ ] Per-search override uses the selected profile for scoring/selection

### Paths & Storage
- [ ] Configure media root/temp paths; free-space display works; warn on low space (non-blocking)

### Notifications (Apprise)
- [ ] Add Apprise endpoint; test notification succeeds
- [ ] Notifications fire on download start/complete/fail

### Logging & Support
- [x] Log file writes JSON with rotation/retention
- [ ] Support bundle (logs/version) downloadable

### Timezones & Event Display
- [ ] Event times show UTC, user local, and track local; fallback to UTC when track TZ unknown

### Backup/Restore
- [ ] Manual backup of `/config` (DB + logs) and restore brings app back with settings intact

### Security
- [ ] Single-user auth enforced; remember-me and idle timeout behave per settings

### Update check (deferred)
- [ ] (Later) Update check toggle / banner (explicitly off in MVP)

### Shut down
- [x] Dev servers: Ctrl+C (twice if running with --reload)
- [ ] Docker: Ctrl+C to stop; `docker compose down` if you want to clean up