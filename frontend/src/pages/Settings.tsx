import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
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
  Collapse,
  ActionIcon,
  Tooltip,
  Checkbox,
} from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
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

type SearchSettings = {
  min_resolution: number;
  max_resolution: number;
  allow_hdr: boolean;
  preferred_codecs: string[];
  preferred_groups: string[];
  auto_download_threshold: number;
  default_downloader_id: number | null;
  event_allowlist: string[];
};

type NotificationTarget = {
  type: string;
  url: string;
  name?: string | null;
  events?: string[];
};

type NotificationTestResult = {
  index: number;
  ok: boolean;
  error?: string | null;
};

type NotificationTargetCreate = {
  type: string;
  url: string;
  name?: string;
  secret?: string;
  events?: string[];
};

type NotificationTargetsResponse = {
  targets: NotificationTarget[];
};

type NotificationTestResponse = {
  ok: boolean;
  errors: string[];
  results?: NotificationTestResult[];
};

const stopKeyProp = (e: React.KeyboardEvent<HTMLInputElement>) => {
  e.stopPropagation();
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
    event.stopImmediatePropagation?.();
    return;
  }

  if (event.key === "Backspace" && !inTextField) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
};

const parseCsvList = (raw: string) => raw.split(",").map((part) => part.trim()).filter(Boolean);

const baseResolutionOptions = [
  { value: "720", label: "720p" },
  { value: "1080", label: "1080p" },
  { value: "2160", label: "2160p (4K)" },
];

const resolutionOptions = (current: number | null | undefined) => {
  if (current && !baseResolutionOptions.some((opt) => opt.value === String(current))) {
    return [{ value: String(current), label: `${current}p (custom)` }, ...baseResolutionOptions];
  }
  return baseResolutionOptions;
};

const eventTypeOptions = [
  { value: "race", label: "Race" },
  { value: "qualifying", label: "Qualifying" },
  { value: "sprint", label: "Sprint" },
  { value: "sprint-qualifying", label: "Sprint Qualifying" },
  { value: "fp1", label: "FP1" },
  { value: "fp2", label: "FP2" },
  { value: "fp3", label: "FP3" },
  { value: "other", label: "Other" },
];

const notificationTypeOptions = [
  { value: "apprise", label: "Apprise URL" },
  { value: "webhook", label: "Webhook" },
];

