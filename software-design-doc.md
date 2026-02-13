# 1. **Overview & Goals**

## 1.1 Purpose  
This application helps users **find, monitor, and download Formula One race events from Usenet** using their own indexers and download clients. It follows the architectural and UX patterns of Sonarr/Radarr, adapted for motorsport events instead of TV episodes.

## 1.2 High‑Level Concept  
- Users interact through a **web UI** (desktop‑first, responsive-friendly).  
- The backend integrates with:
  - **f1api.dev** for race schedules and metadata  
  - **Newznab-compatible indexers** (NZBGeek, NZBHydra2, custom)  
  - **Usenet downloaders** (SABnzbd, NZBGet, others via adapters)  
- The app runs as a **single Docker container** with:
  - A **FastAPI backend**
  - A **React frontend**
  - A **SQLite database**
- Users may expose the app via their own reverse proxy or keep it local.

## 1.3 Core Features  
- Search for race events by season, round, event type, resolution, release group  
- Auto-categorization of releases (Race, Qualifying, Sprint, FP1/2/3, Full Weekend)  
- Watchlists / auto-download rules  
- Scheduler for monitoring upcoming events  
- Download history and status monitoring  
- Notifications via **Apprise**  
- Single-user authentication  
- Extensible architecture for future motorsport series

---

# 2. **User Experience & Screens**

## 2.1 Login Screen  
- Single password authentication. Default initial user/pass is admin/admin. Must reset after initial setup.
- Optional “remember me” cookie  
- No multi-user support in v1

## 2.2 Dashboard (Home)  
Shows at-a-glance information:
- Upcoming race weekends  
- Active watch rules  
- Recent downloads  
- Any errors or warnings (e.g., indexer offline)

## 2.3 Schedule / Season Browser  
- Select a year (1950–present)  
- View all rounds for that season  
- Each round expands to show:
  - FP1/FP2/FP3  
  - Qualifying  
  - Sprint (if applicable)  
  - Race  
- Event times shown in:
  - User local time  
  - Track local time  
  - UTC  
- Past events show podium results (from f1api.dev)
- When not using demo data, default season list to current year and previous year; user can configure a start year to limit how far back seasons are loaded (API goes to 1950)
 - UI time display supports a user-selectable time zone override (defaults to browser local) alongside UTC; track-local shown when available
 - “Search all events” performs one round-level query across enabled indexers, caches results for 24 hours (with a reload override), and filters results by round/year + event type. Filters include the “big seven” plus “Other”.
 - “Auto download best” respects the selected filter: All sends the top-scoring item per event, a specific event sends only that event, and “Other” disables the button. It uses the score threshold/default downloader from Settings → Search & Quality.

## 2.4 Event Detail Screen  
- All metadata for the round  
- Links to search for each event  
- Download history for that event  
- Button to add event(s) to a watch rule

## 2.5 Search Screen  
- Keyword search  
- Filters:
  - Season  
  - Round  
  - Event type  
  - Resolution  
  - Release group  
- Results normalized across indexers  
- Auto-categorization applied  
- “Send to downloader” button

## 2.6 Watchlist / Rules Screen  
Each rule includes:
- Name  
- Season(s) / round(s) / event types  
- Quality profile (min/max resolution, preferred groups)  
- **Downloader selection (per-rule)**  
- Category/label  
- Priority  
- Active/inactive toggle  
- Last run time  
- Next scheduled run

## 2.7 Downloads / History Screen  
- Queue + completed downloads  
- Status from downloader (downloading, completed, failed)  
- Post-processing results  
- Ability to retry or re-search

## 2.8 Settings  
Tabs include:
- **Indexers**
  - Add/edit/remove  
  - Test connection  
  - API key, category, priority  
- **Downloaders**
  - Add/edit/remove  
  - Test connection  
  - Category, priority  
- **Paths**
  - Completed downloads root folder  
  - Temporary/in-progress folder (if not handled by downloader)  
- **Notifications**
  - Add Apprise endpoints  
  - Select which events trigger notifications  
- **General**
  - Password  
  - Time zone override  
  - Log level  
  - Data refresh settings  
- **Quality Profiles**
  - Define defaults (min/max resolution, preferred codec HEVC/H.264, HDR/HLG allowance, release group preferences)
  - Choose the app-wide default profile
  - Allow per-search override of the default profile before sending to downloader
- **Logging**
  - Configure log level (INFO/DEBUG/ERROR) and retention
