import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { apiFetch } from "../api";

const EVENT_OPTIONS = [
  { value: "race", label: "Race" },
  { value: "qualifying", label: "Qualifying" },
  { value: "sprint", label: "Sprint" },
  { value: "sprint-qualifying", label: "Sprint Qualifying" },
  { value: "fp1", label: "FP1" },
  { value: "fp2", label: "FP2" },
  { value: "fp3", label: "FP3" },
];

type Event = {
  id?: number;
  type: string;
  start_time_utc?: string | null;
  end_time_utc?: string | null;
};

type Round = {
  id: number;
  round_number: number;
  name: string;
  season_id?: number;
  circuit?: string | null;
  country?: string | null;
  events: Event[];
};

type Season = {
  id: number;
  year: number;
  rounds: Round[];
};

type ScheduledSearch = {
  id: number;
  round_id: number;
  event_type: string;
  status: string;
  added_at: string;
  last_searched_at?: string | null;
  next_run_at?: string | null;
  last_error?: string | null;
  tag?: string | null;
  nzb_title?: string | null;
  nzb_url?: string | null;
  downloader_id?: number | null;
  attempts?: number;
};

type Downloader = {
  id: number;
  name: string;
  type: string;
  enabled?: boolean;
};

type SearchSettings = {
  min_resolution: number;
  max_resolution: number;
  allow_hdr: boolean;
  preferred_codecs: string[];
  preferred_groups: string[];
  auto_download_threshold: number;
  default_downloader_id?: number | null;
  event_allowlist?: string[];
};

type DemoSeedResponse = {
  season_year: number;
  round_id: number;
  events: string[];
  scheduled_created: number[];
  scheduled_existing: number[];
};

const ALLOW_DEMO_SEED = import.meta.env?.VITE_ALLOW_DEMO_SEED === "true";

const normalizeEventType = (value?: string | null) => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "other";
  return normalized.replace(/\s+/g, "-");
};

const formatDateTime = (value?: string | null, mode: "local" | "utc" = "local") => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: mode === "utc" ? "UTC" : undefined,
  });
  return formatter.format(d);
};

const formatNow = (mode: "local" | "utc") => formatDateTime(new Date().toISOString(), mode);

const computePeriodicity = (eventStart?: Date | null, nextRun?: Date | null) => {
  if (!eventStart) {
    if (!nextRun) return "6 hours";
    const diffMs = nextRun.getTime() - Date.now();
    if (diffMs <= 20 * 60 * 1000) return "10 minutes";
    if (diffMs <= 8 * 60 * 60 * 1000) return "6 hours";
    return "24 hours";
  }
  const anchor = new Date(eventStart.getTime() + 30 * 60 * 1000);
  if (Date.now() < anchor.getTime()) return "Future event";
  if (nextRun) {
    const diffMs = nextRun.getTime() - Date.now();
    if (diffMs <= 20 * 60 * 1000) return "10 minutes";
    if (diffMs <= 8 * 60 * 60 * 1000) return "6 hours";
  }
  return "24 hours";
};

const statusColor = (status: string) => {
  const key = status.toLowerCase();
  if (key === "running") return "blue";
  if (key === "waiting-download") return "grape";
  if (key === "completed") return "teal";
  if (key === "failed") return "red";
  return "gray";
};

