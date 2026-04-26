import { useState, useEffect, useRef } from "react";
import client from "../api/client";

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

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const [activeTaskId, setActiveTaskId] = useState(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await client.get("/tasks");
      setTasks(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await client.patch(`/tasks/${taskId}/status`, { status: newStatus });
      fetchTasks();
    } catch {}
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeTaskId) return;

    setUploadingId(activeTaskId);
    const formData = new FormData();
    formData.append("photo", file);

    try {
      await client.post(`/tasks/${activeTaskId}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("Фото загружено");
    } catch {
      alert("Ошибка загрузки фото");
    } finally {
      setUploadingId(null);
      setActiveTaskId(null);
    }
  };

  const triggerUpload = (taskId) => {
    setActiveTaskId(taskId);
    fileInputRef.current.click();
  };

  if (loading) return <div style={styles.center}>Загрузка...</div>;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Мои задачи</h1>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handlePhotoUpload}
      />

      {tasks.length === 0 && (
        <div style={styles.empty}>Нет назначенных задач</div>
      )}

      <div style={styles.list}>
        {tasks.map((task) => (
          <div key={task.id} style={styles.card}>
            <div style={styles.cardTop}>
              <div>
                <h3 style={styles.taskTitle}>{task.title}</h3>
                {task.description && (
                  <p style={styles.description}>{task.description}</p>
                )}
                <span style={styles.country}>Страна: {task.country}</span>
              </div>
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

            <div style={styles.actions}>
              <select
                style={styles.select}
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value)}
              >
                <option value="pending">Ожидает</option>
                <option value="in_progress">В работе</option>
                <option value="completed">Выполнено</option>
              </select>
              <button
                style={styles.photoBtn}
                onClick={() => triggerUpload(task.id)}
                disabled={uploadingId === task.id}
              >
                {uploadingId === task.id ? "Загрузка..." : "Загрузить фото"}
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
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: { textAlign: "center", padding: "60px", color: "#888" },
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
  },
  taskTitle: { margin: "0 0 4px", fontSize: "18px", color: "#1a1a2e" },
  description: { margin: "4px 0", color: "#666", fontSize: "14px" },
  country: { fontSize: "12px", color: "#999" },
  badge: {
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  actions: { display: "flex", gap: "12px" },
  select: {
    flex: 1,
    padding: "10px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  photoBtn: {
    padding: "10px 16px",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
};