- **Storage**
  - Display free space for configured root path(s)  
- **About**
  - Version  
  - Links to GitHub  
  - License  

## 2.9 Frontend Stack (Reference)  
- React + Vite  
- Mantine component library  
- Routing: React Router v6  
- Data fetching/cache: TanStack Query (React Query)  
- Lightweight UI state: Zustand or React Context for non-server state  

## 2.10 Settings Taxonomy (Detailed)  
- **Indexers**  
  - Fields: name, API URL, API key, category IDs, priority, enabled.  
  - Actions: add/edit/delete, test connection.  
- **Downloaders**  
  - Fields: name, type (SABnzbd/NZBGet), API URL/key, category/priority, enabled.  
  - Actions: add/edit/delete, test connection.  
- **Paths & Storage**  
  - Media root (Formula 1/year/event layout).  
  - Temp/in-progress folder (optional if downloader handles it).  
  - Free-space display for configured roots; warn-only on low space.  
- **Quality Profiles**  
  - Min/max resolution; codec prefs (HEVC/H.264); HDR/HLG allowed; preferred release groups.  
  - Select default profile; allow per-search override before sending to downloader.  
- **Search & Scoring**  
  - Toggle fan-out query set; maxage window; auto-grab score threshold; advanced scoring weight tweaks.  
  - Event-type filters list (MVP): user-toggleable allowlist covering the “big seven” (Race, Qualifying, Sprint, Sprint Qualifying, FP1, FP2, FP3) plus “Other” for miscellaneous sessions (press conferences, F1 Live, shows). Allowlist is applied to search results, scoring, and auto-grab/rule evaluation; non-allowed types are filtered out by default, hidden in the UI, and never sent to downloaders (manual or automatic).  
- **Scheduler**  
  - Tick interval; jitter toggle; aggressive/decay cadence windows; stop-after-days; concurrency cap per indexer.  
- **Notifications**  
  - Apprise endpoints; which events trigger; test endpoint.  
- **Logging & Support**  
  - Log level (API `/settings/log-level`); retention days/size cap; download support bundle (redacted logs/version).  
  - About/version surface via `/settings/about` with backend dependency versions and GitHub link.  
- **Time & Locale**  
  - Timezone override (else browser); track-local display toggle; date/time formats.  
- **Security & Auth**  
  - Change password (bcrypt); session idle timeout; remember-me duration. Implemented with FastAPI `/auth/login|logout|me|password` endpoints issuing an httpOnly `rc_session` cookie (remember-me extends expiry; idle timeout refreshed on requests).  
- **UI**  
  - Theme (light/dark/system); table density; calendar color options.  
- **About/Updates**  
  - Version, license, links; (future) update check toggle.  

## 2.11 Settings Scope: MVP vs Later  
- **MVP:**  
  - Indexers: add/edit/delete, test, API URL/key, category, priority, enabled.  
  - Downloaders: add/edit/delete, test, API URL/key, category/priority, enabled.  
  - Paths & Storage: media root, optional temp folder, free-space display, warn-only on low space.  
  - Quality Profiles: min/max resolution, codec pref (HEVC/H.264), HDR/HLG allowed, default profile, per-search override toggle.  
  - Search & Scoring: default fan-out enabled, maxage window, auto-grab threshold (no weight-tuning UI yet).  
  - Event Types: user-configurable allowlist for the big seven (Race, Qualifying, Sprint, Sprint Qualifying, FP1, FP2, FP3); misc sessions (e.g., warm-up, shakedown, press) are opt-in. Non-allowed and uncategorized (“other”) hits are filtered out by default; adding them to the allowlist surfaces them.  
  - Scheduler: tick interval, cadence windows (aggressive/decay), stop-after-days, concurrency cap toggle.  
  - Notifications: Apprise endpoints, choose events, test.  
  - Logging: log level, retention days/size cap; support bundle download.  
  - Time & Locale: timezone override; track-local toggle.  
  - Security & Auth: password change, remember-me duration, idle timeout.  
  - UI: theme (light/dark/system).  
  - About: version, links, license.  
