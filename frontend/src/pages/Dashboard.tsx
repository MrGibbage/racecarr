import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Select,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { apiFetch } from "../api";

type Event = {
  id?: number;
  type: string;
  start_time_utc?: string | null;
  end_time_utc?: string | null;
};

type Round = {
  id?: number;
  round_number: number;
  name: string;
  circuit?: string | null;
  country?: string | null;
  events: Event[];
};

type Season = {
  id: number;
  year: number;
  last_refreshed: string | null;
  is_deleted?: boolean;
  rounds: Round[];
};

type SearchResult = {
  title: string;
  indexer: string;
  size_mb: number;
  age_days: number;
  seeders: number;
  leechers: number;
  quality: string;
  nzb_url?: string | null;
  event_type?: string | null;
  event_label?: string | null;
  score?: number | null;
  score_reasons?: string[] | null;
};

type AutoGrabSelection = {
  title: string;
  event_label?: string | null;
  score?: number | null;
  downloader_id: number;
};

type AutoGrabResponse = {
  sent: AutoGrabSelection[];
  skipped: string[];
};

type Downloader = {
  id: number;
  name: string;
};

type CachedSearchResponse = {
  results: SearchResult[];
  from_cache: boolean;
  cached_at?: string | null;
  ttl_hours: number;
};

type SearchSettings = {
  event_allowlist?: string[];
};

type ScheduledSearch = {
  id: number;
  round_id: number;
  event_type: string;
  status: string;
  next_run_at?: string | null;
};

const DEFAULT_EVENT_ALLOWLIST = [
  "race",
  "qualifying",
  "sprint",
  "sprint-qualifying",
  "fp1",
  "fp2",
  "fp3",
];

const normalizeEventType = (value?: string | null) => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "other";
  return normalized.replace(/\s+/g, "-");
};

const utcFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const localFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const STORAGE_KEYS = {
  expandedSeasons: "rc_dashboard_expanded_seasons",
  expandedRounds: "rc_dashboard_expanded_rounds",
};

const toId = (value: number | string | undefined | null) => Number(value ?? 0);

function formatDatePair(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    utc: `${utcFormatter.format(d)} UTC`,
    local: `${localFormatter.format(d)} Local`,
  };
}

