import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSSE } from "../hooks/useSSE";

const STATUS_COLORS = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  completed: "#10b981",
};

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
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

export default function Tasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    country: "DE",
    description: "",
    assigned_to: "",
    rrule: "",
    is_recurring: false,
    priority: "normal",
  });
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "", country: "", page: 1 });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: filters.page, limit: 10 });
      if (filters.status) params.append("status", filters.status);
      if (filters.country) params.append("country", filters.country);
      const res = await client.get(`/tasks?${params}`);
      setTasks(res.data.data);
      setPagination(res.data.pagination);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useSSE((event) => {
    if (event.type === "task_status_changed") {
      fetchTasks();
    }
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        title: form.title,
        country: form.country,
        description: form.description || undefined,
        assigned_to: form.assigned_to || undefined,
        rrule: form.is_recurring && form.rrule ? form.rrule : undefined,
        priority: form.priority,
      };
      await client.post("/tasks", payload);
      setShowForm(false);
      setForm({
        title: "",
        country: "DE",
        description: "",
        assigned_to: "",
        rrule: "",
        is_recurring: false,
        priority: "normal",
      });
      fetchTasks();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create task");
    }
  };

  const handleStatusChange = async (e, taskId) => {
    e.stopPropagation();
    const newStatus = e.target.value;
    try {
      await client.patch(`/tasks/${taskId}/status`, { status: newStatus });
      fetchTasks();
    } catch {}
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Tasks</h1>
        {["admin", "manager"].includes(user.role) && (
          <button
            style={styles.primaryBtn}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Create Task"}
          </button>
        )}
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h2 style={styles.formTitle}>New Task</h2>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleCreate}>
            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Title</label>
                <input
                  style={styles.input}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Clean Room 301"
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Country</label>
                <select
                  style={styles.input}
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                >
                  <option value="">All countries</option>
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="FR">France</option>
                  <option value="ES">Spain</option>
                  <option value="PL">Poland</option>
                  <option value="NL">Netherlands</option>
                  <option value="SE">Sweden</option>
                  <option value="NO">Norway</option>
                  <option value="FI">Finland</option>
                  <option value="CH">Switzerland</option>
                  <option value="AT">Austria</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Description</label>
                <input
                  style={styles.input}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Assign to (Cleaner ID)</label>
                <input
                  style={styles.input}
                  value={form.assigned_to}
                  onChange={(e) =>
                    setForm({ ...form, assigned_to: e.target.value })
                  }
                  placeholder="User UUID"
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Priority</label>
                <select
                  style={styles.input}
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value })
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        is_recurring: e.target.checked,
                        rrule: "",
                      })
                    }
                  />
                  Recurring Task
                </label>
              </div>
              {form.is_recurring && (
                <div style={styles.field}>
                  <label style={styles.label}>Schedule</label>
                  <select
                    style={styles.input}
                    value={form.rrule}
                    onChange={(e) =>
                      setForm({ ...form, rrule: e.target.value })
                    }
                  >
                    <option value="">Select...</option>
                    <option value="FREQ=DAILY">Every day</option>
                    <option value="FREQ=WEEKLY;BYDAY=MO">Every Monday</option>
                    <option value="FREQ=WEEKLY;BYDAY=MO,WE,FR">
                      Mon, Wed, Fri
                    </option>
                    <option value="FREQ=WEEKLY;BYDAY=MO,TH">Mon and Thu</option>
                    <option value="FREQ=WEEKLY">Every week</option>
                    <option value="FREQ=MONTHLY">Every month</option>
                  </select>
                </div>
              )}
            </div>
            <button style={styles.primaryBtn} type="submit">
              Create
            </button>
          </form>
        </div>
      )}

      <div style={styles.filtersRow}>
        <select
          style={styles.filterSelect}
          value={filters.status}
          onChange={(e) => handleFilterChange("status", e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {user.role === "admin" && (
          <select
            style={styles.filterSelect}
            value={filters.country}
            onChange={(e) => handleFilterChange("country", e.target.value)}
          >
            <option value="">All countries</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="FR">France</option>
            <option value="ES">Spain</option>
            <option value="PL">Poland</option>
            <option value="NL">Netherlands</option>
            <option value="SE">Sweden</option>
            <option value="NO">Norway</option>
            <option value="FI">Finland</option>
            <option value="CH">Switzerland</option>
            <option value="AT">Austria</option>
          </select>
        )}
        <span style={styles.totalLabel}>Total: {pagination.total}</span>
      </div>

      {loading ? (
        <div style={styles.center}>Loading...</div>
      ) : (
        <>
          <div style={styles.grid}>
            {tasks.length === 0 && (
              <div style={styles.empty}>No tasks found</div>
            )}
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{ ...styles.card, cursor: "pointer" }}
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <div style={styles.cardHeader}>
                  <span style={styles.taskTitle}>{task.title}</span>
                  <div style={styles.badgeGroup}>
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
                {task.description && (
                  <p style={styles.description}>{task.description}</p>
                )}
                <div style={styles.cardMeta}>
                  <span style={styles.meta}>Country: {task.country}</span>
                  {task.assigned_to && (
                    <span style={styles.meta}>
                      Assigned: {task.assigned_to.slice(0, 8)}...
                    </span>
                  )}
                  {task.is_recurring && (
                    <span style={styles.recurringBadge}>Recurring</span>
                  )}
                </div>
                <select
                  style={styles.select}
                  value={task.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleStatusChange(e, task.id)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div style={styles.pagination}>
              <button
                style={styles.pageBtn}
                disabled={pagination.page === 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Previous
              </button>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(
                (p) => (
                  <button
                    key={p}
                    style={{
                      ...styles.pageBtn,
                      background: p === pagination.page ? "#667eea" : "white",
                      color: p === pagination.page ? "white" : "#667eea",
                    }}
                    onClick={() => handlePageChange(p)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                style={styles.pageBtn}
                disabled={pagination.page === pagination.pages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: { margin: 0, fontSize: "28px", color: "#1a1a2e" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: {
    textAlign: "center",
    padding: "60px",
    color: "#888",
    gridColumn: "1/-1",
  },
  formCard: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  formTitle: { margin: "0 0 16px", fontSize: "18px" },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "16px",
  },
  field: {},
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#555",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#555",
    cursor: "pointer",
    marginTop: "24px",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  error: {
    background: "#fee",
    color: "#c33",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
  },
  filtersRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
    alignItems: "center",
  },
  filterSelect: {
    padding: "8px 12px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  totalLabel: { marginLeft: "auto", color: "#888", fontSize: "14px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "16px",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "8px",
  },
  taskTitle: { fontWeight: "600", fontSize: "16px", color: "#1a1a2e" },
  badgeGroup: { display: "flex", gap: "4px", flexWrap: "wrap" },
  badge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  description: { color: "#666", fontSize: "14px", margin: "8px 0" },
  cardMeta: {
    display: "flex",
    gap: "12px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },
  meta: { fontSize: "12px", color: "#999" },
  recurringBadge: {
    fontSize: "12px",
    color: "#667eea",
    fontWeight: "600",
    background: "#667eea20",
    padding: "2px 8px",
    borderRadius: "10px",
  },
  select: {
    width: "100%",
    padding: "8px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  primaryBtn: {
    padding: "10px 20px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    marginTop: "24px",
  },
  pageBtn: {
    padding: "8px 16px",
    border: "2px solid #667eea",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    background: "white",
    color: "#667eea",
  },
};