- **Later (not needed now, track for future):**  
  - Advanced scoring weight adjustment UI.  
  - Remote path mappings for downloaders.  
  - Update check toggle / in-app updates: Later. Explicitly off in MVP; future option to poll a release feed and surface a banner/changelog.  
  - Calendar color/density tweaks beyond basic theme/density.  
  - Optional secrets encryption at rest.  
  - Import lists (Trakt/Sonarr-style) and exclusions.  
  - Metadata exports (NFO, media-server integration like Plex/Jellyfin).  
  - Custom regex rules for categorization; custom formats.  
  - Tag management UI.  
  - Language/audio/delay-style profiles if added later.  
  - More granular ops knobs (probe intervals, resource limits).  
  - External API surface for third-party clients.  
  - Backup/restore workflow for `/config` (DB + settings): Later. Simple manual snapshot (stop container if possible), zip/tar `/config`, restore by replacing the folder and restarting. No automated backup UI in MVP.  

---

# 3. **Architecture**

## 3.1 Style  
- **Monolithic application**  
- **API-first** internally  
- Backend + frontend served from the same container  
- Scheduler runs inside backend process  
- No external services required

## 3.2 Components  
- **Backend:** FastAPI (Python)  
- **Frontend:** React + Vite; Mantine as the primary component library  
- **Database:** SQLite  
- **Notifications:** Apprise  
- **Container:** Single Docker image

## 3.3 Deployment  
- One container  
- Exposes one port (e.g., 8080)  
- `/config` volume stores:
  - SQLite DB  
  - Logs  
  - Config files  
- Reverse proxy optional (Traefik, Nginx Proxy Manager, Caddy)
- Frontend bundle (and package manifest for About dependency display) baked into the image

## 3.4 Container & Ops Defaults  
- Base image: python:3.12-slim (install Node for frontend build stage or multi-stage build)  
- Single exposed port: 8080  
- Health: `/healthz` (fast check), `/readyz` (DB + config)  
- Logs: JSON to stdout; file rotation in `/config/logs`  
- Volume: `/config` for DB, logs, config  
- Optional free-space check for configured media root; display in Settings; failures surface in UI rather than blocking send-to-downloader.  

---

# 4. **Data Model**

## 4.1 Core Entities  
### **Series**  
- id  
- name (F1)  
- enabled (future expansion)

### **Season**  
- id  
- year  
- last_refreshed  

### **Round**  
- id  
- season_id  
- round_number  
- name  
- circuit  
- country  
- metadata JSON  

### **Event**  
- id  
- round_id  
- type (FP1, FP2, FP3, Qualifying, Sprint, Race)  
- start_time_utc  
- end_time_utc  
- metadata JSON  

### **Indexer**  
- id  
- name  
- type (NZBGeek, Hydra2, Newznab)  
- api_url  
- api_key  
- category  
- priority  
- enabled  

### **Downloader**  
- id  
- name  
- type (SABnzbd, NZBGet)  
- api_url  
- api_key  
- category  
- priority  
- enabled  

### **Rule**  
- id  
- name  
- season_range  
- round_range  
- event_types  
- quality_profile  
- downloader_id  
- category  
- priority  
- enabled  

### **DownloadHistory**  
- id  
- event_id  
- indexer_id  
- downloader_id  
- nzb_title  
- nzb_url  
- status  
- timestamp  

### **NotificationEndpoint**  
- id  
- name  
- apprise_url  
- events (bitmask or list)

## 4.2 Persistence & Migrations  
- **DB:** SQLite in `/config`.  
- **Migrations:** Use Alembic to evolve schema; apply on startup.  
- **Key constraints:**  
  - `season.year` unique.  
  - `round` unique on `(season_id, round_number)`.  
  - `event` unique on `(round_id, type)`.  
- **Null session tolerance:** Some schedule fields are null; columns remain nullable where data is optional.  
- **Indices:** Add indices on `season.year`, `round.round_number`, and `event.type` for rule evaluation and searches.  

---

# 5. **External Integrations**

## 5.1 f1api.dev  
Used for:
- Seasons  
- Rounds  
- Event metadata  
- Podium results  

### Caching Strategy  
- On first access to a season:
  - Fetch all rounds + events  
  - Store in DB  
- Refresh:
  - Daily  
  - Manual refresh button  
  - Auto-refresh for current season

### 5.1.2 Rate Limits & Call Cadence  
- f1api.dev currently has no auth and no published rate limits.  
- Expected call volume is low: one fetch when a user changes the season in the UI and optional manual refreshes; scheduler refresh for current season once per day.  
- Implement basic network retries/backoff for transient errors even without formal limits.  

