import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";

type SearchResult = {
  title: string;
  indexer: string;
  size_mb: number;
  age_days: number;
  seeders: number;
  leechers: number;
  quality: string;
};

const API_BASE = (() => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const origin = window.location.origin;
  if (origin.includes("8080")) return `${origin}/api`;
  return "http://localhost:8000/api";
})();

export function Search() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/search-demo`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as SearchResult[];
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Search</Title>
        <Button variant="default" onClick={loadDemo} loading={loading}>
          Refresh demo results
        </Button>
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
                  <Table.Th>Indexer</Table.Th>
                  <Table.Th>Quality</Table.Th>
                  <Table.Th ta="right">Size (MB)</Table.Th>
                  <Table.Th ta="right">Age (days)</Table.Th>
                  <Table.Th ta="right">Seeders</Table.Th>
                  <Table.Th ta="right">Leechers</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((row) => (
                  <Table.Tr key={row.title}>
                    <Table.Td>{row.title}</Table.Td>
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
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>
    </Stack>
  );
}
