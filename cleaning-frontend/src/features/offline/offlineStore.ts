import { useSyncExternalStore } from "react";

import { TASK_STATUSES, type SyncStatusChange, type TaskPage } from "../../api/types";

const QUEUE_PREFIX = "offline_changes:";
const CACHE_PREFIX = "cached_tasks:";

type Listener = () => void;

const listeners = new Set<Listener>();
const snapshots = new Map<string, { raw: string | null; changes: SyncStatusChange[] }>();
const EMPTY: SyncStatusChange[] = [];

function isChange(value: unknown): value is SyncStatusChange {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "status_change" &&
    typeof v.task_id === "string" &&
    typeof v.status === "string" &&
    (TASK_STATUSES as readonly string[]).includes(v.status) &&
    typeof v.timestamp === "string"
  );
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseQueue(raw: string | null): SyncStatusChange[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    const changes = Array.isArray(parsed) ? parsed.filter(isChange) : [];
    return changes.length ? changes : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function pendingChanges(userId: string): SyncStatusChange[] {
  const raw = readRaw(QUEUE_PREFIX + userId);
  const cached = snapshots.get(userId);
  if (cached && cached.raw === raw) return cached.changes;
  const changes = parseQueue(raw);
  snapshots.set(userId, { raw, changes });
  return changes;
}

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function setQueue(userId: string, changes: SyncStatusChange[]): void {
  writeJson(QUEUE_PREFIX + userId, changes.length ? changes : null);
  notify();
}

export function queueStatusChange(userId: string, change: Omit<SyncStatusChange, "type" | "timestamp">): void {
  const others = pendingChanges(userId).filter((c) => c.task_id !== change.task_id);
  setQueue(userId, [...others, { type: "status_change", ...change, timestamp: new Date().toISOString() }]);
}

export function removeChanges(userId: string, submitted: SyncStatusChange[]): void {
  const remaining = pendingChanges(userId).filter(
    (c) => !submitted.some((s) => s.task_id === c.task_id && s.timestamp === c.timestamp),
  );
  setQueue(userId, remaining);
}

export function clearOfflineData(userId: string): void {
  setQueue(userId, []);
  writeJson(CACHE_PREFIX + userId, null);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePendingChanges(userId: string): SyncStatusChange[] {
  return useSyncExternalStore(subscribe, () => pendingChanges(userId));
}

function isTaskPage(value: unknown): value is TaskPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.data) && typeof v.pagination === "object" && v.pagination !== null;
}

export function saveCachedTasks(userId: string, page: TaskPage): void {
  writeJson(CACHE_PREFIX + userId, page);
}

export function loadCachedTasks(userId: string): TaskPage | null {
  const parsed = readJson(CACHE_PREFIX + userId);
  return isTaskPage(parsed) ? parsed : null;
}

function subscribeOnline(listener: Listener): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