### 5.1.1 f1api.dev Data Shape & Mapping  
- **Season endpoint (`/api/{year}`):** returns `races[]` with `round`, `raceId` slug, sponsor-heavy `raceName`, `schedule` (keys: `race`, `qualy`, `fp1/2/3`, `sprintQualy`, `sprintRace`), circuit block (city/country), laps, URLs; winner fields often null here.  
- **Round endpoint (`/api/{year}/{round}`):** returns a single `race[]` with the same structure plus `winner`, `teamWinner`, and `fast_lap` filled; use this to backfill winners/fastest laps.  
- **Nulls are common:** Some sessions (fp2/fp3 or sprint) may be `null`; scheduler and UI must tolerate missing sessions.  
- **Minor shape notes:** `race` is still an array even for one item; `round` can arrive as a string; `circuitLength` is a string with `km`; `fast_lap` includes `fast_lap_driver_id` and `fast_lap_team_id` (round endpoint may also include a `fast_lap` time); `laps` is numeric.  
- **Time handling:** Dates are ISO with `Z`; combine `date` + `time` into UTC datetimes, then render in user local, track local, and UTC.  
- **Timezone handling:** Store all timestamps as UTC. Use stdlib `zoneinfo` for conversion. Maintain an IANA timezone per circuit (e.g., `Asia/Abu_Dhabi`, `Europe/Monaco`) keyed by `circuitId`/country; if unknown, fall back to UTC/user-local and surface “TZ unknown”. No seed list in MVP; allow later overrides if gaps appear. UI can show three columns: UTC, user-local, track-local.  
- **Event derivation:** For each race entry, emit events for `Race`, `Qualifying`, `Sprint Qualifying`, `Sprint`, `FP1/FP2/FP3` when present.  
- **Search name normalization:** Derive a search-friendly name by stripping sponsor tokens from `raceName`, and use circuit city/country as aliases (e.g., `Abu Dhabi`, `Yas Marina`, `UAE`).  
- **Stable keys:** Persist `championshipId`, `raceId`, and `round` as primary identifiers; avoid relying on mutable sponsor names.  
- **Data quality guardrails:** Log and tolerate inconsistent schedules (e.g., date gaps) and prefer round endpoint data when conflicts arise.  

## 5.2 Indexers  
Supported:
- NZBGeek  
- NZBHydra2  
- Custom Newznab-compatible indexers  

### 5.2.1 Newznab Search Strategy (F1 Releases)  
- **No server-side regex:** Newznab does not accept regex in `q` or params; matching is simple tokenization. All regex/normalization happens client-side after fetching results.  
- **Multiple queries per event (fan-out):** Issue several lightweight searches to increase recall:  
  - `t=search&q=Formula 1 {year} {venue} {session}`  
  - `t=search&q=Formula1 {year} Round{round} {venue} {session}`  
  - `t=search&q=F1 {year} {venue} {session}`  
  - `t=tvsearch&season={year}&ep={round}&q=Formula 1 {session}` (TV-style releases)  
  - Swap `{session}` with `Race|Qualifying|Sprint|FP1|FP2|FP3|Practice|Shakedown|Preview|Post-Race|Notebook`.  
- **Category filtering:** Use per-indexer configurable category IDs (sports/TV cats vary by indexer; common ones include 7040/7010/7030) to reduce noise.  
- **Max age/paging:** Apply `maxage` around the event date; respect `limit/offset`.  
- **Client-side regex classification:** After retrieval, classify titles (examples from nzbgeek samples):  
  - `Formula\.?(?P<series>1|E)\.?(?P<year>\d{4})\.?(Round)?(?P<round>\d{2})\.(?P<venue>[A-Za-z\.]+)\.(?P<session>Race|Qualifying|Sprint|FP[123]|Practice(?:\.One|\.Two|\.Three)?|Preview)`  
  - TV-style: `S(?P<season>\d{4})E(?P<ep>\d{2,3})`  
  - Tag each result into canonical event types (big seven: Race, Qualifying, Sprint, Sprint Qualifying, FP1, FP2, FP3; plus misc such as warm-up/shakedown/press/notebook/show/pre/post/analysis) and apply the event-type allowlist before scoring/auto-grab.  
- **Scoring heuristic:** Higher score when year/round/session all match; prefer exact venue tokens; downgrade previews/notebooks unless requested; filter out mismatched years/rounds.  
- **Normalization:** Treat `.`/`_` as spaces; keep both `Formula1` and `Formula 1`; map alias tokens (`Grand Prix`, city, or country) into search strings; accept uppercase/lowercase variants.  
- **Telemetry for tuning:** Log emitted queries and top matches per event to refine patterns; allow operator overrides for venue aliases and session labels.  