const statusLabel = (status: string) => {
  const key = status.toLowerCase();
  if (key === "waiting-download") return "Waiting";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export function Scheduler() {
  const [scheduled, setScheduled] = useState<ScheduledSearch[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [downloaders, setDownloaders] = useState<Downloader[]>([]);
  const [settings, setSettings] = useState<SearchSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [quickSeason, setQuickSeason] = useState<string | null>(null);
  const [quickEventType, setQuickEventType] = useState<string | null>("race");
  const [quickDownloaderId, setQuickDownloaderId] = useState<string | null>(null);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [timeMode, setTimeMode] = useState<"local" | "utc">("local");
  const [clock, setClock] = useState<string>(() => formatNow("local"));

  const roundLookup = useMemo(() => {
    const map = new Map<
      number,
      {
        seasonYear: number;
        roundNumber: number;
        roundName: string;
        eventStarts: Record<string, string | undefined>;
      }
    >();
    seasons.forEach((season) => {
      season.rounds?.forEach((rnd) => {
        const eventStarts: Record<string, string | undefined> = {};
        rnd.events?.forEach((ev) => {
          const key = normalizeEventType(ev.type);
          eventStarts[key] = ev.start_time_utc || undefined;
        });
        map.set(rnd.id, {
          seasonYear: season.year,
          roundNumber: rnd.round_number,
          roundName: rnd.name,
          eventStarts,
        });
      });
    });
    return map;
  }, [seasons]);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedRes, seasonsRes, downloadersRes, settingsRes] = await Promise.all([
        apiFetch(`/scheduler/searches`),
        apiFetch(`/seasons`),
        apiFetch(`/downloaders`),
        apiFetch(`/settings/search`),
      ]);
      if (!schedRes.ok) throw new Error(`Failed to load scheduler (${schedRes.status})`);
      if (!seasonsRes.ok) throw new Error(`Failed to load seasons (${seasonsRes.status})`);
      if (!downloadersRes.ok) throw new Error(`Failed to load downloaders (${downloadersRes.status})`);
      if (!settingsRes.ok) throw new Error(`Failed to load search settings (${settingsRes.status})`);
      const schedData = (await schedRes.json()) as ScheduledSearch[];
      const seasonData = (await seasonsRes.json()) as Season[];
      const downloaderData = (await downloadersRes.json()) as Downloader[];
      const settingsData = (await settingsRes.json()) as SearchSettings;
      setScheduled(schedData);
      setSeasons(seasonData);
      setDownloaders(downloaderData);
      setSettings(settingsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemo = async () => {
    setSeedMessage(null);
    setError(null);
    setSeedBusy(true);
    try {
      const res = await apiFetch(`/demo/seed-scheduler`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Demo seed failed (${res.status}): ${text || "unknown error"}`);
      }
      const data = (await res.json()) as DemoSeedResponse;
      setSeedMessage(
        `Demo season ${data.season_year} ready. Added events: ${data.events.join(", ")}. Scheduled created: ${data.scheduled_created.length}, existing: ${data.scheduled_existing.length}.`
      );
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo seed failed");
    } finally {
      setSeedBusy(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    setClock(formatNow(timeMode));
    const id = window.setInterval(() => {
      setClock(formatNow(timeMode));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timeMode]);

  const refreshScheduled = useCallback(async () => {
    try {
      const res = await apiFetch(`/scheduler/searches`);
      if (!res.ok) throw new Error(`Failed to reload scheduler (${res.status})`);
      const data = (await res.json()) as ScheduledSearch[];
      setScheduled(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload scheduler");
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshScheduled();
    }, 15000);
    return () => window.clearInterval(id);
  }, [refreshScheduled]);

  const handleRunNow = async (item: ScheduledSearch) => {
    setActionLoading((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await apiFetch(`/scheduler/searches/${item.id}/run`, { method: "POST" });
      if (!res.ok) throw new Error(`Run now failed (${res.status})`);
      await refreshScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run now failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleDelete = async (item: ScheduledSearch) => {
    if (!window.confirm("Delete this scheduled search?")) return;
    setActionLoading((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await apiFetch(`/scheduler/searches/${item.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed (${res.status})`);
      await refreshScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleUpdateDownloader = async (item: ScheduledSearch, downloaderId: number | null) => {
    if (item.downloader_id === downloaderId) return;
    setActionLoading((prev) => ({ ...prev, [item.id]: true }));
    try {
      // No update endpoint exists, so recreate the entry with the new downloader.
      const delRes = await apiFetch(`/scheduler/searches/${item.id}`, { method: "DELETE" });
      if (!delRes.ok && delRes.status !== 204) throw new Error(`Update failed (${delRes.status})`);
      const res = await apiFetch(`/scheduler/searches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_id: item.round_id,
          event_type: item.event_type,
          downloader_id: downloaderId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      await refreshScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleQuickAdd = async () => {
    setQuickMessage(null);
    setError(null);
    if (!quickSeason || !quickEventType) {
      setError("Select a season and event type to quick-add.");
      return;
    }
    const seasonYear = Number(quickSeason);
    const season = seasons.find((s) => s.year === seasonYear);
    if (!season) {
      setError("Season not found.");
      return;
    }

    const now = Date.now();
    const normalizedType = normalizeEventType(quickEventType);
    const payloads: { round_id: number; event_type: string; downloader_id?: number }[] = [];
    season.rounds?.forEach((rnd) => {
      rnd.events?.forEach((ev) => {
        const evType = normalizeEventType(ev.type);
        if (evType !== normalizedType) return;
        const start = ev.start_time_utc ? new Date(ev.start_time_utc).getTime() : null;
        if (start && start > now) {
          payloads.push({
            round_id: rnd.id,
            event_type: normalizedType,
            downloader_id: quickDownloaderId ? Number(quickDownloaderId) : undefined,
          });
        }
      });
    });

    if (!payloads.length) {
      setQuickMessage("No future events of that type found in the selected season.");
      return;
    }

    setQuickBusy(true);
    try {
      let added = 0;
      await Promise.all(
        payloads.map(async (p) => {
          const res = await apiFetch(`/scheduler/searches`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          });
          if (res.ok) added += 1;
        })
      );
      setQuickMessage(`Queued ${added} event(s) for the watchlist.`);
      await refreshScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quick-add failed");
    } finally {
      setQuickBusy(false);
    }
  };

  const renderQuality = () => {
    if (!settings) return "—";
    const hdr = settings.allow_hdr ? "HDR ok" : "HDR off";
    return `${settings.min_resolution}p-${settings.max_resolution}p • Score ≥ ${settings.auto_download_threshold} • ${hdr}`;
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Scheduler</Title>
        <Group gap="xs">
          <Button variant="default" onClick={fetchAll} loading={loading}>
            Reload
          </Button>
        </Group>
      </Group>

      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Button
            variant={timeMode === "local" ? "filled" : "default"}
            onClick={() => setTimeMode("local")}
            size="xs"
          >
            Local
          </Button>
          <Button
            variant={timeMode === "utc" ? "filled" : "default"}
            onClick={() => setTimeMode("utc")}
            size="xs"
          >
            UTC
          </Button>
          <Button variant="default" size="xs" disabled title="Track-local timezone not available yet">
            Track (coming soon)
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          Live clock: {clock}
        </Text>
      </Group>

      {error && (
        <Alert color="red" title="Error" variant="light">
          {error}
        </Alert>
      )}

      {quickMessage && !error && (
        <Alert color="green" title="Info" variant="light">
          {quickMessage}
        </Alert>
      )}

      {seedMessage && !error && (
        <Alert color="blue" title="Demo" variant="light">
          {seedMessage}
        </Alert>
      )}

      {ALLOW_DEMO_SEED && (
        <Card withBorder padding="md" radius="sm">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>Demo data</Title>
              <Text size="sm" c="dimmed">
                Create a demo season with nearby events and sample scheduled searches (dev-only).
              </Text>
            </div>
            <Button onClick={handleSeedDemo} loading={seedBusy} variant="light">
              Create demo events
            </Button>
          </Group>
        </Card>
      )}

      <Card withBorder padding="md" radius="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4}>Quick add watchlist</Title>
              <Text size="sm" c="dimmed">
                Add all future events of a type for a season. Duplicates are ignored.
              </Text>
            </div>
            <Group gap="xs">
              <Select
                label="Season"
                placeholder="Choose season"
                data={seasons.map((s) => ({ value: String(s.year), label: String(s.year) }))}
                value={quickSeason}
                onChange={setQuickSeason}
                searchable
                clearable
                size="sm"
              />
              <Select
                label="Event type"
                placeholder="Event type"
                data={EVENT_OPTIONS}
                value={quickEventType}
                onChange={setQuickEventType}
                searchable
                clearable={false}
                size="sm"
              />
              <Select
                label="Downloader (optional)"
                placeholder="Default"
                data={downloaders.map((d) => ({ value: String(d.id), label: `${d.name} (${d.type})` }))}
                value={quickDownloaderId}
                onChange={setQuickDownloaderId}
                searchable
                clearable
                size="sm"
              />
              <Button onClick={handleQuickAdd} loading={quickBusy} mt={22}>
                Add events
              </Button>
            </Group>
          </Group>
        </Stack>
      </Card>

      {loading ? (
        <Group justify="center">
          <Loader />
        </Group>
      ) : (
        <ScrollArea h="70vh" offsetScrollbars>
          <Table striped highlightOnHover withColumnBorders stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Year</Table.Th>
                <Table.Th>Round</Table.Th>
                <Table.Th>Event</Table.Th>
                <Table.Th>Added</Table.Th>
                <Table.Th>Last searched</Table.Th>
                <Table.Th>Event start</Table.Th>
                <Table.Th>Next run</Table.Th>
                <Table.Th>Periodicity</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Downloader</Table.Th>
                <Table.Th>Quality</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scheduled.map((item) => {
                const info = roundLookup.get(item.round_id);
                const eventStartIso = info?.eventStarts[normalizeEventType(item.event_type)];
                const eventStart = eventStartIso ? new Date(eventStartIso) : null;
                const nextRun = item.next_run_at ? new Date(item.next_run_at) : null;
                const busy = ["running", "waiting-download"].includes(item.status.toLowerCase());
                return (
                  <Table.Tr key={item.id}>
                    <Table.Td>{info?.seasonYear ?? "?"}</Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text fw={600}>Round {info?.roundNumber ?? "?"}</Text>
                        <Text size="sm" c="dimmed">{info?.roundName ?? ""}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge color="blue" variant="light">
                        {item.event_type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatDateTime(item.added_at, timeMode)}</Table.Td>
                    <Table.Td>{formatDateTime(item.last_searched_at, timeMode)}</Table.Td>
                    <Table.Td>{formatDateTime(eventStartIso, timeMode)}</Table.Td>
                    <Table.Td>{formatDateTime(item.next_run_at, timeMode)}</Table.Td>
                    <Table.Td>{computePeriodicity(eventStart, nextRun)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(item.status)} variant="filled">
                        {statusLabel(item.status)}
                      </Badge>
                      {item.last_error && (
                        <Text size="xs" c="red">
                          {item.last_error}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Select
                        placeholder="Default"
                        data={downloaders.map((d) => ({ value: String(d.id), label: `${d.name} (${d.type})` }))}
                        value={item.downloader_id ? String(item.downloader_id) : null}
                        onChange={(val) => handleUpdateDownloader(item, val ? Number(val) : null)}
                        size="xs"
                        clearable
                        disabled={actionLoading[item.id]}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {renderQuality()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          onClick={() => handleRunNow(item)}
                          loading={actionLoading[item.id]}
                          disabled={busy || actionLoading[item.id]}
                        >
                          Search now
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => handleDelete(item)}
                          loading={actionLoading[item.id]}
                          disabled={busy || actionLoading[item.id]}
                        >
                          Delete
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {!scheduled.length && (
                <Table.Tr>
                  <Table.Td colSpan={12}>
                    <Text c="dimmed" size="sm">
                      No scheduled searches yet. Use quick add or the Dashboard to add watchlist entries.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}
