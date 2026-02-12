import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Loader,
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
};

type CachedSearchResponse = {
  results: SearchResult[];
  from_cache: boolean;
  cached_at?: string | null;
  ttl_hours: number;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [refreshingYear, setRefreshingYear] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTitle, setSearchTitle] = useState<string>("");
  const [selectedEventFilter, setSelectedEventFilter] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [activeRound, setActiveRound] = useState<{ season: Season; round: Round } | null>(null);
  const [pendingFilter, setPendingFilter] = useState<string | null>(null);

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

  const fetchSeasons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/seasons`);
      if (!res.ok) throw new Error(`Failed to load seasons (${res.status})`);
      const data = (await res.json()) as Season[];
      setSeasons(data);
      ensureStateForSeasons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const seedDemo = async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await apiFetch(`/demo-seasons`, { method: "POST" });
      if (!res.ok) throw new Error(`Seed failed (${res.status})`);
      const data = (await res.json()) as Season[];
      setSeasons(data);
      ensureStateForSeasons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSeeding(false);
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
        ensureStateForSeasons(merged);
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

  const isPastEvent = (ev: Event) => {
    if (!ev.start_time_utc) return false;
    const dt = new Date(ev.start_time_utc);
    return !Number.isNaN(dt.getTime()) && dt.getTime() <= Date.now();
  };

  const handleRoundSearch = async (season: Season, round: Round, force = false) => {
    const pastEvents = (round.events || []).filter(isPastEvent);
    setActiveRound({ season, round });
    setSearchTitle(`Search: Round ${round.round_number} · ${round.name}`);
    setSearchDrawerOpen(true);
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setUsingCache(false);
    setCachedAt(null);
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
    if (activeRound?.round.id === round.id && searchResults.length) {
      setSearchDrawerOpen(true);
      return;
    }
    setPendingFilter(ev.type);
    await handleRoundSearch(season, round, false);
  };

  useEffect(() => {
    fetchSeasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResults = selectedEventFilter
    ? searchResults.filter((r) => {
        const label = (r.event_label || "Other").toLowerCase();
        return label === selectedEventFilter.toLowerCase();
      })
    : searchResults;

  const renderEvents = (season: Season, round: Round) => {
    if (!round.events?.length) return <Text c="dimmed" size="sm">No events yet.</Text>;
    return (
      <Stack gap={4}>
        {round.events.map((ev, idx) => (
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
                      disabled={searching}
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

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2}>Dashboard</Title>
          <Group gap="xs">
            <Button variant="default" onClick={fetchSeasons} loading={loading}>
              Refresh list
            </Button>
            <Button onClick={seedDemo} loading={seeding}>
              Seed demo seasons
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" title="Error" variant="light">
            {error}
          </Alert>
        )}

        {loading && !seasons.length ? (
          <Group justify="center">
            <Loader />
          </Group>
        ) : seasons.length ? (
          <Stack gap="sm">
            {seasons.map((season) => (
              <Card key={season.id} withBorder padding="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Title order={3}>Season {season.year}</Title>
                    <Text c="dimmed" size="sm">
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
                    <Badge color="blue" variant="light">
                      Active
                    </Badge>
                  </Group>
                </Group>
                {isSeasonExpanded(season.id) && renderRounds(season)}
              </Card>
            ))}
          </Stack>
        ) : (
          <Card withBorder padding="md">
            <Text c="dimmed">No seasons yet. Seed some demo data to get started.</Text>
          </Card>
        )}
      </Stack>

      <Drawer
        opened={searchDrawerOpen}
        onClose={() => setSearchDrawerOpen(false)}
        position="top"
        size="90vh"
        title={searchTitle || "Search results"}
      >
        <Stack gap="sm">
          {searchError && (
            <Alert color="red" title="Search error" variant="light">
              {searchError}
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
                      <Table.Th>NZB</Table.Th>
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
                        <Table.Td>
                          {row.nzb_url ? (
                            <a href={row.nzb_url} target="_blank" rel="noreferrer">
                              Download
                            </a>
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
