## Testing Checklist

### Pre-reqs
- [x] Python 3.12 installed
- [x] Docker Desktop running
- [x] Repo cloned

### Backend setup (local)
- [x] From backend: `uv sync --python "C:\Python312\python.exe"`
- [x] Run dev server with reload: `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

### Health checks
- [x] GET http://localhost:8000/api/healthz → {"status":"ok"}
- [x] GET http://localhost:8000/api/readyz → {"status":"ready"}

### Seed & data checks
- [x] POST/GET http://localhost:8000/api/demo-seasons → three seasons (2026, 2025, 2024)
- [x] GET http://localhost:8000/api/seasons → lists seasons (count 3)

### Search demo
- [x] GET http://localhost:8000/api/search-demo → returns 3 mock rows

### Logs API
- [x] Hit health/seasons/search to generate entries
- [x] GET http://localhost:8000/api/logs → last 50 JSON log entries visible

### Frontend (dev)
- [x] From frontend: `npm install` (first time), then `npm run dev -- --host --port 5173`
- [x] Dashboard: shows 3 season cards; “Seed demo seasons” works; “Refresh” reloads list
- [x] Search: shows 3 demo results table; “Refresh demo results” reloads
- [x] Logs: shows last log entries table (timestamp/level/message)

### Settings / Auth
- [ ] Single-password auth: login flow, password change, session idle timeout
- [ ] General settings: time zone override applies to displayed event times
- [ ] Log level setting persists and changes verbosity
- [ ] About/version displays current build

### Docker end-to-end
- [ ] From repo root: `docker compose up --build`
- [ ] App served at http://localhost:8000/ (frontend static)
- [ ] API at http://localhost:8000/api/... (healthz/readyz/seasons/search-demo/logs)
- [ ] Navigate UI (Dashboard/Search/Logs) and confirm data renders

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