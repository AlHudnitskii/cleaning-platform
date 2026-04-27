import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

const ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  cleaner: "Cleaner",
};

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [taskRes, commentsRes] = await Promise.all([
        client.get(`/tasks/${id}`),
        client.get(`/tasks/${id}/comments`),
      ]);
      setTask(taskRes.data);
      setComments(commentsRes.data);

      if (taskRes.data.is_recurring) {
        const occRes = await client.get(`/tasks/${id}/occurrences`);
        setOccurrences(occRes.data.next_occurrences);
      }
    } catch {
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await client.patch(`/tasks/${id}/status`, {
        status: newStatus,
      });
      setTask(res.data);
    } catch {}
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const res = await client.post(`/tasks/${id}/comments`, {
        text: commentText,
      });
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={styles.center}>Загрузка...</div>;
  if (!task) return null;

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={() => navigate(-1)}>
        Назад
      </button>

      <div style={styles.grid}>
        <div style={styles.left}>
          <div style={styles.card}>
            <div style={styles.taskHeader}>
              <h1 style={styles.taskTitle}>{task.title}</h1>
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

            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Страна</span>
                <span style={styles.metaValue}>{task.country}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Создана</span>
                <span style={styles.metaValue}>
                  {new Date(task.created_at).toLocaleString("ru")}
                </span>
              </div>
              {task.is_recurring && (
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Повторение</span>
                  <span style={{ ...styles.metaValue, color: "#667eea" }}>
                    {task.rrule}
                  </span>
                </div>
              )}
            </div>

            <div style={styles.statusSection}>
              <label style={styles.metaLabel}>Изменить статус</label>
              <select
                style={styles.select}
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="pending">Ожидает</option>
                <option value="in_progress">В работе</option>
                <option value="completed">Выполнено</option>
              </select>
            </div>
          </div>

          {task.is_recurring && occurrences.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Следующие вхождения</h2>
              <div style={styles.occurrencesList}>
                {occurrences.map((date, i) => (
                  <div key={i} style={styles.occurrenceItem}>
                    <span style={styles.occurrenceNum}>{i + 1}</span>
                    <span style={styles.occurrenceDate}>
                      {new Date(date).toLocaleString("ru", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={styles.right}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Комментарии ({comments.length})</h2>

            <div style={styles.commentsList}>
              {comments.length === 0 && (
                <div style={styles.empty}>Комментариев пока нет</div>
              )}
              {comments.map((comment) => (
                <div key={comment.id} style={styles.commentItem}>
                  <div style={styles.commentHeader}>
                    <div style={styles.commentAuthor}>
                      <span style={styles.authorEmail}>
                        {comment.user_email}
                      </span>
                      <span style={styles.authorRole}>
                        {ROLE_LABELS[comment.user_role]}
                      </span>
                    </div>
                    <span style={styles.commentDate}>
                      {new Date(comment.created_at).toLocaleString("ru")}
                    </span>
                  </div>
                  <p style={styles.commentText}>{comment.text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddComment} style={styles.commentForm}>
              <textarea
                style={styles.textarea}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Написать комментарий..."
                rows={3}
              />
              <button
                style={{ ...styles.primaryBtn, opacity: submitting ? 0.7 : 1 }}
                type="submit"
                disabled={submitting || !commentText.trim()}
              >
                {submitting ? "Отправка..." : "Отправить"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  backBtn: {
    padding: "8px 16px",
    background: "white",
    border: "2px solid #eee",
    borderRadius: "8px",
    cursor: "pointer",
    marginBottom: "24px",
    fontSize: "14px",
    color: "#555",
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  left: { display: "flex", flexDirection: "column", gap: "16px" },
  right: {},
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  taskHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "12px",
  },
  taskTitle: { margin: 0, fontSize: "24px", color: "#1a1a2e" },
  badge: {
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  description: { color: "#666", fontSize: "15px", marginBottom: "16px" },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "20px",
  },
  metaItem: { display: "flex", flexDirection: "column", gap: "4px" },
  metaLabel: {
    fontSize: "12px",
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  metaValue: { fontSize: "14px", color: "#333" },
  statusSection: { display: "flex", flexDirection: "column", gap: "8px" },
  select: {
    padding: "10px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  sectionTitle: { margin: "0 0 16px", fontSize: "18px", color: "#1a1a2e" },
  occurrencesList: { display: "flex", flexDirection: "column", gap: "8px" },
  occurrenceItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px",
    background: "#f8f8ff",
    borderRadius: "8px",
  },
  occurrenceNum: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "#667eea",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    flexShrink: 0,
  },
  occurrenceDate: {
    fontSize: "14px",
    color: "#333",
    textTransform: "capitalize",
  },
  commentsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "16px",
    maxHeight: "400px",
    overflowY: "auto",
  },
  empty: { textAlign: "center", padding: "24px", color: "#888" },
  commentItem: { background: "#f8f9fa", borderRadius: "8px", padding: "12px" },
  commentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  commentAuthor: { display: "flex", alignItems: "center", gap: "8px" },
  authorEmail: { fontSize: "13px", fontWeight: "600", color: "#333" },
  authorRole: {
    fontSize: "11px",
    color: "#667eea",
    background: "#667eea20",
    padding: "2px 6px",
    borderRadius: "10px",
  },
  commentDate: { fontSize: "12px", color: "#999" },
  commentText: {
    margin: 0,
    fontSize: "14px",
    color: "#555",
    lineHeight: "1.5",
  },
  commentForm: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    borderTop: "1px solid #eee",
    paddingTop: "16px",
  },
  textarea: {
    padding: "10px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    resize: "vertical",
    fontFamily: "inherit",
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
    alignSelf: "flex-end",
  },
};
