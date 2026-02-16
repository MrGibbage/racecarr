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
import { apiFetch } from "../api";

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  module?: string | null;
  function?: string | null;
  line?: number | null;
  extra?: Record<string, unknown> | null;
};

const formatContext = (row: LogEntry) => {
  const parts: string[] = [];
  if (row.module) {
    parts.push(row.line ? `${row.module}:${row.line}` : row.module);
  }
  if (row.function) {
    parts.push(row.function);
  }
  if (row.extra) {
    const extras = Object.entries(row.extra).map(([k, v]) => `${k}=${String(v)}`);
    parts.push(...extras);
  }
  return parts.join(" · ");
};

export function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/logs`);
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
          <ScrollArea h="calc(100vh - 220px)" type="hover">
            <Table striped highlightOnHover withColumnBorders stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w="30%">Timestamp</Table.Th>
                  <Table.Th w="10%">Level</Table.Th>
                  <Table.Th w="35%">Message</Table.Th>
                  <Table.Th>Context</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((row, idx) => (
                  <Table.Tr key={`${row.timestamp}-${idx}`}>
                    <Table.Td>{row.timestamp}</Table.Td>
                    <Table.Td>{row.level}</Table.Td>
                    <Table.Td>{row.message}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatContext(row) || ""}
                      </Text>
                    </Table.Td>
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
