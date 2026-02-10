import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";

type Season = {
  id: number;
  year: number;
  last_refreshed: string | null;
};

const API_BASE =
  import.meta.env.VITE_API_URL ?? `${window.location.origin}/api`;

export function Dashboard() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const fetchSeasons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/seasons`);
      if (!res.ok) throw new Error(`Failed to load seasons (${res.status})`);
      const data = (await res.json()) as Season[];
      setSeasons(data);
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
      const res = await fetch(`${API_BASE}/demo-seasons`, { method: "POST" });
      if (!res.ok) throw new Error(`Seed failed (${res.status})`);
      const data = (await res.json()) as Season[];
      setSeasons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchSeasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seasonCards = useMemo(
    () =>
      seasons.map((season) => (
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
            <Badge color="blue" variant="light">
              Active
            </Badge>
          </Group>
        </Card>
      )),
    [seasons]
  );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Dashboard</Title>
        <Group gap="xs">
          <Button variant="default" onClick={fetchSeasons} loading={loading}>
            Refresh
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
        <Stack gap="sm">{seasonCards}</Stack>
      ) : (
        <Card withBorder padding="md">
          <Text c="dimmed">No seasons yet. Seed some demo data to get started.</Text>
        </Card>
      )}
    </Stack>
  );
}
