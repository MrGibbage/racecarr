import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
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

type LogMeta = {
  path: string;
  exists: boolean;
  size_bytes?: number | null;
  rotation?: string;
  retention?: string;
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
  const [meta, setMeta] = useState<LogMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  const loadMeta = async () => {
    setMetaError(null);
    try {
      const res = await apiFetch(`/logs/meta`);
      if (!res.ok) throw new Error(`Failed to load log metadata (${res.status})`);
      const data = (await res.json()) as LogMeta;
      setMeta(data);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const downloadLog = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      const res = await apiFetch(`/logs/download`);
      if (!res.ok) throw new Error(`Failed to download log (${res.status})`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "app.log";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloading(false);
    }
  };

  const formatSize = (value?: number | null) => {
    if (value === null || value === undefined) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  };

  useEffect(() => {
    loadLogs();
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Logs</Title>
        <Group gap="xs">
          <Badge variant="outline" color="gray">
            Last 50 entries
          </Badge>
          {meta?.path && (
            <CopyButton value={meta.path} timeout={2000}>
              {({ copied, copy }) => (
                <Button size="xs" variant="light" onClick={copy}>
                  {copied ? "Copied path" : "Copy path"}
                </Button>
              )}
            </CopyButton>
          )}
          <Button size="xs" variant="filled" onClick={downloadLog} loading={downloading}>
            Download app.log
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Error" variant="light">
          {error}
        </Alert>
      )}

      {(metaError || downloadError) && (
        <Alert color="red" title="Log access" variant="light">
          {metaError || downloadError}
        </Alert>
      )}

      {meta && (
        <Alert color="blue" variant="light" title="Log file location">
          <Group gap="xs" align="center">
            <Text>{meta.path}</Text>
            {meta.rotation && meta.retention && (
              <Tooltip label={`Rotation: ${meta.rotation}, Retention: ${meta.retention}`}>
                <Badge color="blue" variant="light">
                  Rotation
                </Badge>
              </Tooltip>
            )}
            {meta.size_bytes !== undefined && meta.size_bytes !== null && (
              <Badge color="gray" variant="light">
                {formatSize(meta.size_bytes)}
              </Badge>
            )}
            {!meta.exists && <Badge color="red">Missing</Badge>}
          </Group>
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
                  <Table.Th w="15%">Timestamp</Table.Th>
                  <Table.Th w="5%">Level</Table.Th>
                  <Table.Th w="20%">Message</Table.Th>
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
