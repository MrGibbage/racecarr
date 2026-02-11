import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  PasswordInput,
} from "@mantine/core";
import { apiFetch } from "../api";

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

type Downloader = {
  id: number;
  name: string;
  type: string;
  api_url: string;
  api_key: string | null;
  category: string | null;
  priority: number | null;
  enabled: boolean;
};

type DownloaderPayload = {
  name: string;
  type: string;
  api_url: string;
  api_key: string | null;
  category: string | null;
  priority: number | null;
  enabled: boolean;
};

type LogLevelResponse = {
  log_level: string;
};

type DependencyVersion = {
  name: string;
  version: string;
};

type AboutResponse = {
  app_name: string;
  app_version: string;
  python_version: string;
  github_url?: string;
  backend_dependencies: DependencyVersion[];
  frontend_dependencies: DependencyVersion[];
  git_sha?: string;
  server_started_at?: string;
};

const stopKeyProp = (e: React.KeyboardEvent<HTMLInputElement>) => {
  e.stopPropagation();
  // @ts-expect-error: stopImmediatePropagation exists on the native event
  e.nativeEvent.stopImmediatePropagation?.();
};

const handleControlledBackspace = (
  e: React.KeyboardEvent<HTMLInputElement>,
  current: string,
  apply: (next: string) => void
) => {
  if (e.key !== "Backspace") return;
  e.preventDefault();
  e.stopPropagation();
  // @ts-expect-error native method exists
  e.nativeEvent.stopImmediatePropagation?.();
  const input = e.currentTarget;
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? start;
  if (start === 0 && end === 0) return;
  const next = current.slice(0, start === end ? start - 1 : start) + current.slice(end);
  apply(next);
  const nextPos = Math.max(0, start === end ? start - 1 : start);
  requestAnimationFrame(() => {
    try {
      input.setSelectionRange(nextPos, nextPos);
    } catch (err) {
      /* ignore selection errors */
    }
  });
};

const stopAllKeysCapture = (e: React.KeyboardEvent) => {
  e.stopPropagation();
  // @ts-expect-error native method exists
  e.nativeEvent.stopImmediatePropagation?.();
};

const blockNavigationKeys = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName.toLowerCase();
  const isEditable = target?.isContentEditable;
  const inTextField = tag === "input" || tag === "textarea" || isEditable;

  // Block refresh/navigation keys globally
  const isRefresh = event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");
  if (isRefresh) {
    event.preventDefault();
    event.stopPropagation();
    // @ts-expect-error native method exists
    event.stopImmediatePropagation?.();
    return;
  }

  if (event.key === "Backspace" && !inTextField) {
    event.preventDefault();
    event.stopPropagation();
    // @ts-expect-error native method exists
    event.stopImmediatePropagation?.();
  }
};

