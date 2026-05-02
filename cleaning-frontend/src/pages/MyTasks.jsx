import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useOfflineSync } from "../hooks/useOfflineSync";

const STATUS_COLORS = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  completed: "#10b981",
  on_hold: "#94a3b8",
  cancelled: "#ef4444",
};

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

const PRIORITY_COLORS = {
  low: "#94a3b8",
  normal: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function isNetworkError(err) {
  return (
    !err.response ||
    err.response?.status === 503 ||
    err.response?.data?.offline === true
  );
}

export default function MyTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("priority");

  const {
    isOnline,
    pendingCount,
    syncing,
    syncPending,
    queueStatusChange,
    markOffline,
    markOnline,
    loadCachedTasks,
    saveCachedTasks,
  } = useOfflineSync();

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPending().then(() => fetchTasks());
    }
  }, [isOnline]);

  const fetchTasks = async () => {
    try {
      const res = await client.get("/tasks");
      const data = res.data.data;
      setTasks(data);
      saveCachedTasks(data);
      markOnline();
    } catch (err) {
      console.log(
        "fetchTasks error:",
        err.response?.status,
        err.message,
        err.response?.data,
      );
      if (isNetworkError(err)) {
        markOffline();
        const cached = loadCachedTasks();
        if (cached.length > 0) setTasks(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, status: newStatus } : t,
    );
    setTasks(updated);
    saveCachedTasks(updated);

    try {
      await client.patch(`/tasks/${taskId}/status`, { status: newStatus });
      markOnline();
    } catch (err) {
      if (isNetworkError(err)) {
        markOffline();
        queueStatusChange(taskId, newStatus);
      }
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeTaskId) return;

    if (!isOnline) {
      alert("Photo upload is not available offline");
      setActiveTaskId(null);
      return;
    }

    setUploadingId(activeTaskId);
    const formData = new FormData();
    formData.append("photo", file);

    try {
      await client.post(`/tasks/${activeTaskId}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("Photo uploaded");
    } catch {
      alert("Photo upload error");
    } finally {
      setUploadingId(null);
      setActiveTaskId(null);
    }
  };

  const triggerUpload = (taskId) => {
    setActiveTaskId(taskId);
    fileInputRef.current.click();
  };

  const handleSyncAndRefresh = async () => {
    await syncPending();
    await fetchTasks();
  };

  const filtered = tasks
    .filter((t) => (statusFilter ? t.status === statusFilter : true))
    .sort((a, b) => {
      if (sortBy === "priority")
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  if (loading) return <div style={styles.center}>Loading...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Tasks</h1>
        {!isOnline && (
          <div style={styles.offlineBanner}>
            Offline mode — changes will sync when connection is restored
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div style={styles.syncBanner}>
            {syncing ? "Syncing..." : `${pendingCount} changes pending`}
            {!syncing && (
              <button style={styles.syncBtn} onClick={handleSyncAndRefresh}>
                Sync now
              </button>
            )}
          </div>
        )}
        {isOnline && pendingCount === 0 && !syncing && (
          <div style={styles.onlineBadge}>Online</div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handlePhotoUpload}
      />

      <div style={styles.filtersRow}>
        <select
          style={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>

        <select
          style={styles.filterSelect}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="priority">Sort by priority</option>
          <option value="status">Sort by status</option>
          <option value="date">Sort by date</option>
        </select>

        <span style={styles.totalLabel}>
          {filtered.length} of {tasks.length} tasks
        </span>
      </div>

      {filtered.length === 0 && <div style={styles.empty}>No tasks found</div>}

      <div style={styles.list}>
        {filtered.map((task) => (
          <div key={task.id} style={styles.card}>
            <div style={styles.cardTop}>
              <div
                style={styles.cardInfo}
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <h3 style={styles.taskTitle}>{task.title}</h3>
                {task.description && (
                  <p style={styles.description}>{task.description}</p>
                )}
                <div style={styles.cardMeta}>
                  <span style={styles.metaText}>Country: {task.country}</span>
                  <span style={styles.metaText}>
                    {new Date(task.created_at).toLocaleDateString("en")}
                  </span>
                </div>
              </div>
              <div style={styles.cardBadges}>
                <span
                  style={{
                    ...styles.badge,
                    background: STATUS_COLORS[task.status] + "20",
                    color: STATUS_COLORS[task.status],
                  }}
                >
                  {STATUS_LABELS[task.status]}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    background: PRIORITY_COLORS[task.priority] + "20",
                    color: PRIORITY_COLORS[task.priority],
                  }}
                >
                  {PRIORITY_LABELS[task.priority]}
                </span>
              </div>
            </div>

            <div style={styles.actions}>
              <select
                style={styles.select}
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
              <button
                style={{ ...styles.photoBtn, opacity: !isOnline ? 0.5 : 1 }}
                onClick={() => triggerUpload(task.id)}
                disabled={uploadingId === task.id || !isOnline}
              >
                {uploadingId === task.id ? "Uploading..." : "Upload photo"}
              </button>
              <button
                style={styles.detailBtn}
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "800px", margin: "0 auto" },
  header: { marginBottom: "24px" },
  title: { margin: "0 0 12px", fontSize: "28px", color: "#1a1a2e" },
  offlineBanner: {
    padding: "10px 16px",
    background: "#fef3c7",
    color: "#92400e",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
  },
  syncBanner: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 16px",
    background: "#ede9fe",
    color: "#5b21b6",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
  },
  syncBtn: {
    padding: "4px 12px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  onlineBadge: {
    display: "inline-block",
    padding: "4px 12px",
    background: "#d1fae5",
    color: "#065f46",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
  },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: { textAlign: "center", padding: "60px", color: "#888" },
  filtersRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  filterSelect: {
    padding: "8px 12px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  totalLabel: { marginLeft: "auto", fontSize: "14px", color: "#888" },
  list: { display: "flex", flexDirection: "column", gap: "16px" },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "16px",
    gap: "12px",
  },
  cardInfo: { flex: 1, cursor: "pointer" },
  taskTitle: { margin: "0 0 4px", fontSize: "18px", color: "#1a1a2e" },
  description: { margin: "4px 0 8px", color: "#666", fontSize: "14px" },
  cardMeta: { display: "flex", gap: "12px" },
  metaText: { fontSize: "12px", color: "#999" },
  cardBadges: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    alignItems: "flex-end",
    flexShrink: 0,
  },
  badge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  actions: { display: "flex", gap: "10px" },
  select: {
    flex: 1,
    padding: "10px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  photoBtn: {
    padding: "10px 14px",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  detailBtn: {
    padding: "10px 14px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
