import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
};

const API_BASE =
  import.meta.env.VITE_API_URL ?? `${window.location.origin}/api`;

export function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/logs`);
      if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);
      const data = (await res.json()) as LogEntry[];
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Logs</Title>
        <Badge variant="outline" color="gray">
          Last 50 entries
        </Badge>
      </Group>

      {error && (
        <Alert color="red" title="Error" variant="light">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        {loading && !logs.length ? (
          <Group justify="center">
            <Loader />
          </Group>
        ) : (
          <ScrollArea h={400} type="hover">
            <Table striped highlightOnHover withColumnBorders stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w="30%">Timestamp</Table.Th>
                  <Table.Th w="10%">Level</Table.Th>
                  <Table.Th>Message</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((row, idx) => (
                  <Table.Tr key={`${row.timestamp}-${idx}`}>
                    <Table.Td>{row.timestamp}</Table.Td>
                    <Table.Td>{row.level}</Table.Td>
                    <Table.Td>{row.message}</Table.Td>
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