### 5.2.2 Default Search & Scoring Parameters  
- **Fan-out set (defaults):** Run the five queries listed above per event/session.  
- **maxage window:** 14 days before event start through 7 days after (cap at 21 days) to avoid stale results.  
- **Categories:** Default sports/TV cats: 7040 (Sports HD), 7010 (TV HD), 7030 (Other TV); allow per-indexer override.  
- **Relevance scoring:**  
  - +40 if year matches; +35 if round matches; +25 if session matches; +15 if venue token matches (city/circuit/country alias).  
  - -40 if year or round mismatch; -20 if marked Preview/Notebook when rule targets race/qualy/sprint/FP.  
  - Bonus +10 if release group preferred; +5 for preferred codec/resolution within quality profile.  
- **Auto-grab threshold:** Auto-download when score >= 70 and no hard mismatches (year/round). Tie-break by: preferred resolution within profile, preferred codec, newer pubdate, then smaller size spread vs expected (if known).  
- **Manual searches:** Always show all hits with their scores; user can override and send to downloader even if below threshold.  
- **Quality size caps:** None by default; do not enforce size ceilings in quality profiles.  

### Search Flow  
1. Build search terms from event metadata  
2. Query all enabled indexers  
3. Normalize results  
4. Apply filters  
5. Auto-categorize  
6. Return to UI

## 5.3 Downloaders  
Supported:
- SABnzbd  
- NZBGet  
- Others via adapter pattern  
- Out-of-box SABnzbd/NZBGet category mapping support.  

### Downloader Abstraction  
```
add_download(...)
get_status(...)
list_history(...)
test_connection(...)
```

### Per-Rule Downloader Selection  
- Each rule specifies its downloader  
- If none specified → use global default  
- If no downloader configured → error state

### 5.3.1 Path Layout Convention  
- Users supply a media root (e.g., `/media/tv`).  
- App places Formula 1 under `media/tv/Formula 1/{year}/{event}` mirroring series/season/episode semantics for compatibility with Sonarr/Plex conventions.  
- Uses event-specific folder names derived from race metadata.  

---

# 6. **Scheduler & Rules Engine**

## 6.1 Scheduler  
- **Global tick:** every 10 minutes (configurable). Add ±2 minute jitter to avoid thundering herd.  
- **Search cadence for an event:**  
  - Start searching 30 minutes after scheduled start time of the session.  
  - Aggressive window: every tick (10 minutes) for the first 24 hours after start.  
  - Decay window: every 6 hours after 48 hours; stop automatic searches after 14 days unless manually triggered.  
- **Concurrency limits:** cap concurrent indexer calls (e.g., 3 in-flight) and serialize per-indexer to respect polite use; back off with exponential retry on HTTP/timeouts.  
- **Tasks include:** refresh current season data, evaluate watch rules, search for events in scope, trigger downloads, update download statuses, send notifications.  

## 6.2 Rule Evaluation  
For each rule:
1. Determine events in scope  
2. Filter out events already downloaded  
3. If event is within search window:
   - Run search  
   - Apply quality profile  
   - If match found → send to downloader  
   - Record in history  

---

# 7. **Authentication & Security**

## 7.1 Single-User Model  
- One password  
- Stored hashed (bcrypt; configurable work factor). Never store plain text.  
- No user table  
- No roles  
- No password reset flow  
- Default credentials: admin/admin; force change on first login.  

## 7.2 Sessions  
- Secure cookie-based session  
- Default session expiry: 24 hours idle timeout  
- “Remember me”: extend to 30 days (sliding renewal) to reduce re-logins  

## 7.3 Reverse Proxy  
- Users may expose the app externally  
- Recommend HTTPS via proxy  
- App itself does not manage certificates

## 7.4 Secrets Storage & Redaction  
- API keys/secrets for indexers, downloaders, future services (e.g., Plex) are stored in SQLite.  
- Keep it simple (no at-rest encryption by default); rely on file permissions and container isolation.  
- Always redact/obfuscate secrets in logs, test outputs, and support exports.  
- Future enhancement: optional passphrase-based encryption for secrets if demanded.  

---

# 8. **Notifications**

## 8.1 Backend  
- Use **Apprise**  
- Supports 100+ services  
- No custom integrations needed  

