import { useState, useEffect } from "react";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

const STATUS_COLORS = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  completed: "#10b981",
};

const STATUS_LABELS = {
  pending: "Ожидает",
  in_progress: "В работе",
  completed: "Выполнено",
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    country: "DE",
    description: "",
    assigned_to: "",
  });
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTasks();
    if (user.role === "admin") fetchUsers();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await client.get("/tasks");
      setTasks(res.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await client.get("/users");
      setUsers(res.data);
    } catch {}
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        title: form.title,
        country: form.country,
        description: form.description || undefined,
        assigned_to: form.assigned_to || undefined,
      };
      await client.post("/tasks", payload);
      setShowForm(false);
      setForm({ title: "", country: "DE", description: "", assigned_to: "" });
      fetchTasks();
    } catch (err) {
      setError(err.response?.data?.error || "Ошибка создания задачи");
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await client.patch(`/tasks/${taskId}/status`, { status: newStatus });
      fetchTasks();
    } catch {}
  };

  if (loading) return <div style={styles.center}>Загрузка...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Задачи</h1>
        <button
          style={styles.primaryBtn}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Отмена" : "Создать задачу"}
        </button>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h2 style={styles.formTitle}>Новая задача</h2>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleCreate}>
            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Название</label>
                <input
                  style={styles.input}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Clean Room 301"
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Страна</label>
                <select
                  style={styles.input}
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                >
                  <option value="DE">Germany</option>
                  <option value="DK">Denmark</option>
                  <option value="IT">Italy</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Описание</label>
                <input
                  style={styles.input}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Необязательно"
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Назначить (ID cleaner)</label>
                <input
                  style={styles.input}
                  value={form.assigned_to}
                  onChange={(e) =>
                    setForm({ ...form, assigned_to: e.target.value })
                  }
                  placeholder="UUID пользователя"
                />
              </div>
            </div>
            <button style={styles.primaryBtn} type="submit">
              Создать
            </button>
          </form>
        </div>
      )}

      <div style={styles.grid}>
        {tasks.length === 0 && <div style={styles.empty}>Задач пока нет</div>}
        {tasks.map((task) => (
          <div key={task.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.taskTitle}>{task.title}</span>
              <span
                style={{
                  ...styles.badge,
                  background: STATUS_COLORS[task.status] + "20",
                  color: STATUS_COLORS[task.status],
                }}
              >
                {STATUS_LABELS[task.status]}
              </span>
            </div>
            {task.description && (
              <p style={styles.description}>{task.description}</p>
            )}
            <div style={styles.cardMeta}>
              <span style={styles.meta}>Страна: {task.country}</span>
              {task.assigned_to && (
                <span style={styles.meta}>
                  Назначено: {task.assigned_to.slice(0, 8)}...
                </span>
              )}
            </div>
            <div style={styles.cardActions}>
              <select
                style={styles.select}
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value)}
              >
                <option value="pending">Ожидает</option>
                <option value="in_progress">В работе</option>
                <option value="completed">Выполнено</option>
              </select>
            </div>
          </div>
        ))}
      </div>
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
  cardActions: {},
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
};