const notificationEventOptions = [
  { value: "download-start", label: "Download start" },
  { value: "download-complete", label: "Download complete" },
  { value: "download-fail", label: "Download fail" },
];

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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [searchSettings, setSearchSettings] = useState<SearchSettings | null>(null);
  const [searchSettingsLoading, setSearchSettingsLoading] = useState(false);
  const [searchSettingsSaving, setSearchSettingsSaving] = useState(false);
  const [notificationTargets, setNotificationTargets] = useState<NotificationTarget[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationDeletingIndex, setNotificationDeletingIndex] = useState<number | null>(null);
  const [editingNotificationIndex, setEditingNotificationIndex] = useState<number | null>(null);
  const [editNotificationPayload, setEditNotificationPayload] = useState<NotificationTargetCreate | null>(null);
  const [notificationSavingIndex, setNotificationSavingIndex] = useState<number | null>(null);
  const [notificationTesting, setNotificationTesting] = useState(false);
  const [notificationTestingIndex, setNotificationTestingIndex] = useState<number | null>(null);
  const [newNotificationTarget, setNewNotificationTarget] = useState<NotificationTargetCreate>({
    type: "apprise",
    url: "",
    name: "",
    secret: "",
    events: notificationEventOptions.map((opt) => opt.value),
  });
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReplaceExisting, setImportReplaceExisting] = useState(false);
  const [importPreserveExistingSecrets, setImportPreserveExistingSecrets] = useState(true);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
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

  const loadSearchSettings = async () => {
    setSearchSettingsLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/settings/search`);
      if (!res.ok) throw new Error(`Failed to load search settings (${res.status})`);
      const data = (await res.json()) as SearchSettings;
      setSearchSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSearchSettingsLoading(false);
    }
  };

  useEffect(() => {
    loadIndexers();
    loadDownloaders();
    loadLogLevel();
    loadAbout();
    loadSearchSettings();
    loadNotificationTargets();
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
      alert("Password updated. Please sign in again.");
      await logout();
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

  const saveSearchSettings = async () => {
    if (!searchSettings) return;
    if (searchSettings.min_resolution > searchSettings.max_resolution) {
      setError("Min resolution cannot exceed max resolution");
      return;
    }
    setSearchSettingsSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/settings/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchSettings),
      });
      if (!res.ok) throw new Error(`Failed to update search settings (${res.status})`);
      const data = (await res.json()) as SearchSettings;
      setSearchSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSearchSettingsSaving(false);
    }
  };

  const updateCsvSetting = (key: "preferred_codecs" | "preferred_groups", raw: string) => {
    const parsed = parseCsvList(raw);
    setSearchSettings((prev) => (prev ? { ...prev, [key]: parsed } : prev));
  };

  const copyAbout = async () => {
    if (!about) return;
    const lines: string[] = [];
    lines.push(`${about.app_name} v${about.app_version}`);
    lines.push(`Python: ${about.python_version}`);
    if (about.git_sha) lines.push(`Git SHA: ${about.git_sha}`);
    if (about.server_started_at) lines.push(`Started: ${about.server_started_at}`);
    if (about.github_url) lines.push(`GitHub: ${about.github_url}`);
    lines.push("");
    lines.push("Backend dependencies:");
    if (about.backend_dependencies.length === 0) {
      lines.push("(none)");
    } else {
      about.backend_dependencies.forEach((dep) => lines.push(`- ${dep.name}: ${dep.version}`));
    }
    lines.push("");
    lines.push("Frontend dependencies:");
    if (about.frontend_dependencies.length === 0) {
      lines.push("(none)");
    } else {
      about.frontend_dependencies.forEach((dep) => lines.push(`- ${dep.name}: ${dep.version}`));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy");
    }
  };

  const exportSettings = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await apiFetch(`/settings/export?include_secrets=${includeSecrets ? "true" : "false"}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const suffix = includeSecrets ? "-with-secrets" : "";
      a.href = url;
      a.download = `racecarr-settings-export${suffix}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setExporting(false);
    }
  };

  const triggerImportSelect = () => {
    setImportSummary(null);
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    setImportFileName(file.name);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiFetch(
        `/settings/import?replace_existing=${importReplaceExisting ? "true" : "false"}&preserve_existing_secrets=${
          importPreserveExistingSecrets ? "true" : "false"
        }`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: parsed }),
        }
      );
      if (!res.ok) throw new Error(`Import failed (${res.status})`);
      const data = await res.json();
      setImportSummary(
        `${data.message} — indexers: ${data.imported_indexers}, downloaders: ${data.imported_downloaders}, targets: ${data.imported_notification_targets}${
          data.warnings && data.warnings.length ? ` (warnings: ${data.warnings.join("; ")})` : ""
        }`
      );
      if (data.log_level) setLogLevel(data.log_level);
      if (data.search) setSearchSettings(data.search);
      loadIndexers();
      loadDownloaders();
      loadNotificationTargets();
      loadSearchSettings();
      loadLogLevel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setImporting(false);
      e.currentTarget.value = "";
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

  const loadNotificationTargets = async () => {
    setNotificationsLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/notifications/targets`);
      if (!res.ok) throw new Error(`Failed to load notification targets (${res.status})`);
      const data = (await res.json()) as NotificationTargetsResponse;
      setNotificationTargets(data.targets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const resetNotificationForm = () => {
    setNewNotificationTarget({
      type: "apprise",
      url: "",
      name: "",
      secret: "",
      events: notificationEventOptions.map((opt) => opt.value),
    });
  };

  const startEditNotification = (index: number) => {
    const target = notificationTargets[index];
    if (!target) return;
    setEditingNotificationIndex(index);
    setEditNotificationPayload({
      type: target.type,
      url: target.url,
      name: target.name || "",
      secret: "",
      events: target.events && target.events.length ? target.events : notificationEventOptions.map((opt) => opt.value),
    });
  };

  const cancelEditNotification = () => {
    setEditingNotificationIndex(null);
    setEditNotificationPayload(null);
  };

  const saveEditNotification = async () => {
    if (editingNotificationIndex === null || !editNotificationPayload) return;
    setNotificationSavingIndex(editingNotificationIndex);
    setError(null);
    try {
      // Delete old entry
      const del = await apiFetch(`/notifications/targets/${editingNotificationIndex}`, { method: "DELETE" });
      if (!del.ok) throw new Error(`Failed to update notification target (${del.status})`);

      // Add updated entry
      const add = await apiFetch(`/notifications/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editNotificationPayload.type,
          url: editNotificationPayload.url,
          name: editNotificationPayload.name?.trim() || null,
          secret: editNotificationPayload.secret ? editNotificationPayload.secret : null,
        }),
      });
      if (!add.ok) throw new Error(`Failed to update notification target (${add.status})`);
      const data = (await add.json()) as NotificationTargetsResponse;
      setNotificationTargets(data.targets || []);
      cancelEditNotification();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      // Reload to avoid inconsistencies if only the delete succeeded
      loadNotificationTargets();
    } finally {
      setNotificationSavingIndex(null);
    }
  };

  const addNotificationTarget = async () => {
    if (!newNotificationTarget.url) return;
    setNotificationSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/notifications/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newNotificationTarget.type,
          url: newNotificationTarget.url,
          name: newNotificationTarget.name?.trim() || null,
          secret: newNotificationTarget.secret ? newNotificationTarget.secret : null,
          events: newNotificationTarget.events || [],
        }),
      });
      if (!res.ok) throw new Error(`Failed to add notification target (${res.status})`);
      const data = (await res.json()) as NotificationTargetsResponse;
      setNotificationTargets(data.targets || []);
      resetNotificationForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setNotificationSaving(false);
    }
  };

  const deleteNotificationTarget = async (index: number) => {
    setNotificationDeletingIndex(index);
    setError(null);
    try {
      const res = await apiFetch(`/notifications/targets/${index}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete notification target (${res.status})`);
      setNotificationTargets((prev) => prev.filter((_, i) => i !== index));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setNotificationDeletingIndex(null);
    }
  };

  const testNotifications = async () => {
    setNotificationTesting(true);
    setError(null);
    try {
      const res = await apiFetch(`/notifications/test`, { method: "POST" });
      if (!res.ok) throw new Error(`Notification test failed (${res.status})`);
      const data = (await res.json()) as NotificationTestResponse;
      const results = data.results || [];
      const failures = results.filter((r) => !r.ok);
      if (data.ok) {
        alert("All notification targets succeeded");
      } else if (failures.length) {
        const detail = failures.map((r) => `Target ${r.index + 1}: ${r.error || "Unknown error"}`).join("; ");
        alert(`Notification test failed: ${detail}`);
      } else {
        const detail = data.errors.length ? data.errors.join("; ") : "Unknown error";
        alert(`Notification failed: ${detail}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setNotificationTesting(false);
    }
  };

  const testNotificationTarget = async (index: number) => {
    setNotificationTestingIndex(index);
    setError(null);
    try {
      const res = await apiFetch(`/notifications/test/${index}`, { method: "POST" });
      if (!res.ok) throw new Error(`Notification test failed (${res.status})`);
      const data = (await res.json()) as NotificationTestResponse;
      const result = data.results && data.results[0];
      if (data.ok && (result?.ok ?? true)) {
        alert("Notification sent");
      } else {
        const detail = result?.error || data.errors[0] || "Unknown error";
        alert(`Notification failed: ${detail}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setNotificationTestingIndex(null);
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
              comboboxProps={{ withinPortal: true }}
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
              value={editDownloaderPayload?.priority ?? undefined}
              onChange={(val) =>
                setEditDownloaderPayload((prev) =>
                  prev ? { ...prev, priority: typeof val === "number" ? val : null } : prev
                )
              }
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
        <Group gap="sm" wrap="wrap" align="flex-end">
          <Tooltip label="Single-user password; applies to all sessions" withArrow>
            <PasswordInput
              label="Current password"
              value={pwdCurrent}
              onChange={(e) => setPwdCurrent(e.currentTarget.value)}
              w={300}
            />
          </Tooltip>
          <Tooltip label="Single-user password; applies to all sessions" withArrow>
            <PasswordInput
              label="New password"
              value={pwdNew}
              onChange={(e) => setPwdNew(e.currentTarget.value)}
              w={300}
            />
          </Tooltip>
          <Tooltip label="Single-user password; applies to all sessions" withArrow>
            <PasswordInput
              label="Confirm new password"
              value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.currentTarget.value)}
              w={300}
            />
          </Tooltip>
          <Button type="button" onClick={changePassword} loading={pwdSaving} disabled={!pwdCurrent || !pwdNew || !pwdConfirm}>
            Update password
          </Button>
          <Tooltip label="Ends your current session only" withArrow>
            <Button type="button" variant="outline" color="red" onClick={logout} loading={loggingOut}>
              Log out
            </Button>
          </Tooltip>
        </Group>
      </Paper>

      <input
        type="file"
        accept="application/json"
        ref={importInputRef}
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Backup & Import
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Export your settings to JSON or import them into another instance. Secrets are only included when you choose to include them.
          Exports with secrets contain API keys and webhook secrets in plain text—keep them local and do not upload or share.
        </Text>
        <Stack gap="sm">
          <Group gap="sm" align="center" wrap="wrap">
            <Tooltip label="Include API keys and webhook secrets in the export" withArrow>
              <Switch
                label="Include secrets in export"
                checked={includeSecrets}
                onChange={(e) => setIncludeSecrets(e.currentTarget.checked)}
              />
            </Tooltip>
            <Button type="button" onClick={exportSettings} loading={exporting}>
              Export settings
            </Button>
          </Group>
          <Group gap="sm" align="center" wrap="wrap">
            <Tooltip label="Overwrite existing items instead of merging by name" withArrow>
              <Switch
                label="Replace existing on import"
                checked={importReplaceExisting}
                onChange={(e) => setImportReplaceExisting(e.currentTarget.checked)}
              />
            </Tooltip>
            <Tooltip label="Keep stored secrets when the import omits them" withArrow>
              <Switch
                label="Preserve existing secrets"
                checked={importPreserveExistingSecrets}
                onChange={(e) => setImportPreserveExistingSecrets(e.currentTarget.checked)}
              />
            </Tooltip>
            <Button type="button" variant="light" onClick={triggerImportSelect} loading={importing}>
              {importing ? "Importing..." : "Import from file"}
            </Button>
            <Text size="sm" c="dimmed">
              {importFileName ? `Selected: ${importFileName}` : "No file selected"}
            </Text>
          </Group>
          {importSummary && (
            <Text size="sm" c="dimmed">
              {importSummary}
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Logging
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Choose the minimum log level for API and scheduler output. Changes apply immediately and persist.
        </Text>
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Tooltip label="Applies immediately to API and scheduler logs" withArrow>
            <Select
              label="Log level"
              data={logLevels}
              value={logLevel}
              onChange={(val) => val && setLogLevel(val)}
              maw={220}
              disabled={logLevelLoading}
            />
          </Tooltip>
          <Button type="button" onClick={saveLogLevel} loading={logLevelLoading}>
            Save log level
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" align="center" mb="sm">
          <Title order={4}>Notifications</Title>
          <Group gap="xs">
            <Tooltip label="Sends a sample notification to all targets" withArrow>
              <Button
                size="xs"
                variant="light"
                onClick={testNotifications}
                loading={notificationTesting}
                disabled={!notificationTargets.length}
                type="button"
              >
                Send test
              </Button>
            </Tooltip>
            <Button
              size="xs"
              variant="subtle"
              onClick={loadNotificationTargets}
              loading={notificationsLoading}
              type="button"
            >
              Reload
            </Button>
          </Group>
        </Group>
        <Text size="sm" c="dimmed" mb="sm">
          Send alerts through Apprise URLs (e.g. Discord, Slack, email) or a simple webhook. Secrets are only sent when creating a webhook target. For service examples, see the
          {" "}
          <Anchor href="https://appriseit.com/services/" target="_blank" rel="noreferrer">
            Apprise service list
          </Anchor>
          {" "}
          and the
          {" "}
          <Anchor href="https://appriseit.com/services/email/" target="_blank" rel="noreferrer">
            Apprise email guide
          </Anchor>
          .
        </Text>

        <Group wrap="wrap" gap="sm" mb="sm" align="flex-end">
          <Tooltip label="Apprise supports many services (Discord/Slack/email/etc.)" withArrow>
            <Select
              label="Type"
              data={notificationTypeOptions}
              value={newNotificationTarget.type}
              onChange={(val) => setNewNotificationTarget((prev) => ({ ...prev, type: val || "apprise" }))}
              maw={200}
              comboboxProps={{ withinPortal: true }}
            />
          </Tooltip>
          <TextInput
            label="Name (optional)"
            placeholder="Discord, Slack, Webhook"
            value={newNotificationTarget.name || ""}
            onChange={(e) => setNewNotificationTarget((prev) => ({ ...prev, name: e.currentTarget.value }))}
            maw={220}
            onKeyDown={stopKeyProp}
          />
          <Tooltip
            label={newNotificationTarget.type === "webhook" ? "POST webhook endpoint; optional secret header below" : "Paste the full Apprise URL (see docs links above)"}
            withArrow
          >
            <TextInput
              label={newNotificationTarget.type === "webhook" ? "Webhook URL" : "Apprise URL"}
              placeholder={newNotificationTarget.type === "webhook" ? "https://example.com/webhook" : "discord://token"}
              value={newNotificationTarget.url}
              onChange={(e) => setNewNotificationTarget((prev) => ({ ...prev, url: e.currentTarget.value }))}
              w="min(720px, 100%)"
              miw={360}
              onKeyDown={stopKeyProp}
            />
          </Tooltip>
          {newNotificationTarget.type === "webhook" && (
            <PasswordInput
              label="Secret (optional)"
              placeholder="Shared secret header"
              value={newNotificationTarget.secret || ""}
              onChange={(e) => setNewNotificationTarget((prev) => ({ ...prev, secret: e.currentTarget.value }))}
              maw={220}
              onKeyDown={stopKeyProp}
              autoComplete="off"
            />
          )}
          <Tooltip label="Choose which events trigger this target" withArrow>
            <Checkbox.Group
              value={newNotificationTarget.events || []}
              onChange={(vals) => setNewNotificationTarget((prev) => ({ ...prev, events: vals }))}
              label="Send for"
            >
              <Group gap="xs">
                {notificationEventOptions.map((opt) => (
                  <Checkbox key={opt.value} value={opt.value} label={opt.label} />
                ))}
              </Group>
            </Checkbox.Group>
          </Tooltip>
          <Button
            type="button"
            onClick={addNotificationTarget}
            loading={notificationSaving}
            disabled={!newNotificationTarget.url}
          >
            Add target
          </Button>
        </Group>

        <Paper withBorder p="xs">
          {notificationsLoading ? (
            <Group justify="center" p="md">
              <Loader />
            </Group>
          ) : notificationTargets.length ? (
            <Table striped highlightOnHover withColumnBorders stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>URL</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {notificationTargets.map((target, index) => (
                  <Table.Tr key={`${target.type}-${index}-${target.url}`}>
                    <Table.Td w={180} miw={160} maw={200}>
                      {editingNotificationIndex === index && editNotificationPayload ? (
                        <Select
                          data={notificationTypeOptions}
                          value={editNotificationPayload.type}
                          onChange={(val) => setEditNotificationPayload((prev) => (prev ? { ...prev, type: val || "apprise" } : prev))}
                          size="xs"
                          w="100%"
                          maw="100%"
                          comboboxProps={{ withinPortal: true }}
                        />
                      ) : (
                        notificationTypeOptions.find((opt) => opt.value === target.type)?.label || target.type
                      )}
                    </Table.Td>
                    <Table.Td w={220} miw={160} maw={240}>
                      {editingNotificationIndex === index && editNotificationPayload ? (
                        <TextInput
                          value={editNotificationPayload.name || ""}
                          onChange={(e) => setEditNotificationPayload((prev) => (prev ? { ...prev, name: e.currentTarget.value } : prev))}
                          size="xs"
                          placeholder="Name"
                          onKeyDown={stopKeyProp}
                          w="100%"
                          maw="100%"
                        />
                      ) : (
                        target.name || "(unnamed)"
                      )}
                    </Table.Td>
                    <Table.Td w={420} miw={360} maw={520}>
                      {editingNotificationIndex === index && editNotificationPayload ? (
                        <Stack gap={4} w="100%">
                          <TextInput
                            value={editNotificationPayload.url}
                            onChange={(e) => setEditNotificationPayload((prev) => (prev ? { ...prev, url: e.currentTarget.value } : prev))}
                            size="xs"
                            placeholder={editNotificationPayload.type === "webhook" ? "https://example.com/webhook" : "apprise://"}
                            onKeyDown={stopKeyProp}
                            w="100%"
                            maw="100%"
                          />
                          {editNotificationPayload.type === "webhook" && (
                            <PasswordInput
                              value={editNotificationPayload.secret || ""}
                              onChange={(e) => setEditNotificationPayload((prev) => (prev ? { ...prev, secret: e.currentTarget.value } : prev))}
                              size="xs"
                              placeholder="Secret (optional)"
                              onKeyDown={stopKeyProp}
                              autoComplete="off"
                              w="100%"
                              maw="100%"
                            />
                          )}
                          <Checkbox.Group
                            value={editNotificationPayload.events || []}
                            onChange={(vals) => setEditNotificationPayload((prev) => (prev ? { ...prev, events: vals } : prev))}
                            label="Send for"
                          >
                            <Group gap="xs">
                              {notificationEventOptions.map((opt) => (
                                <Checkbox key={opt.value} value={opt.value} label={opt.label} />
                              ))}
                            </Group>
                          </Checkbox.Group>
                        </Stack>
                      ) : (
                        <Stack gap={4} w="100%">
                          <Text size="sm">{target.url}</Text>
                          <Group gap="xs" wrap="wrap">
                            {(target.events && target.events.length ? target.events : notificationEventOptions.map((opt) => opt.value)).map((ev) => {
                              const label = notificationEventOptions.find((o) => o.value === ev)?.label || ev;
                              return (
                                <Badge key={ev} variant="light" color="gray">
                                  {label}
                                </Badge>
                              );
                            })}
                          </Group>
                        </Stack>
                      )}
                    </Table.Td>
                    <Table.Td w={200} miw={160} maw={220}>
                      <Group gap="xs">
                        {editingNotificationIndex === index ? (
                          <>
                            <Button
                              size="xs"
                              variant="filled"
                              onClick={saveEditNotification}
                              loading={notificationSavingIndex === index}
                              type="button"
                            >
                              Save
                            </Button>
                            <Button size="xs" variant="default" onClick={cancelEditNotification} type="button">
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => testNotificationTarget(index)}
                              loading={notificationTestingIndex === index}
                              disabled={notificationTesting}
                              type="button"
                            >
                              Test
                            </Button>
                            <Button size="xs" variant="default" onClick={() => startEditNotification(index)} type="button">
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="subtle"
                              onClick={() => deleteNotificationTarget(index)}
                              loading={notificationDeletingIndex === index}
                              type="button"
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" p="md">
              No notification targets yet. Add an Apprise URL or webhook above.
            </Text>
          )}
        </Paper>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Search & Quality
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Control scoring preferences and the auto-download threshold used on search results.
        </Text>
        {searchSettingsLoading ? (
          <Group justify="center">
            <Loader size="sm" />
          </Group>
        ) : searchSettings ? (
          <Stack gap="sm">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Tooltip label="Auto-downloads stay at or above this" withArrow position="top" withinPortal={false}>
                <Select
                  label="Min resolution"
                  data={resolutionOptions(searchSettings.min_resolution)}
                  value={String(searchSettings.min_resolution)}
                  onChange={(val) =>
                    setSearchSettings((prev) =>
                      prev ? { ...prev, min_resolution: val ? Number(val) : prev.min_resolution } : prev
                    )
                  }
                  maw={180}
                  comboboxProps={{ withinPortal: true }}
                />
              </Tooltip>
              <Tooltip label="Auto-downloads cap at this resolution" withArrow position="top" withinPortal={false}>
                <Select
                  label="Max resolution"
                  data={resolutionOptions(searchSettings.max_resolution)}
                  value={String(searchSettings.max_resolution)}
                  onChange={(val) =>
                    setSearchSettings((prev) =>
                      prev ? { ...prev, max_resolution: val ? Number(val) : prev.max_resolution } : prev
                    )
                  }
                  maw={180}
                  comboboxProps={{ withinPortal: true }}
                />
              </Tooltip>
              <Tooltip label="Score required before auto-send will fire" withArrow position="top" withinPortal={false}>
                <NumberInput
                  label="Auto-download threshold"
                  description="Score required to auto-send the best result"
                  value={searchSettings.auto_download_threshold}
                  onChange={(val) =>
                    setSearchSettings((prev) =>
                      prev
                        ? { ...prev, auto_download_threshold: typeof val === "number" ? val : prev.auto_download_threshold }
                        : prev
                    )
                  }
                  min={0}
                  max={200}
                  allowDecimal={false}
                  maw={220}
                />
              </Tooltip>
            </Group>
            <Tooltip
              label="Unchecked types are hidden and never sent"
              withArrow
              position="top-start"
              withinPortal={false}
              offset={6}
            >
              <div style={{ display: "inline-block" }}>
                <Checkbox.Group
                  label="Allowed event types"
                  description="Unchecked types are hidden and never sent (manual or automatic)"
                  value={searchSettings.event_allowlist || []}
                  onChange={(vals) => setSearchSettings((prev) => (prev ? { ...prev, event_allowlist: vals } : prev))}
                >
                  <Group gap="sm">
                    {eventTypeOptions.map((opt) => (
                      <Checkbox key={opt.value} value={opt.value} label={opt.label} />
                    ))}
                  </Group>
                </Checkbox.Group>
              </div>
            </Tooltip>
            <Group gap="sm" align="center" wrap="wrap">
              <Tooltip label="Permit HDR releases when available" withArrow position="top" withinPortal={false}>
                <Switch
                  label="Allow HDR releases"
                  checked={searchSettings.allow_hdr}
                  onChange={(e) =>
                    setSearchSettings((prev) => (prev ? { ...prev, allow_hdr: e.currentTarget.checked } : prev))
                  }
                />
              </Tooltip>
              <Tooltip label="Used for auto-downloads unless overridden" withArrow position="top" withinPortal={false}>
                <Select
                  label="Default downloader"
                  placeholder="Use first enabled"
                  data={downloaders.map((dl) => ({ value: String(dl.id), label: dl.name }))}
                  value={searchSettings.default_downloader_id ? String(searchSettings.default_downloader_id) : null}
                  onChange={(val) =>
                    setSearchSettings((prev) =>
                      prev ? { ...prev, default_downloader_id: val ? Number(val) : null } : prev
                    )
                  }
                  clearable
                  maw={240}
                  comboboxProps={{ withinPortal: true }}
                />
              </Tooltip>
            </Group>
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Tooltip label="Comma-separated; boosts these codecs in scoring" withArrow position="top" withinPortal={false}>
                <TextInput
                  label="Preferred codecs (comma-separated)"
                  placeholder="x265, HEVC, H.265"
                  value={searchSettings.preferred_codecs.join(", ")}
                  onChange={(e) => updateCsvSetting("preferred_codecs", e.currentTarget.value)}
                  maw={340}
                />
              </Tooltip>
              <Tooltip label="Comma-separated; boosts these groups in scoring" withArrow position="top" withinPortal={false}>
                <TextInput
                  label="Preferred release groups (comma-separated)"
                  placeholder="NTb, DON"
                  value={searchSettings.preferred_groups.join(", ")}
                  onChange={(e) => updateCsvSetting("preferred_groups", e.currentTarget.value)}
                  maw={340}
                />
              </Tooltip>
            </Group>
            <Group gap="sm">
              <Button type="button" onClick={saveSearchSettings} loading={searchSettingsSaving}>
                Save search settings
              </Button>
              <Button type="button" variant="light" onClick={loadSearchSettings} disabled={searchSettingsSaving}>
                Reload
              </Button>
            </Group>
          </Stack>
        ) : (
          <Text c="dimmed">Search settings could not be loaded.</Text>
        )}
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" align="center" mb="xs">
          <Title order={4}>About</Title>
          <Group gap="xs">
            <Tooltip label="Copy about info" withArrow>
              <ActionIcon variant="light" aria-label="Copy about info" onClick={copyAbout} disabled={!about}>
                <IconCopy size={16} />
              </ActionIcon>
            </Tooltip>
            <Button size="xs" variant="subtle" onClick={() => setAboutOpen((v) => !v)}>
              {aboutOpen ? "Collapse" : "Expand"}
            </Button>
          </Group>
        </Group>
        {about ? (
          <>
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
            <Collapse in={aboutOpen}>
              <Stack gap="xs" mt="xs">
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
                    {about.frontend_dependencies.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={2}>No dependencies detected</Table.Td>
                      </Table.Tr>
                    ) : (
                      about.frontend_dependencies.map((dep) => (
                        <Table.Tr key={dep.name}>
                          <Table.Td>{dep.name}</Table.Td>
                          <Table.Td>{dep.version}</Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Collapse>
          </>
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
          <Tooltip label="Base URL of your Newznab/Hydra indexer (no trailing /api)" withArrow>
            <TextInput
              label="API URL"
              placeholder="https://api.nzbgeek.info"
              value={newIndexer.api_url}
              onChange={(e) => setNewIndexer({ ...newIndexer, api_url: e.currentTarget.value })}
              maw={320}
              onKeyDown={stopKeyProp}
            />
          </Tooltip>
          <Tooltip label="Get this from your indexer account/API settings" withArrow>
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
          </Tooltip>
          <Tooltip label="Optional category number for filtering results" withArrow>
            <TextInput
              label="Category"
              placeholder="optional, e.g. 5030"
              value={newIndexer.category || ""}
              onChange={(e) => setNewIndexer({ ...newIndexer, category: e.currentTarget.value })}
              maw={200}
              onKeyDown={stopKeyProp}
            />
          </Tooltip>
          <Tooltip label="Include this indexer in searches" withArrow>
            <Switch
              label="Enabled"
              checked={newIndexer.enabled}
              onChange={(e) => setNewIndexer({ ...newIndexer, enabled: e.currentTarget.checked })}
            />
          </Tooltip>
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
          <Tooltip label="Downloader kind (e.g., SABnzbd or NZBGet)" withArrow>
            <Select
              label="Type"
              data={[
                { value: "sabnzbd", label: "SABnzbd" },
                { value: "nzbget", label: "NZBGet" },
              ]}
              value={newDownloader.type}
              onChange={(val) => setNewDownloader({ ...newDownloader, type: val || "sabnzbd" })}
              maw={180}
              comboboxProps={{ withinPortal: true }}
            />
          </Tooltip>
          <Tooltip label="Base URL to the downloader API (include port)" withArrow>
            <TextInput
              label="API URL"
              placeholder="http://sab.example:8080"
              value={newDownloader.api_url}
              onChange={(e) => setNewDownloader({ ...newDownloader, api_url: e.currentTarget.value })}
              maw={320}
              onKeyDown={stopKeyProp}
            />
          </Tooltip>
          <Tooltip label="API key or password from downloader settings" withArrow>
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
          </Tooltip>
          <Tooltip label="Downloader category/label to route F1 downloads" withArrow>
            <TextInput
              label="Category"
              placeholder="optional"
              value={newDownloader.category || ""}
              onChange={(e) => setNewDownloader({ ...newDownloader, category: e.currentTarget.value })}
              maw={200}
              onKeyDown={stopKeyProp}
            />
          </Tooltip>
          <Tooltip label="Optional queue priority (uses downloader default if empty)" withArrow>
            <NumberInput
              label="Priority"
              placeholder="optional"
              value={newDownloader.priority ?? undefined}
              onChange={(val) =>
                setNewDownloader({ ...newDownloader, priority: typeof val === "number" ? val : null })
              }
              allowDecimal={false}
              maw={140}
            />
          </Tooltip>
          <Tooltip label="Use this downloader for sends" withArrow>
            <Switch
              label="Enabled"
              checked={newDownloader.enabled}
              onChange={(e) => setNewDownloader({ ...newDownloader, enabled: e.currentTarget.checked })}
            />
          </Tooltip>
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