## 8.2 Events  
- Download started  
- Download completed  
- Download failed  
- New event available  
- Rule triggered  
- Indexer/downloader errors  

## 8.3 UI  
- Add/edit/remove endpoints  
- Test endpoint  
- Select which events trigger notifications  

---

# 9. **Logging & Observability**

## 9.1 Logging  
- Structured logs (JSON preferred)  
- Levels: INFO, DEBUG, ERROR  
- Correlation/request IDs on API calls and scheduler runs to tie related log lines together  
- Redact secrets (API keys, URLs with keys, passwords) in all logs/support bundles  
- Logged events:
  - API calls to indexers (request, response code, duration)  
  - API calls to downloaders  
  - Scheduler runs and per-task outcomes  
  - Rule evaluations and search queries issued  
  - Errors with stack traces  

## 9.2 Log Storage  
- `/config/logs`  
- Daily rotation  
- Keep N days configurable; cap size per file  

## 9.4 Log Retention Defaults  
- Mirror Sonarr/Radarr-style rotation: daily files, max size (e.g., 20 MB) per file, keep 30 days by default (configurable).  
- Log level configurable in Settings (INFO/DEBUG/ERROR).  
 
## 9.3 Error Surfacing  
- UI surface for recent errors/warnings (indexer/downloader failures, search failures, scheduler task errors).  
- Dedicated log view shows the most recent 50 entries with filters (type, indexer, downloader, time window) for quick triage.  
- Expose last error per indexer/downloader in Settings for quick diagnosis.  
- Provide a downloadable support bundle with redacted logs and version info.  
- Highlight critical errors (e.g., f1api unreachable, network offline) prominently in the UI.  

---

# 10. **Testing Strategy**

## 10.1 Unit Tests  
- Auto-categorization logic  
- Search normalization  
- Rule evaluation  
- f1api.dev client (mocked)  
- Indexer clients (mocked)  
- Downloader clients (mocked)

## 10.2 Integration Tests  
- End-to-end search flow  
- Rule triggering  
- Download lifecycle  

## 10.3 Manual Testing  
- UI flows  
- Scheduler behavior  
- Notifications  

---

# 11. **Extensibility**

## 11.1 Future Series  
Architecture supports adding:
- MotoGP  
- WEC  
- IndyCar  
- NASCAR  
- Formula E  

Each series would define:
- API source  
- Event types  
- Metadata schema  

## 11.2 Media Server Integration  
Future enhancements:
- Plex webhook  
- Jellyfin/Emby integration  
- Sonarr/Radarr-like API endpoints  

## 11.3 Advanced Rules  
- “Grab every race in 1080p or better”  
- “Prefer HEVC releases”  
- “Avoid certain release groups”  

---

# 12. **Open Questions / Future Work**
- Should we support multiple quality profiles?  
- Should users be able to override event names for better search matching?  
- Should we support NZB file upload directly?  
- Should we allow custom regex rules for categorization?  
- Enumerate all settings page options (per-section) for implementation checklist.  

---

# 13. **Conclusion**

This design document defines a **Sonarr-inspired, single-user, single-container, SQLite-backed automation app** for discovering and downloading Formula One race events from Usenet.

It is:

- Simple to deploy  
- Easy to extend  
- Familiar to users of the Usenet automation ecosystem  
- Architected for long-term maintainability  
- Ready for future motorsport series  

---

# 14. **Dev Environment & Agent Instructions**

- Goal: fast local iteration without rebuilding containers for every code change; still provide a production-like Docker setup.  
- Dockerfile: multi-stage (Node for frontend build, Python runtime), python:3.12-slim base.  
- docker-compose.yml: app service with bind mounts to local source for live code updates; mount `/config` to a local folder for SQLite/logs; expose port 8080. No extra services required beyond the app.  
- Hot reload: enable FastAPI autoreload in dev; enable Vite dev server or serve built assets with a watch mode during development.  
- Tests: support one-command test run inside compose (e.g., `make test` running `pytest` / frontend tests if present).  
- Automation: Makefile or script targets: `make dev` (compose up with bind mounts + reload), `make test`, `make build` (production image).  
- Logging: keep JSON logs to stdout in containers; bind-mounted logs remain under `/config/logs` for inspection.  
- CI hook: run `make test` (backend + frontend) on pull requests/commits.  
- If using an LLM agent: instruct it to create/update Dockerfile, docker-compose.yml, and Makefile to satisfy the above, then run the build/tests and report errors.  