export function Dashboard() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>({});
  const [expandedRounds, setExpandedRounds] = useState<Record<number, Record<number, boolean>>>(
    {}
  );
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingYear, setRefreshingYear] = useState<number | null>(null);
  const [mutatingYear, setMutatingYear] = useState<number | null>(null);
  const [addYear, setAddYear] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [searchTitle, setSearchTitle] = useState<string>("");
  const [selectedEventFilter, setSelectedEventFilter] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [activeRound, setActiveRound] = useState<{ season: Season; round: Round } | null>(null);
  const [pendingFilter, setPendingFilter] = useState<string | null>(null);
  const [eventAllowlist, setEventAllowlist] = useState<string[] | null>(null);
  const [scheduledSearches, setScheduledSearches] = useState<ScheduledSearch[]>([]);
  const [watchlistMap, setWatchlistMap] = useState<Record<string, ScheduledSearch>>({});
  const [addingWatch, setAddingWatch] = useState<Record<string, boolean>>({});
  const [downloaders, setDownloaders] = useState<Downloader[]>([]);
  const [selectedDownloaderId, setSelectedDownloaderId] = useState<string | null>(null);
  const [sending, setSending] = useState<Record<string, boolean>>({});

  const resolvedAllowlist = useMemo(
    () =>
      new Set(
        (eventAllowlist?.length ? eventAllowlist : DEFAULT_EVENT_ALLOWLIST).map((et) => et.toLowerCase())
      ),
    [eventAllowlist]
  );

  const filterEventsByAllowlist = (events?: Event[]) =>
    (events || []).filter((ev) => resolvedAllowlist.has(normalizeEventType(ev.type)));

  const watchKey = (roundId: number, eventType: string) => `${roundId}-${normalizeEventType(eventType)}`;

  const ensureStateForSeasons = (items: Season[]) => {
    setExpandedSeasons((prev) => {
      const next = { ...prev };
      items.forEach((s) => {
        if (next[s.id] === undefined) next[s.id] = true; // default to expanded view
      });
      return next;
    });
    setExpandedRounds((prev) => {
      const next = { ...prev };
      items.forEach((s) => {
        if (!next[s.id]) next[s.id] = {}; // rounds collapsed by default
      });
      return next;
    });
  };

  useEffect(() => {
    // Load persisted UI state
    try {
      const storedSeasons = localStorage.getItem(STORAGE_KEYS.expandedSeasons);
      const storedRounds = localStorage.getItem(STORAGE_KEYS.expandedRounds);

      const parsedSeasons = storedSeasons ? JSON.parse(storedSeasons) : undefined;
      const parsedRounds = storedRounds ? JSON.parse(storedRounds) : undefined;

      if (parsedSeasons) setExpandedSeasons(parsedSeasons);
      if (parsedRounds) setExpandedRounds(parsedRounds);
    } catch {
      // ignore corrupt storage
    }
    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    localStorage.setItem(STORAGE_KEYS.expandedSeasons, JSON.stringify(expandedSeasons));
  }, [expandedSeasons, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    localStorage.setItem(STORAGE_KEYS.expandedRounds, JSON.stringify(expandedRounds));
  }, [expandedRounds, storageHydrated]);

  const fetchSeasons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/seasons?include_deleted=true`);
      if (!res.ok) throw new Error(`Failed to load seasons (${res.status})`);
      const data = (await res.json()) as Season[];
      setSeasons(data);
      ensureStateForSeasons(data.filter((s) => !s.is_deleted));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const refreshSeason = async (year: number) => {
    setRefreshingYear(year);
    setError(null);
    try {
      const res = await apiFetch(`/seasons/${year}/refresh`, { method: "POST" });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const refreshed = (await res.json()) as Season;
      setSeasons((prev) => {
        const others = prev.filter((s) => s.year !== year);
        const merged = [refreshed, ...others].sort((a, b) => b.year - a.year);
        ensureStateForSeasons(merged.filter((s) => !s.is_deleted));
        // Reset round expansion for this season so it reopens with rounds collapsed
        setExpandedRounds((rounds) => ({ ...rounds, [refreshed.id]: {} }));
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRefreshingYear(null);
    }
  };

  const fetchScheduledSearches = async () => {
    try {
      const res = await apiFetch(`/scheduler/searches`);
      if (!res.ok) throw new Error(`Failed to load scheduler (${res.status})`);
      const data = (await res.json()) as ScheduledSearch[];
      setScheduledSearches(data);
      const map: Record<string, ScheduledSearch> = {};
      data.forEach((item) => {
        map[watchKey(item.round_id, item.event_type)] = item;
      });
      setWatchlistMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scheduler");
    }
  };

  const fetchEventAllowlist = async () => {
    try {
      const res = await apiFetch(`/settings/search`);
      if (!res.ok) throw new Error(`Failed to load search settings (${res.status})`);
      const data = (await res.json()) as SearchSettings;
      const allowlist = data.event_allowlist && data.event_allowlist.length
        ? data.event_allowlist.map((et) => et.toLowerCase())
        : DEFAULT_EVENT_ALLOWLIST;
      setEventAllowlist(allowlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load search settings");
      setEventAllowlist(DEFAULT_EVENT_ALLOWLIST);
    }
  };

  const loadDownloaders = async () => {
    try {
      const res = await apiFetch(`/downloaders`);
      if (!res.ok) throw new Error(`Failed to load downloaders (${res.status})`);
      const data = (await res.json()) as Downloader[];
      setDownloaders(data);
      if (!selectedDownloaderId && data.length) {
        setSelectedDownloaderId(String(data[0].id));
      }
    } catch (err) {
      // ignore; send button will alert if none are configured
    }
  };

  const toggleSeason = (season: Season) => {
    const nextExpanded = !isSeasonExpanded(season.id);
    setExpandedSeasons((prev) => ({ ...prev, [season.id]: nextExpanded }));
    if (nextExpanded) {
      // When expanding a season, reset all rounds to collapsed
      setExpandedRounds((prev) => ({ ...prev, [season.id]: {} }));
    }
  };

  const isSeasonExpanded = (seasonId: number) => expandedSeasons[seasonId] ?? true;

  const isRoundExpanded = (seasonId: number, roundNumber: number) =>
    expandedRounds[seasonId]?.[roundNumber] ?? false;

  const toggleRound = (seasonId: number, roundNumber: number) => {
    setExpandedRounds((prev) => {
      const seasonRounds = prev[seasonId] ? { ...prev[seasonId] } : {};
      seasonRounds[roundNumber] = !seasonRounds[roundNumber];
      return { ...prev, [seasonId]: seasonRounds };
    });
  };

  const setAllRounds = (season: Season, expanded: boolean) => {
    const next: Record<number, boolean> = {};
    season.rounds.forEach((r) => {
      next[r.round_number] = expanded;
    });
    setExpandedRounds((prev) => ({ ...prev, [season.id]: next }));
  };

  const handleHideSeason = async (season: Season) => {
    const year = toId(season.year);
    setError(null);
    setMutatingYear(year);
    try {
      const res = await apiFetch(`/seasons/${year}/hide`, { method: "POST" });
      if (!res.ok) throw new Error(`Hide failed (${res.status})`);
      const updated = (await res.json()) as Season;
      setSeasons((prev) => {
        const merged = [updated, ...prev.filter((s) => s.year !== year)].sort((a, b) => b.year - a.year);
        ensureStateForSeasons(merged.filter((s) => !s.is_deleted));
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hide season");
    } finally {
      setMutatingYear(null);
    }
  };

  const handleRestoreSeason = async (season: Season) => {
    const year = toId(season.year);
    setError(null);
    setMutatingYear(year);
    try {
      const res = await apiFetch(`/seasons/${year}/restore`, { method: "POST" });
      if (!res.ok) throw new Error(`Restore failed (${res.status})`);
      const updated = (await res.json()) as Season;
      setSeasons((prev) => {
        const merged = [updated, ...prev.filter((s) => s.year !== year)].sort((a, b) => b.year - a.year);
        ensureStateForSeasons(merged.filter((s) => !s.is_deleted));
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore season");
    } finally {
      setMutatingYear(null);
    }
  };

  const handleDeleteSeason = async (season: Season) => {
    const year = toId(season.year);
    if (!window.confirm(`Delete season ${year}? This removes rounds, events, and watchlist entries.`)) {
      return;
    }
    setError(null);
    setMutatingYear(year);
    try {
      const res = await apiFetch(`/seasons/${year}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed (${res.status})`);
      setSeasons((prev) => prev.filter((s) => s.year !== year));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete season");
    } finally {
      setMutatingYear(null);
    }
  };

  const addSeason = async () => {
    if (!addYear || addYear < 1950) {
      setError("Enter a valid year (>=1950)");
      return;
    }
    await refreshSeason(addYear);
    setAddYear(null);
  };

  const isPastEvent = (ev: Event) => {
    if (!ev.start_time_utc) return false;
    const dt = new Date(ev.start_time_utc);
    return !Number.isNaN(dt.getTime()) && dt.getTime() <= Date.now();
  };

  const handleRoundSearch = async (season: Season, round: Round, force = false) => {
    const visibleEvents = filterEventsByAllowlist(round.events);
    const pastEvents = visibleEvents.filter(isPastEvent);
    setActiveRound({ season, round: { ...round, events: visibleEvents } });
    setSearchTitle(`Event Details · ${season.year} ${round.name}`);
    setSearchDrawerOpen(true);
    setSearching(true);
    setSearchError(null);
    setAutoMessage(null);
    setSearchResults([]);
    setUsingCache(false);
    setCachedAt(null);
    if (!visibleEvents.length) {
      setSearchError("No events allowed by the current filter.");
      setSearching(false);
      return;
    }
    if (!pastEvents.length) {
      setSearchError("No completed events to search yet.");
      setSearching(false);
      return;
    }
    try {
      const res = await apiFetch(`/rounds/${round.id}/search?force=${force ? "true" : "false"}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as CachedSearchResponse;
      setSearchResults(data.results);
      setUsingCache(data.from_cache);
      setCachedAt(data.cached_at ?? null);
      if (pendingFilter) {
        setSelectedEventFilter(pendingFilter);
        setPendingFilter(null);
      } else {
        setSelectedEventFilter(null);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const viewEventResults = async (season: Season, round: Round, ev: Event) => {
    if (!isPastEvent(ev)) return;
    setSelectedEventFilter(ev.type);
    setSearchTitle(`Event Details · ${season.year} ${round.name} · ${ev.type}`);
    if (activeRound?.round.id === round.id && searchResults.length) {
      setSearchDrawerOpen(true);
      return;
    }
    setPendingFilter(ev.type);
    await handleRoundSearch(season, round, false);
  };

  const addToWatchlist = async (round: Round, ev: Event) => {
    const key = watchKey(round.id ?? 0, ev.type);
    setAddingWatch((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await apiFetch(`/scheduler/searches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_id: round.id,
          event_type: normalizeEventType(ev.type),
        }),
      });
      if (!res.ok) throw new Error(`Failed to add to watchlist (${res.status})`);
      const data = (await res.json()) as ScheduledSearch;
      if (isPastEvent(ev)) {
        // For past events, kick off an immediate search once, then let cadence take over.
        await apiFetch(`/scheduler/searches/${data.id}/run`, { method: "POST" });
      }
      setScheduledSearches((prev) => {
        const merged = prev.filter((p) => p.id !== data.id).concat(data);
        const map: Record<string, ScheduledSearch> = {};
        merged.forEach((item) => {
          map[watchKey(item.round_id, item.event_type)] = item;
        });
        setWatchlistMap(map);
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to watchlist");
    } finally {
      setAddingWatch((prev) => ({ ...prev, [key]: false }));
    }
  };

  const autoDownloadBest = async () => {
    if (!activeRound) return;
    setSearchError(null);
    setAutoMessage(null);

    const normalizedFilter = selectedEventFilter?.toLowerCase();
    const eventTypesForFilter =
      normalizedFilter && normalizedFilter !== "other"
        ? Array.from(
            new Set(
              searchResults
                .filter((r) => {
                  const label = (r.event_label || "Other").toLowerCase();
                  const type = (r.event_type || "").toLowerCase();
                  return label === normalizedFilter || type === normalizedFilter;
                })
                .map((r) => (r.event_type || "").toLowerCase())
                .filter(Boolean)
            )
          )
        : [];

    const payload: Record<string, unknown> = { force: true };
    if (eventTypesForFilter.length) {
      payload.event_types = eventTypesForFilter;
    } else if (normalizedFilter && normalizedFilter !== "other") {
      payload.event_types = [normalizedFilter];
    }

    try {
      const res = await apiFetch(`/rounds/${activeRound.round.id}/autograb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Auto-download failed (${res.status})`);
      const data = (await res.json()) as AutoGrabResponse;
      const sentCount = data.sent.length;
      const skippedCount = data.skipped.length;
      setAutoMessage(`Auto-downloaded ${sentCount} item(s); skipped ${skippedCount}.`);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Auto-download failed");
    }
  };

  useEffect(() => {
    if (!storageHydrated) return;
    fetchEventAllowlist();
    fetchSeasons();
    fetchScheduledSearches();
    loadDownloaders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageHydrated]);

  const filteredResults = selectedEventFilter
    ? searchResults.filter((r) => {
        const label = (r.event_label || "Other").toLowerCase();
        return label === selectedEventFilter.toLowerCase();
      })
    : searchResults;

  const normalizedFilter = selectedEventFilter?.toLowerCase();
  const autoDownloadLabel = !selectedEventFilter
    ? "Auto download best each event"
    : normalizedFilter === "other"
      ? "Auto download best"
      : `Auto download best ${selectedEventFilter}`;
  const autoDownloadDisabled = searching || normalizedFilter === "other";

  const activeSeasons = seasons.filter((s) => !s.is_deleted);
  const hiddenSeasons = seasons.filter((s) => s.is_deleted);

  const renderEvents = (season: Season, round: Round) => {
    const visibleEvents = filterEventsByAllowlist(round.events);
    if (!visibleEvents.length) {
      return <Text c="dimmed" size="sm">All events are hidden by the allowed event types.</Text>;
    }
    return (
      <Stack gap={4}>
        {visibleEvents.map((ev, idx) => (
          <Group key={`${round.round_number}-${ev.type}-${idx}`} gap="xs" align="center">
            <Badge color="blue" variant="light" size="sm">
              {ev.type}
            </Badge>
            {(() => {
              const formatted = formatDatePair(ev.start_time_utc);
              if (!formatted) return <Text size="sm" c="dimmed">TBD</Text>;
              return (
                <Stack gap={0}>
                  <Text size="sm" c="dimmed">{formatted.utc}</Text>
                  <Text size="sm" c="dimmed">{formatted.local}</Text>
                </Stack>
              );
            })()}
            {(() => {
              const key = watchKey(round.id ?? 0, ev.type);
              const scheduled = watchlistMap[key];
              if (scheduled) {
                return (
                  <Badge color="teal" variant="light" size="sm">
                    Watchlist
                  </Badge>
                );
              }
              return (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => addToWatchlist(round, ev)}
                  loading={addingWatch[key]}
                >
                  Add to watchlist
                </Button>
              );
            })()}
            {isPastEvent(ev) && (
              <Button
                size="xs"
                variant="light"
                onClick={() => viewEventResults(season, round, ev)}
                disabled={searching}
              >
                View
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    );
  };

  const renderRounds = (season: Season) => {
    if (!season.rounds?.length) return <Text c="dimmed">No rounds yet. Refresh the season to pull schedule.</Text>;
    const allExpanded = season.rounds.every((r) => isRoundExpanded(season.id, r.round_number));
    return (
      <Stack gap="sm" mt="sm">
        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" size="xs" onClick={() => setAllRounds(season, !allExpanded)}>
            {allExpanded ? "Collapse all rounds" : "Expand all rounds"}
          </Button>
        </Group>
        {season.rounds
          .slice()
          .sort((a, b) => a.round_number - b.round_number)
          .map((rnd) => (
            <Card key={`${season.year}-${rnd.round_number}`} withBorder padding="sm" radius="sm">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={600}>
                    Round {rnd.round_number}: {rnd.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {[rnd.circuit, rnd.country].filter(Boolean).join(" · ") || ""}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => toggleRound(season.id, rnd.round_number)}
                >
                  {isRoundExpanded(season.id, rnd.round_number) ? "Collapse" : "Expand"}
                </Button>
              </Group>
              {isRoundExpanded(season.id, rnd.round_number) && (
                <>
                  <Divider my={8} />
                  <Group justify="space-between" align="center" mb="xs">
                    <Text fw={600}>Events</Text>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => handleRoundSearch(season, rnd)}
                      disabled={searching || !filterEventsByAllowlist(rnd.events).length}
                    >
                      Search all events
                    </Button>
                  </Group>
                  {renderEvents(season, rnd)}
                </>
              )}
            </Card>
          ))}
      </Stack>
    );
  };

  const sendToDownloader = async (row: SearchResult) => {
    if (!row.nzb_url) {
      alert("No NZB URL available for this item.");
      return;
    }
    const downloaderId = selectedDownloaderId || (downloaders.length ? String(downloaders[0].id) : null);
    if (!downloaderId) {
      alert("Configure a downloader in Settings first.");
      return;
    }
    setSending((prev) => ({ ...prev, [row.nzb_url as string]: true }));
    try {
      const res = await apiFetch(`/downloaders/${downloaderId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nzb_url: row.nzb_url, title: row.title }),
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; message: string };
      alert(`${data.ok ? "Sent" : "Failed"}: ${data.message}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending((prev) => ({ ...prev, [row.nzb_url as string]: false }));
    }
  };

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2}>Dashboard</Title>
          <Group gap="xs">
            <NumberInput
              placeholder="Year"
              value={addYear}
              onChange={(val) => setAddYear(val as number | null)}
              min={1950}
              max={2100}
              maw={120}
              hideControls
            />
            <Button
              variant="filled"
              onClick={addSeason}
              loading={refreshingYear !== null && refreshingYear === addYear}
            >
              Add/Refresh season
            </Button>
            <Button variant="default" onClick={fetchSeasons} loading={loading}>
              Refresh list
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" title="Error" variant="light">
            {error}
          </Alert>
        )}

        {loading && !activeSeasons.length ? (
          <Group justify="center">
            <Loader />
          </Group>
        ) : activeSeasons.length ? (
          <Stack gap="sm">
            {activeSeasons.map((season) => (
              <Card key={season.id} withBorder padding="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Title order={3}>Season {season.year}</Title>
                    <Text c="dimmed">
                      {season.last_refreshed
                        ? `Last refreshed: ${new Date(season.last_refreshed).toLocaleString()}`
                        : "Not refreshed yet"}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => toggleSeason(season)}
                    >
                      {isSeasonExpanded(season.id) ? "Collapse season" : "Expand season"}
                    </Button>
                    <Button
                      variant="default"
                      size="xs"
                      loading={refreshingYear === season.year}
                      onClick={() => refreshSeason(season.year)}
                    >
                      Refresh season
                    </Button>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() => handleHideSeason(season)}
                      loading={mutatingYear === season.year}
                      disabled={mutatingYear === season.year || refreshingYear === season.year}
                    >
                      Hide season
                    </Button>
                    <Button
                      variant="light"
                      size="xs"
                      color="red"
                      onClick={() => handleDeleteSeason(season)}
                      loading={mutatingYear === season.year}
                      disabled={mutatingYear === season.year || refreshingYear === season.year}
                    >
                      Delete
                    </Button>
                  </Group>
                </Group>
                {isSeasonExpanded(season.id) && renderRounds(season)}
              </Card>
            ))}
          </Stack>
        ) : (
          <Card withBorder padding="md">
            <Text c="dimmed">No seasons yet. Add a season year to begin.</Text>
          </Card>
        )}

        {!!hiddenSeasons.length && (
          <Card withBorder padding="md" radius="sm">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Title order={4}>Hidden seasons</Title>
                <Text size="sm" c="dimmed">
                  Hidden seasons stay out of dropdowns and watchlists until you restore them.
                </Text>
              </Group>
              <Stack gap="xs">
                {hiddenSeasons.map((season) => (
                  <Group key={`hidden-${season.id}`} justify="space-between" align="center">
                    <div>
                      <Text fw={600}>Season {season.year}</Text>
                      <Text size="sm" c="dimmed">
                        {season.last_refreshed
                          ? `Last refreshed: ${new Date(season.last_refreshed).toLocaleString()}`
                          : "Not refreshed yet"}
                      </Text>
                    </div>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => handleRestoreSeason(season)}
                        loading={mutatingYear === season.year}
                        disabled={mutatingYear === season.year}
                      >
                        Restore
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => handleDeleteSeason(season)}
                        loading={mutatingYear === season.year}
                        disabled={mutatingYear === season.year}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>

      <Drawer
        opened={searchDrawerOpen}
        onClose={() => setSearchDrawerOpen(false)}
        position="top"
        size="90vh"
        title={<Text fw={700}>{searchTitle || "Event Details"}</Text>}
      >
        <Stack gap="sm">
          {searchError && (
            <Alert color="red" title="Search error" variant="light">
              {searchError}
            </Alert>
          )}
          {autoMessage && (
            <Alert color="green" title="Auto download" variant="light">
              {autoMessage}
            </Alert>
          )}
          {usingCache && (
            <Alert color="yellow" title="Using cached results" variant="light">
              <Group justify="space-between" align="center">
                <Text size="sm">
                  Cached at {cachedAt ? new Date(cachedAt).toLocaleString() : "unknown"}. Reload to refresh.
                </Text>
                {activeRound && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => handleRoundSearch(activeRound.season, activeRound.round, true)}
                  >
                    Reload
                  </Button>
                )}
              </Group>
            </Alert>
          )}

          {searching && !searchResults.length ? (
            <Group justify="center">
              <Loader />
            </Group>
          ) : searchResults.length ? (
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Group gap="xs" align="center">
                  <Text size="sm" c="dimmed">
                    Filter by event:
                  </Text>
                  <Button
                    size="xs"
                    variant={selectedEventFilter ? "subtle" : "filled"}
                    onClick={() => setSelectedEventFilter(null)}
                  >
                    All
                  </Button>
                  {Array.from(
                    new Set(searchResults.map((r) => r.event_label || "Other").filter(Boolean))
                  ).map((ev) => (
                    <Button
                      key={ev as string}
                      size="xs"
                      variant={selectedEventFilter === ev ? "filled" : "subtle"}
                      onClick={() => setSelectedEventFilter(ev as string)}
                    >
                      {ev}
                    </Button>
                  ))}
                </Group>
                <Button
                  size="xs"
                  variant="filled"
                  onClick={autoDownloadBest}
                  disabled={autoDownloadDisabled}
                >
                  {autoDownloadLabel}
                </Button>
                <Select
                  placeholder="Select downloader"
                  size="xs"
                  data={downloaders.map((d) => ({ value: String(d.id), label: d.name }))}
                  value={selectedDownloaderId}
                  onChange={(val) => setSelectedDownloaderId(val)}
                  maw={220}
                  clearable
                />
              </Group>
              <ScrollArea h="65vh" offsetScrollbars>
                <Table striped highlightOnHover withColumnBorders stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Event</Table.Th>
                      <Table.Th>Title</Table.Th>
                      <Table.Th>Indexer</Table.Th>
                      <Table.Th>Quality</Table.Th>
                      <Table.Th ta="right">Size (MB)</Table.Th>
                      <Table.Th ta="right">Age (days)</Table.Th>
                      <Table.Th ta="right">Score</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredResults.map((row, idx) => (
                      <Table.Tr key={`${row.title}-${idx}`}>
                        <Table.Td>{row.event_label || ""}</Table.Td>
                        <Table.Td>{row.title}</Table.Td>
                        <Table.Td>{row.indexer}</Table.Td>
                        <Table.Td>
                          <Badge color="blue" variant="light">
                            {row.quality}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">{row.size_mb.toLocaleString()}</Table.Td>
                        <Table.Td ta="right">{row.age_days}</Table.Td>
                        <Table.Td ta="right">{row.score ?? "–"}</Table.Td>
                        <Table.Td>
                          {row.nzb_url ? (
                            <Stack gap={4} justify="flex-start" align="flex-start">
                              <a href={row.nzb_url} target="_blank" rel="noreferrer">
                                Download NZB
                              </a>
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => sendToDownloader(row)}
                                disabled={!selectedDownloaderId || !!sending[row.nzb_url]}
                                loading={!!sending[row.nzb_url]}
                              >
                                Send to downloader
                              </Button>
                            </Stack>
                          ) : (
                            <Text size="sm" c="dimmed">
                              None
                            </Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          ) : (
            <Text c="dimmed" size="sm">
              No results yet.
            </Text>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
