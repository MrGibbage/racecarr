import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
  TextInput,
  Switch,
} from "@mantine/core";
import { apiFetch } from "../api";

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

type Downloader = {
  id: number;
  name: string;
};

export function Search() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaders, setDownloaders] = useState<Downloader[]>([]);
  const [selectedDownloaderId, setSelectedDownloaderId] = useState<string | null>(null);
  const [query, setQuery] = useState("F1");
  const [limit, setLimit] = useState<number>(50);
  const [applyAllowlist, setApplyAllowlist] = useState<boolean>(true);
  const [rawMode, setRawMode] = useState<boolean>(false);

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(limit || 25),
        apply_allowlist: String(applyAllowlist && !rawMode),
        raw: String(rawMode),
      });
      const res = await apiFetch(`/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as SearchResult[];
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const loadDownloaders = async () => {
    try {
      const res = await apiFetch(`/downloaders`);
      if (!res.ok) throw new Error(`Failed to load downloaders (${res.status})`);
      const data = (await res.json()) as Downloader[];
      setDownloaders(data);
      if (!selectedDownloaderId && data.length) setSelectedDownloaderId(String(data[0].id));
    } catch (err) {
      /* ignore downloaders error for demo */
    }
  };

  useEffect(() => {
    runSearch();
    loadDownloaders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Auto-refresh when toggling allowlist without requiring button click
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyAllowlist, rawMode]);

  const sendToDownloader = async (row: SearchResult) => {
    if (!selectedDownloaderId || !row.nzb_url) return;
    const id = selectedDownloaderId;
    try {
      const res = await apiFetch(`/downloaders/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nzb_url: row.nzb_url, title: row.title }),
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; message: string };
      alert(`${data.ok ? "Sent" : "Failed"}: ${data.message}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Send failed");
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Manual Search</Title>
        <Group gap="sm">
          <TextInput
            label="Query"
            placeholder="e.g. 2026 Bahrain Qualifying"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            maw={320}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
          />
          <NumberInput
            label="Limit"
            description="Max results (per merged list)"
            value={limit}
            onChange={(val) => setLimit(Number(val) || 25)}
            min={1}
            max={100}
            maw={160}
          />
          <Switch
            label="Raw indexer search"
            description="Bypass F1 filters/variants"
            checked={rawMode}
            onChange={(e) => {
              const next = e.currentTarget.checked;
              setRawMode(next);
              if (next) setApplyAllowlist(false);
            }}
          />
          <Switch
            label="Filter to F1 event types"
            checked={applyAllowlist}
            onChange={(e) => setApplyAllowlist(e.currentTarget.checked)}
            disabled={rawMode}
          />
          {downloaders.length > 0 && (
            <Select
              label="Downloader"
              data={downloaders.map((d) => ({ value: String(d.id), label: d.name }))}
              value={selectedDownloaderId}
              onChange={setSelectedDownloaderId}
              placeholder="Select downloader"
              maw={220}
              comboboxProps={{ withinPortal: true }}
            />
          )}
          <Button variant="default" onClick={runSearch} loading={loading} disabled={!query.trim()}>
            Search
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Error" variant="light">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        {loading && !results.length ? (
          <Group justify="center">
            <Loader />
          </Group>
        ) : (
          <ScrollArea>
            <Table striped highlightOnHover withColumnBorders stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Indexer</Table.Th>
                  <Table.Th>Quality</Table.Th>
                  <Table.Th ta="right">Size (MB)</Table.Th>
                  <Table.Th ta="right">Age (days)</Table.Th>
                  <Table.Th ta="right">Seeders</Table.Th>
                  <Table.Th ta="right">Leechers</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((row) => (
                  <Table.Tr key={row.title}>
                    <Table.Td>{row.title}</Table.Td>
                    <Table.Td>
                      {row.event_label || row.event_type ? (
                        <Badge color="grape" variant="light">
                          {row.event_label || row.event_type}
                        </Badge>
                      ) : (
                        ""
                      )}
                    </Table.Td>
                    <Table.Td>{row.indexer}</Table.Td>
                    <Table.Td>
                      <Badge color="blue" variant="light">
                        {row.quality}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">{row.size_mb.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{row.age_days}</Table.Td>
                    <Table.Td ta="right">{row.seeders.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{row.leechers.toLocaleString()}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => sendToDownloader(row)}
                        disabled={!row.nzb_url || !selectedDownloaderId}
                      >
                        Send
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {!loading && !results.length && (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text c="dimmed" size="sm">
                        No results yet.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>
    </Stack>
  );
}
