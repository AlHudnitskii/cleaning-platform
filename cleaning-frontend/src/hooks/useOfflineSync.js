import { useState, useEffect, useCallback, useRef } from "react";
import client from "../api/client";

const STORAGE_KEY = "offline_changes";
const TASKS_CACHE_KEY = "cached_tasks";

function loadChanges() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveChanges(changes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(changes));
}

function loadCachedTasks() {
  try {
    return JSON.parse(localStorage.getItem(TASKS_CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCachedTasks(tasks) {
  localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(loadChanges().length);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false);

  useEffect(() => {
    const onOnline = () => {
      if (!navigator.onLine) return;
      setIsOnline(true);
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const markOffline = useCallback(() => {
    setIsOnline(false);
  }, []);

  const markOnline = useCallback(() => {
    setIsOnline(true);
  }, []);

  const syncPending = useCallback(async () => {
    if (syncRef.current) return;
    const changes = loadChanges();
    if (changes.length === 0) return;

    syncRef.current = true;
    setSyncing(true);

    try {
      const res = await client.post("/sync/batch", { changes });
      const { synced, errors } = res.data;

      if (errors.length > 0) {
        const failedIds = new Set(
          errors.map((e) => e.change?.task_id).filter(Boolean),
        );
        const remaining = changes.filter((c) => failedIds.has(c.task_id));
        saveChanges(remaining);
        setPendingCount(remaining.length);
      } else {
        saveChanges([]);
        setPendingCount(0);
      }

      markOnline();
      return synced;
    } catch {
      markOffline();
    } finally {
      syncRef.current = false;
      setSyncing(false);
    }
  }, [markOffline, markOnline]);

  const queueStatusChange = useCallback((taskId, status) => {
    const changes = loadChanges();
    const existing = changes.findIndex(
      (c) => c.task_id === taskId && c.type === "status_change",
    );
    const change = {
      type: "status_change",
      task_id: taskId,
      status,
      timestamp: new Date().toISOString(),
    };

    if (existing >= 0) {
      changes[existing] = change;
    } else {
      changes.push(change);
    }

    saveChanges(changes);
    setPendingCount(changes.length);
  }, []);

  return {
    isOnline,
    pendingCount,
    syncing,
    syncPending,
    queueStatusChange,
    markOffline,
    markOnline,
    loadCachedTasks,
    saveCachedTasks,
  };
}
