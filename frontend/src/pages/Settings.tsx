import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

type Indexer = {
  id: number;
  name: string;
  api_url: string;
  api_key: string | null;
  category: string | null;
  enabled: boolean;
};

type IndexerPayload = {
  name: string;
  api_url: string;
  api_key: string | null;
  category: string | null;
  enabled: boolean;
};

const API_BASE = (() => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const origin = window.location.origin;
  if (origin.includes("8080")) return `${origin}/api`;
  return "http://localhost:8000/api";
})();

export function Settings() {
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [newIndexer, setNewIndexer] = useState<IndexerPayload>({
    name: "",
    api_url: "",
    api_key: "",
    category: "",
    enabled: true,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPayload, setEditPayload] = useState<IndexerPayload | null>(null);

  const loadIndexers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/indexers`);
      if (!res.ok) throw new Error(`Failed to load indexers (${res.status})`);
      const data = (await res.json()) as Indexer[];
      setIndexers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIndexers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetNewForm = () => {
    setNewIndexer({ name: "", api_url: "", api_key: "", category: "", enabled: true });
  };

  const createIndexer = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/indexers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newIndexer,
          api_key: newIndexer.api_key || null,
          category: newIndexer.category || null,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const created = (await res.json()) as Indexer;
      setIndexers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      resetNewForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (item: Indexer) => {
    setEditingId(item.id);
    setEditPayload({
      name: item.name,
      api_url: item.api_url,
      api_key: item.api_key || "",
      category: item.category || "",
      enabled: item.enabled,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPayload(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editPayload) return;
    setSavingId(editingId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/indexers/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editPayload,
          api_key: editPayload.api_key || null,
          category: editPayload.category || null,
        }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      const updated = (await res.json()) as Indexer;
      setIndexers((prev) => prev.map((ix) => (ix.id === updated.id ? updated : ix)).sort((a, b) => a.name.localeCompare(b.name)));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };

  const deleteIndexer = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/indexers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setIndexers((prev) => prev.filter((ix) => ix.id !== id));
      if (editingId === id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  };

  const testIndexer = async (id: number) => {
    setTestingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/indexers/${id}/test`, { method: "POST" });
      if (!res.ok) throw new Error(`Test failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; message: string };
      alert(`${data.ok ? "OK" : "Failed"}: ${data.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTestingId(null);
    }
  };

  const renderRow = (ix: Indexer) => {
    const isEditing = editingId === ix.id && editPayload;
    return (
      <Table.Tr key={ix.id}>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.name || ""}
              onChange={(e) => setEditPayload((prev) => (prev ? { ...prev, name: e.currentTarget.value } : prev))}
              placeholder="Name"
              size="xs"
            />
          ) : (
            ix.name
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.api_url || ""}
              onChange={(e) => setEditPayload((prev) => (prev ? { ...prev, api_url: e.currentTarget.value } : prev))}
              placeholder="https://indexer.example"
              size="xs"
            />
          ) : (
            ix.api_url
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.api_key || ""}
              onChange={(e) => setEditPayload((prev) => (prev ? { ...prev, api_key: e.currentTarget.value } : prev))}
              placeholder="API key"
              size="xs"
            />
          ) : (
            ix.api_key ? "••••" : "(none)"
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.category || ""}
              onChange={(e) => setEditPayload((prev) => (prev ? { ...prev, category: e.currentTarget.value } : prev))}
              placeholder="e.g. 5030"
              size="xs"
            />
          ) : (
            ix.category || "(none)"
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <Switch
              checked={!!editPayload?.enabled}
              onChange={(e) => setEditPayload((prev) => (prev ? { ...prev, enabled: e.currentTarget.checked } : prev))}
              size="xs"
              label="Enabled"
            />
          ) : (
            <Badge color={ix.enabled ? "green" : "gray"} variant="light">
              {ix.enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          <Group gap="xs">
            {isEditing ? (
              <>
                <Button size="xs" variant="filled" onClick={saveEdit} loading={savingId === ix.id}>
                  Save
                </Button>
                <Button size="xs" variant="default" onClick={cancelEdit}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="xs" variant="default" onClick={() => startEdit(ix)}>
                  Edit
                </Button>
                <Button size="xs" variant="light" onClick={() => testIndexer(ix.id)} loading={testingId === ix.id}>
                  Test
                </Button>
              </>
            )}
            <Button
              size="xs"
              color="red"
              variant="subtle"
              onClick={() => deleteIndexer(ix.id)}
              loading={deletingId === ix.id}
            >
              Delete
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  };

  return (
    <Stack gap="md">
      <Title order={2}>Settings</Title>
      {error && (
        <Alert color="red" title="Error" variant="light">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Indexers
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Add Newznab-compatible indexers (URL without trailing /api). Use "Test" to verify caps.
        </Text>

        <Group wrap="wrap" gap="sm" mb="sm">
          <TextInput
            label="Name"
            placeholder="NZBGeek"
            value={newIndexer.name}
            onChange={(e) => setNewIndexer({ ...newIndexer, name: e.currentTarget.value })}
          />
          <TextInput
            label="API URL"
            placeholder="https://api.nzbgeek.info"
            value={newIndexer.api_url}
            onChange={(e) => setNewIndexer({ ...newIndexer, api_url: e.currentTarget.value })}
            maw={320}
          />
          <TextInput
            label="API Key"
            placeholder="Your API key"
            value={newIndexer.api_key || ""}
            onChange={(e) => setNewIndexer({ ...newIndexer, api_key: e.currentTarget.value })}
            maw={280}
          />
          <TextInput
            label="Category"
            placeholder="optional, e.g. 5030"
            value={newIndexer.category || ""}
            onChange={(e) => setNewIndexer({ ...newIndexer, category: e.currentTarget.value })}
            maw={200}
          />
          <Switch
            label="Enabled"
            checked={newIndexer.enabled}
            onChange={(e) => setNewIndexer({ ...newIndexer, enabled: e.currentTarget.checked })}
          />
          <Button onClick={createIndexer} loading={creating} disabled={!newIndexer.name || !newIndexer.api_url}>
            Add indexer
          </Button>
        </Group>

        <Paper withBorder p="xs">
          {loading ? (
            <Group justify="center" p="md">
              <Loader />
            </Group>
          ) : indexers.length ? (
            <Table striped highlightOnHover withColumnBorders stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>API URL</Table.Th>
                  <Table.Th>API Key</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{indexers.map(renderRow)}</Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" p="md">
              No indexers yet. Add one to get started.
            </Text>
          )}
        </Paper>
      </Paper>
    </Stack>
  );
}