export function Settings() {
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloaderTestingId, setDownloaderTestingId] = useState<number | null>(null);
  const [downloaderSavingId, setDownloaderSavingId] = useState<number | null>(null);
  const [downloaderDeletingId, setDownloaderDeletingId] = useState<number | null>(null);
  const [newIndexer, setNewIndexer] = useState<IndexerPayload>({
    name: "",
    api_url: "",
    api_key: "",
    category: "",
    enabled: true,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPayload, setEditPayload] = useState<IndexerPayload | null>(null);
  const [downloaders, setDownloaders] = useState<Downloader[]>([]);
  const [newDownloader, setNewDownloader] = useState<DownloaderPayload>({
    name: "",
    type: "sabnzbd",
    api_url: "",
    api_key: "",
    category: "",
    priority: null,
    enabled: true,
  });
  const [editingDownloaderId, setEditingDownloaderId] = useState<number | null>(null);
  const [editDownloaderPayload, setEditDownloaderPayload] = useState<DownloaderPayload | null>(null);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logLevel, setLogLevel] = useState("INFO");
  const [logLevelLoading, setLogLevelLoading] = useState(false);
  const [about, setAbout] = useState<AboutResponse | null>(null);
  const logLevels = [
    { value: "TRACE", label: "Trace" },
    { value: "DEBUG", label: "Debug" },
    { value: "INFO", label: "Info" },
    { value: "WARNING", label: "Warning" },
    { value: "ERROR", label: "Error" },
    { value: "CRITICAL", label: "Critical" },
  ];

  useEffect(() => {
    document.addEventListener("keydown", blockNavigationKeys, true);
    return () => document.removeEventListener("keydown", blockNavigationKeys, true);
  }, []);

  const loadIndexers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/indexers`);
      if (!res.ok) throw new Error(`Failed to load indexers (${res.status})`);
      const data = (await res.json()) as Indexer[];
      setIndexers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const loadDownloaders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/downloaders`);
      if (!res.ok) throw new Error(`Failed to load downloaders (${res.status})`);
      const data = (await res.json()) as Downloader[];
      setDownloaders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIndexers();
    loadDownloaders();
    loadLogLevel();
    loadAbout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetNewForm = () => {
    setNewIndexer({ name: "", api_url: "", api_key: "", category: "", enabled: true });
  };

  const createIndexer = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch(`/indexers`, {
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
      const res = await apiFetch(`/indexers/${editingId}`, {
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
      const res = await apiFetch(`/indexers/${id}`, { method: "DELETE" });
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
      const res = await apiFetch(`/indexers/${id}/test`, { method: "POST" });
      if (!res.ok) throw new Error(`Test failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; message: string };
      alert(`${data.ok ? "OK" : "Failed"}: ${data.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTestingId(null);
    }
  };

  const resetDownloaderForm = () => {
    setNewDownloader({ name: "", type: "sabnzbd", api_url: "", api_key: "", category: "", priority: null, enabled: true });
  };

  const createDownloader = async () => {
    setDownloaderSavingId(-1);
    setError(null);
    try {
      const res = await apiFetch(`/downloaders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newDownloader,
          api_key: newDownloader.api_key || null,
          category: newDownloader.category || null,
          priority: newDownloader.priority ?? null,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const created = (await res.json()) as Downloader;
      setDownloaders((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      resetDownloaderForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloaderSavingId(null);
    }
  };

  const startEditDownloader = (item: Downloader) => {
    setEditingDownloaderId(item.id);
    setEditDownloaderPayload({
      name: item.name,
      type: item.type,
      api_url: item.api_url,
      api_key: item.api_key || "",
      category: item.category || "",
      priority: item.priority ?? null,
      enabled: item.enabled,
    });
  };

  const cancelEditDownloader = () => {
    setEditingDownloaderId(null);
    setEditDownloaderPayload(null);
  };

  const saveDownloader = async () => {
    if (!editingDownloaderId || !editDownloaderPayload) return;
    setDownloaderSavingId(editingDownloaderId);
    setError(null);
    try {
      const res = await apiFetch(`/downloaders/${editingDownloaderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editDownloaderPayload,
          api_key: editDownloaderPayload.api_key || null,
          category: editDownloaderPayload.category || null,
          priority: editDownloaderPayload.priority ?? null,
        }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      const updated = (await res.json()) as Downloader;
      setDownloaders((prev) => prev.map((d) => (d.id === updated.id ? updated : d)).sort((a, b) => a.name.localeCompare(b.name)));
      cancelEditDownloader();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloaderSavingId(null);
    }
  };

  const deleteDownloader = async (id: number) => {
    setDownloaderDeletingId(id);
    setError(null);
    try {
      const res = await apiFetch(`/downloaders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setDownloaders((prev) => prev.filter((d) => d.id !== id));
      if (editingDownloaderId === id) cancelEditDownloader();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloaderDeletingId(null);
    }
  };

  const testDownloader = async (id: number) => {
    setDownloaderTestingId(id);
    setError(null);
    try {
      const res = await apiFetch(`/downloaders/${id}/test`, { method: "POST" });
      if (!res.ok) throw new Error(`Test failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; message: string };
      alert(`${data.ok ? "OK" : "Failed"}: ${data.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloaderTestingId(null);
    }
  };

  const changePassword = async () => {
    if (pwdNew !== pwdConfirm) {
      setError("New passwords do not match");
      return;
    }
    setPwdSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: pwdCurrent, new_password: pwdNew }),
      });
      if (!res.ok) throw new Error(`Password change failed (${res.status})`);
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
      alert("Password updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPwdSaving(false);
    }
  };

  const loadLogLevel = async () => {
    setLogLevelLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/settings/log-level`);
      if (!res.ok) throw new Error(`Failed to load log level (${res.status})`);
      const data = (await res.json()) as LogLevelResponse;
      setLogLevel(data.log_level);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLogLevelLoading(false);
    }
  };

  const saveLogLevel = async () => {
    setLogLevelLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/settings/log-level`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_level: logLevel }),
      });
      if (!res.ok) throw new Error(`Failed to update log level (${res.status})`);
      const data = (await res.json()) as LogLevelResponse;
      setLogLevel(data.log_level);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLogLevelLoading(false);
    }
  };

  const loadAbout = async () => {
    setError(null);
    try {
      const res = await apiFetch(`/settings/about`);
      if (!res.ok) throw new Error(`Failed to load about info (${res.status})`);
      const data = (await res.json()) as AboutResponse;
      setAbout(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    setError(null);
    try {
      const res = await apiFetch(`/auth/logout`, { method: "POST" });
      if (!res.ok) throw new Error(`Logout failed (${res.status})`);
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoggingOut(false);
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
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditPayload((prev) => (prev ? { ...prev, name: val } : prev));
              }}
              placeholder="Name"
              size="xs"
              onKeyDown={stopKeyProp}
            />
          ) : (
            ix.name
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.api_url || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditPayload((prev) => (prev ? { ...prev, api_url: val } : prev));
              }}
              placeholder="https://indexer.example"
              size="xs"
              onKeyDown={stopKeyProp}
            />
          ) : (
            ix.api_url
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.api_key || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditPayload((prev) => (prev ? { ...prev, api_key: val } : prev));
              }}
              placeholder="API key"
              size="xs"
              onKeyDown={(e) => {
                stopKeyProp(e);
                handleControlledBackspace(e, editPayload?.api_key || "", (next) =>
                  setEditPayload((prev) => (prev ? { ...prev, api_key: next } : prev))
                );
              }}
              autoComplete="off"
              type="text"
            />
          ) : (
            ix.api_key ? "••••" : "(none)"
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editPayload?.category || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditPayload((prev) => (prev ? { ...prev, category: val } : prev));
              }}
              placeholder="e.g. 5030"
              size="xs"
              onKeyDown={stopKeyProp}
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
                <Button size="xs" variant="filled" onClick={saveEdit} loading={savingId === ix.id} type="button">
                  Save
                </Button>
                <Button size="xs" variant="default" onClick={cancelEdit} type="button">
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="xs" variant="default" onClick={() => startEdit(ix)} type="button">
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => testIndexer(ix.id)}
                  loading={testingId === ix.id}
                  type="button"
                >
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
              type="button"
            >
              Delete
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  };

  const renderDownloaderRow = (dl: Downloader) => {
    const isEditing = editingDownloaderId === dl.id && editDownloaderPayload;
    return (
      <Table.Tr key={dl.id}>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editDownloaderPayload?.name || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditDownloaderPayload((prev) => (prev ? { ...prev, name: val } : prev));
              }}
              placeholder="Name"
              size="xs"
              onKeyDown={stopKeyProp}
            />
          ) : (
            dl.name
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <Select
              data={[
                { value: "sabnzbd", label: "SABnzbd" },
                { value: "nzbget", label: "NZBGet" },
              ]}
              value={editDownloaderPayload?.type || "sabnzbd"}
              onChange={(val) => setEditDownloaderPayload((prev) => (prev ? { ...prev, type: val || "sabnzbd" } : prev))}
              size="xs"
              withinPortal
            />
          ) : (
            dl.type
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editDownloaderPayload?.api_url || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditDownloaderPayload((prev) => (prev ? { ...prev, api_url: val } : prev));
              }}
              placeholder="http://sab.example:8080"
              size="xs"
              onKeyDown={stopKeyProp}
            />
          ) : (
            dl.api_url
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editDownloaderPayload?.api_key || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditDownloaderPayload((prev) => (prev ? { ...prev, api_key: val } : prev));
              }}
              placeholder="API key or password"
              size="xs"
              onKeyDown={(e) => {
                stopKeyProp(e);
                handleControlledBackspace(e, editDownloaderPayload?.api_key || "", (next) =>
                  setEditDownloaderPayload((prev) => (prev ? { ...prev, api_key: next } : prev))
                );
              }}
              autoComplete="off"
              type="text"
            />
          ) : (
            dl.api_key ? "••••" : "(none)"
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <TextInput
              value={editDownloaderPayload?.category || ""}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditDownloaderPayload((prev) => (prev ? { ...prev, category: val } : prev));
              }}
              placeholder="Category"
              size="xs"
              onKeyDown={stopKeyProp}
            />
          ) : (
            dl.category || "(none)"
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <NumberInput
              value={editDownloaderPayload?.priority ?? null}
              onChange={(val) => setEditDownloaderPayload((prev) => (prev ? { ...prev, priority: val as number | null } : prev))}
              placeholder="Priority"
              size="xs"
              allowDecimal={false}
            />
          ) : (
            dl.priority ?? "(default)"
          )}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <Switch
              checked={!!editDownloaderPayload?.enabled}
              onChange={(e) => setEditDownloaderPayload((prev) => (prev ? { ...prev, enabled: e.currentTarget.checked } : prev))}
              size="xs"
              label="Enabled"
            />
          ) : (
            <Badge color={dl.enabled ? "green" : "gray"} variant="light">
              {dl.enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          <Group gap="xs">
            {isEditing ? (
              <>
                <Button size="xs" variant="filled" onClick={saveDownloader} loading={downloaderSavingId === dl.id} type="button">
                  Save
                </Button>
                <Button size="xs" variant="default" onClick={cancelEditDownloader} type="button">
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="xs" variant="default" onClick={() => startEditDownloader(dl)} type="button">
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => testDownloader(dl.id)}
                  loading={downloaderTestingId === dl.id}
                  type="button"
                >
                  Test
                </Button>
              </>
            )}
            <Button
              size="xs"
              color="red"
              variant="subtle"
              onClick={() => deleteDownloader(dl.id)}
              loading={downloaderDeletingId === dl.id}
              type="button"
            >
              Delete
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  };

  return (
    <Stack gap="md" onKeyDownCapture={stopAllKeysCapture}>
      <Title order={2}>Settings</Title>
      {error && (
        <Alert color="red" title="Error" variant="light">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Security
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Change the single-user password. You will stay signed in after changing.
        </Text>
        <Group gap="sm" wrap="wrap">
          <PasswordInput
            label="Current password"
            value={pwdCurrent}
            onChange={(e) => setPwdCurrent(e.currentTarget.value)}
            maw={240}
          />
          <PasswordInput
            label="New password"
            value={pwdNew}
            onChange={(e) => setPwdNew(e.currentTarget.value)}
            maw={240}
          />
          <PasswordInput
            label="Confirm new password"
            value={pwdConfirm}
            onChange={(e) => setPwdConfirm(e.currentTarget.value)}
            maw={240}
          />
          <Button type="button" onClick={changePassword} loading={pwdSaving} disabled={!pwdCurrent || !pwdNew || !pwdConfirm}>
            Update password
          </Button>
          <Button type="button" variant="outline" color="red" onClick={logout} loading={loggingOut}>
            Log out
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Logging
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Choose the minimum log level for API and scheduler output. Changes apply immediately and persist.
        </Text>
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Log level"
            data={logLevels}
            value={logLevel}
            onChange={(val) => val && setLogLevel(val)}
            maw={220}
            disabled={logLevelLoading}
          />
          <Button type="button" onClick={saveLogLevel} loading={logLevelLoading}>
            Save log level
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          About
        </Title>
        {about ? (
          <Stack gap="xs">
            <Group gap="md" wrap="wrap">
              <Text fw={600}>{about.app_name}</Text>
              <Badge variant="light">v{about.app_version}</Badge>
              <Badge variant="outline" color="gray">Python {about.python_version}</Badge>
              {about.git_sha && (
                <Badge variant="outline" color="blue">Git {about.git_sha.slice(0, 7)}</Badge>
              )}
              {about.server_started_at && (
                <Badge variant="outline" color="teal">Started {about.server_started_at}</Badge>
              )}
              {about.github_url && (
                <a href={about.github_url} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              Backend dependencies
            </Text>
            <Table striped withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w="40%">Library</Table.Th>
                  <Table.Th>Version</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {about.backend_dependencies.map((dep) => (
                  <Table.Tr key={dep.name}>
                    <Table.Td>{dep.name}</Table.Td>
                    <Table.Td>{dep.version}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="sm" c="dimmed" mt="sm">
              Frontend dependencies
            </Text>
            <Table striped withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w="40%">Library</Table.Th>
                  <Table.Th>Version</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {about.frontend_dependencies.map((dep) => (
                  <Table.Tr key={dep.name}>
                    <Table.Td>{dep.name}</Table.Td>
                    <Table.Td>{dep.version}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        ) : (
          <Group justify="center">
            <Loader size="sm" />
          </Group>
        )}
      </Paper>

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
            onKeyDown={stopKeyProp}
          />
          <TextInput
            label="API URL"
            placeholder="https://api.nzbgeek.info"
            value={newIndexer.api_url}
            onChange={(e) => setNewIndexer({ ...newIndexer, api_url: e.currentTarget.value })}
            maw={320}
            onKeyDown={stopKeyProp}
          />
          <TextInput
            label="API Key"
            placeholder="Your API key"
            value={newIndexer.api_key || ""}
            onChange={(e) => setNewIndexer({ ...newIndexer, api_key: e.currentTarget.value })}
            maw={280}
            onKeyDown={(e) => {
              stopKeyProp(e);
              handleControlledBackspace(e, newIndexer.api_key || "", (next) =>
                setNewIndexer({ ...newIndexer, api_key: next })
              );
            }}
            autoComplete="off"
            type="text"
          />
          <TextInput
            label="Category"
            placeholder="optional, e.g. 5030"
            value={newIndexer.category || ""}
            onChange={(e) => setNewIndexer({ ...newIndexer, category: e.currentTarget.value })}
            maw={200}
            onKeyDown={stopKeyProp}
          />
          <Switch
            label="Enabled"
            checked={newIndexer.enabled}
            onChange={(e) => setNewIndexer({ ...newIndexer, enabled: e.currentTarget.checked })}
          />
          <Button
            type="button"
            onClick={createIndexer}
            loading={creating}
            disabled={!newIndexer.name || !newIndexer.api_url}
          >
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

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Downloaders
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Add SABnzbd or NZBGet downloaders. Categories and priority are optional; priority follows the downloader defaults if omitted.
        </Text>

        <Group wrap="wrap" gap="sm" mb="sm">
          <TextInput
            label="Name"
            placeholder="SABnzbd"
            value={newDownloader.name}
            onChange={(e) => setNewDownloader({ ...newDownloader, name: e.currentTarget.value })}
            onKeyDown={stopKeyProp}
          />
          <Select
            label="Type"
            data={[
              { value: "sabnzbd", label: "SABnzbd" },
              { value: "nzbget", label: "NZBGet" },
            ]}
            value={newDownloader.type}
            onChange={(val) => setNewDownloader({ ...newDownloader, type: val || "sabnzbd" })}
            maw={180}
            withinPortal
          />
          <TextInput
            label="API URL"
            placeholder="http://sab.example:8080"
            value={newDownloader.api_url}
            onChange={(e) => setNewDownloader({ ...newDownloader, api_url: e.currentTarget.value })}
            maw={320}
            onKeyDown={stopKeyProp}
          />
          <TextInput
            label="API Key / Password"
            placeholder="API key"
            value={newDownloader.api_key || ""}
            onChange={(e) => setNewDownloader({ ...newDownloader, api_key: e.currentTarget.value })}
            maw={240}
            onKeyDown={(e) => {
              stopKeyProp(e);
              handleControlledBackspace(e, newDownloader.api_key || "", (next) =>
                setNewDownloader({ ...newDownloader, api_key: next })
              );
            }}
            autoComplete="off"
            type="text"
          />
          <TextInput
            label="Category"
            placeholder="optional"
            value={newDownloader.category || ""}
            onChange={(e) => setNewDownloader({ ...newDownloader, category: e.currentTarget.value })}
            maw={200}
            onKeyDown={stopKeyProp}
          />
          <NumberInput
            label="Priority"
            placeholder="optional"
            value={newDownloader.priority}
            onChange={(val) => setNewDownloader({ ...newDownloader, priority: val as number | null })}
            allowDecimal={false}
            maw={140}
          />
          <Switch
            label="Enabled"
            checked={newDownloader.enabled}
            onChange={(e) => setNewDownloader({ ...newDownloader, enabled: e.currentTarget.checked })}
          />
          <Button
            type="button"
            onClick={createDownloader}
            loading={downloaderSavingId === -1}
            disabled={!newDownloader.name || !newDownloader.api_url}
          >
            Add downloader
          </Button>
        </Group>

        <Paper withBorder p="xs">
          {loading ? (
            <Group justify="center" p="md">
              <Loader />
            </Group>
          ) : downloaders.length ? (
            <Table striped highlightOnHover withColumnBorders stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>API URL</Table.Th>
                  <Table.Th>API Key</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{downloaders.map(renderDownloaderRow)}</Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" p="md">
              No downloaders yet. Add one to get started.
            </Text>
          )}
        </Paper>
      </Paper>
    </Stack>
  );
}
