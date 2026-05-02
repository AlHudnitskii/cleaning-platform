import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
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

const ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  cleaner: "Cleaner",
};

function isNetworkError(err) {
  return (
    !err.response ||
    err.response?.status === 503 ||
    err.response?.data?.offline === true
  );
}

function StarRating({ value, onChange, readonly }) {
  return (
    <div style={styles.stars}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{
            ...styles.star,
            color: star <= (value || 0) ? "#f59e0b" : "#ddd",
            cursor: readonly ? "default" : "pointer",
            fontSize: "24px",
          }}
          onClick={() => !readonly && onChange && onChange(star)}
        >
          *
        </span>
      ))}
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const { isOnline, queueStatusChange, markOffline, markOnline } =
    useOfflineSync();

  const [task, setTask] = useState(null);
  const [location, setLocation] = useState(null);
  const [comments, setComments] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [history, setHistory] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState("comments");
  const [qualityScore, setQualityScore] = useState(0);
  const [qualityComment, setQualityComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [taskRes, commentsRes, historyRes, photosRes] = await Promise.all([
        client.get(`/tasks/${id}`),
        client.get(`/tasks/${id}/comments`),
        client.get(`/tasks/${id}/history`),
        client.get(`/tasks/${id}/photos`),
      ]);
      const taskData = taskRes.data;
      setTask(taskData);
      setComments(commentsRes.data);
      setHistory(historyRes.data);
      setPhotos(photosRes.data);
      markOnline();

      if (taskData.quality_score) {
        setQualityScore(taskData.quality_score);
        setQualityComment(taskData.quality_comment || "");
      }

      if (taskData.location_id) {
        try {
          const locRes = await client.get("/locations");
          const found = locRes.data.find((l) => l.id === taskData.location_id);
          setLocation(found || null);
        } catch {}
      }

      if (taskData.is_recurring) {
        const occRes = await client.get(`/tasks/${id}/occurrences`);
        setOccurrences(occRes.data.next_occurrences);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        markOffline();
      } else {
        navigate(-1);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setTask((prev) => ({ ...prev, status: newStatus }));

    if (!isOnline) {
      queueStatusChange(id, newStatus);
      return;
    }

    try {
      const res = await client.patch(`/tasks/${id}/status`, {
        status: newStatus,
      });
      setTask(res.data);
      markOnline();
      const historyRes = await client.get(`/tasks/${id}/history`);
      setHistory(historyRes.data);
    } catch (err) {
      if (isNetworkError(err)) {
        markOffline();
        queueStatusChange(id, newStatus);
      }
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !isOnline) return;
    setSubmitting(true);
    try {
      const res = await client.post(`/tasks/${id}/comments`, {
        text: commentText,
      });
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
      markOnline();
    } catch (err) {
      if (isNetworkError(err)) markOffline();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !isOnline) return;
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append("photo", file);
    try {
      await client.post(`/tasks/${id}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const photosRes = await client.get(`/tasks/${id}/photos`);
      setPhotos(photosRes.data);
      markOnline();
    } catch (err) {
      if (isNetworkError(err)) markOffline();
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleQualityReview = async (e) => {
    e.preventDefault();
    if (!qualityScore || !isOnline) return;
    setSubmittingReview(true);
    try {
      const res = await client.post(`/tasks/${id}/quality`, {
        score: qualityScore,
        comment: qualityComment || undefined,
      });
      setTask(res.data);
      setReviewSuccess(true);
      markOnline();
      setTimeout(() => setReviewSuccess(false), 3000);
    } catch (err) {
      if (isNetworkError(err)) markOffline();
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <div style={styles.center}>Loading...</div>;
  if (!task) return null;

  const canReview =
    ["admin", "manager"].includes(user.role) && task.status === "completed";

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={() => navigate(-1)}>
        Back
      </button>

      {!isOnline && (
        <div style={styles.offlineBanner}>
          Offline mode — status changes will sync when connection is restored
        </div>
      )}

      <div style={styles.grid}>
        <div style={styles.left}>
          <div style={styles.card}>
            <div style={styles.taskHeader}>
              <h1 style={styles.taskTitle}>{task.title}</h1>
              <div style={styles.badges}>
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
                {task.is_recurring && (
                  <span style={styles.recurringBadge}>Recurring</span>
                )}
              </div>
            </div>

            {task.description && (
              <p style={styles.description}>{task.description}</p>
            )}

            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Country</span>
                <span style={styles.metaValue}>{task.country}</span>
              </div>
              {location && (
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Location</span>
                  <div>
                    <div style={styles.metaValue}>{location.name}</div>
                    <div style={styles.metaPath}>{location.path}</div>
                  </div>
                </div>
              )}
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Created</span>
                <span style={styles.metaValue}>
                  {new Date(task.created_at).toLocaleString("en")}
                </span>
              </div>
              {task.is_recurring && (
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Schedule</span>
                  <span style={{ ...styles.metaValue, color: "#667eea" }}>
                    {task.rrule}
                  </span>
                </div>
              )}
              {task.quality_score && (
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Quality Score</span>
                  <StarRating value={task.quality_score} readonly />
                </div>
              )}
            </div>

            <div style={styles.statusSection}>
              <label style={styles.metaLabel}>Change Status</label>
              <select
                style={styles.select}
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div style={styles.photoSection}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*"
                onChange={handlePhotoUpload}
              />
              <button
                style={{ ...styles.photoBtn, opacity: !isOnline ? 0.5 : 1 }}
                onClick={() => isOnline && fileInputRef.current.click()}
                disabled={uploadingPhoto || !isOnline}
              >
                {uploadingPhoto
                  ? "Uploading..."
                  : !isOnline
                    ? "Photo unavailable offline"
                    : "Upload Photo"}
              </button>
            </div>
          </div>

          {canReview && isOnline && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Quality Review</h2>
              {reviewSuccess && (
                <div style={styles.success}>Review submitted successfully!</div>
              )}
              <form onSubmit={handleQualityReview}>
                <div style={styles.field}>
                  <label style={styles.metaLabel}>Score</label>
                  <StarRating value={qualityScore} onChange={setQualityScore} />
                </div>
                <div style={{ ...styles.field, marginTop: "12px" }}>
                  <label style={styles.metaLabel}>Comment (optional)</label>
                  <textarea
                    style={styles.textarea}
                    value={qualityComment}
                    onChange={(e) => setQualityComment(e.target.value)}
                    placeholder="Add a quality comment..."
                    rows={3}
                  />
                </div>
                <button
                  style={{
                    ...styles.primaryBtn,
                    marginTop: "12px",
                    opacity: submittingReview || !qualityScore ? 0.7 : 1,
                  }}
                  type="submit"
                  disabled={submittingReview || !qualityScore}
                >
                  {submittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </form>
            </div>
          )}

          {task.quality_score && !canReview && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Quality Review</h2>
              <StarRating value={task.quality_score} readonly />
              {task.quality_comment && (
                <p style={{ ...styles.description, marginTop: "8px" }}>
                  {task.quality_comment}
                </p>
              )}
              {task.quality_reviewed_at && (
                <span style={styles.metaLabel}>
                  Reviewed:{" "}
                  {new Date(task.quality_reviewed_at).toLocaleString("en")}
                </span>
              )}
            </div>
          )}

          {photos.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Photos ({photos.length})</h2>
              <div style={styles.photosGrid}>
                {photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none" }}
                  >
                    <div style={styles.photoThumb}>
                      <span style={styles.photoName}>{photo.filename}</span>
                      <span style={styles.photoDate}>
                        {new Date(photo.uploaded_at).toLocaleString("en")}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {task.is_recurring && occurrences.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Next Occurrences</h2>
              <div style={styles.occurrencesList}>
                {occurrences.map((date, i) => (
                  <div key={i} style={styles.occurrenceItem}>
                    <span style={styles.occurrenceNum}>{i + 1}</span>
                    <span style={styles.occurrenceDate}>
                      {new Date(date).toLocaleString("en", {
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
            <div style={styles.tabs}>
              {["comments", "history"].map((tab) => (
                <button
                  key={tab}
                  style={{
                    ...styles.tab,
                    borderBottom:
                      activeTab === tab
                        ? "2px solid #667eea"
                        : "2px solid transparent",
                    color: activeTab === tab ? "#667eea" : "#888",
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "comments"
                    ? `Comments (${comments.length})`
                    : `History (${history.length})`}
                </button>
              ))}
            </div>

            {activeTab === "comments" && (
              <>
                <div style={styles.commentsList}>
                  {comments.length === 0 && (
                    <div style={styles.empty}>No comments yet</div>
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
                          {new Date(comment.created_at).toLocaleString("en")}
                        </span>
                      </div>
                      <p style={styles.commentText}>{comment.text}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddComment} style={styles.commentForm}>
                  <textarea
                    style={{ ...styles.textarea, opacity: !isOnline ? 0.5 : 1 }}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={
                      isOnline
                        ? "Write a comment..."
                        : "Comments unavailable offline"
                    }
                    rows={3}
                    disabled={!isOnline}
                  />
                  <button
                    style={{
                      ...styles.primaryBtn,
                      opacity:
                        submitting || !commentText.trim() || !isOnline
                          ? 0.7
                          : 1,
                    }}
                    type="submit"
                    disabled={submitting || !commentText.trim() || !isOnline}
                  >
                    {submitting ? "Sending..." : "Send"}
                  </button>
                </form>
              </>
            )}

            {activeTab === "history" && (
              <div style={styles.historyList}>
                {history.length === 0 && (
                  <div style={styles.empty}>No history yet</div>
                )}
                {history.map((item, i) => (
                  <div key={item.id} style={styles.historyItem}>
                    <div style={styles.historyLine}>
                      {i < history.length - 1 && (
                        <div style={styles.historyConnector} />
                      )}
                      <div style={styles.historyDot} />
                    </div>
                    <div style={styles.historyContent}>
                      <div style={styles.historyChange}>
                        {item.old_status && (
                          <>
                            <span
                              style={{
                                ...styles.historyBadge,
                                background:
                                  (STATUS_COLORS[item.old_status] ||
                                    "#94a3b8") + "20",
                                color:
                                  STATUS_COLORS[item.old_status] || "#94a3b8",
                              }}
                            >
                              {STATUS_LABELS[item.old_status] ||
                                item.old_status}
                            </span>
                            <span style={styles.historyArrow}>→</span>
                          </>
                        )}
                        <span
                          style={{
                            ...styles.historyBadge,
                            background:
                              (STATUS_COLORS[item.new_status] || "#94a3b8") +
                              "20",
                            color: STATUS_COLORS[item.new_status] || "#94a3b8",
                          }}
                        >
                          {STATUS_LABELS[item.new_status] || item.new_status}
                        </span>
                      </div>
                      <div style={styles.historyMeta}>
                        <span>{item.changed_by_email}</span>
                        <span>
                          {new Date(item.changed_at).toLocaleString("en")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  offlineBanner: {
    padding: "10px 16px",
    background: "#fef3c7",
    color: "#92400e",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    marginBottom: "16px",
  },
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
    flexWrap: "wrap",
    gap: "8px",
  },
  taskTitle: { margin: 0, fontSize: "24px", color: "#1a1a2e" },
  badges: { display: "flex", gap: "6px", flexWrap: "wrap" },
  badge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  recurringBadge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    background: "#667eea20",
    color: "#667eea",
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
  metaPath: {
    fontSize: "11px",
    color: "#aaa",
    fontFamily: "monospace",
    marginTop: "2px",
  },
  statusSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "16px",
  },
  select: {
    padding: "10px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },
  photoSection: { marginTop: "8px" },
  photoBtn: {
    padding: "8px 16px",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  photosGrid: { display: "flex", flexDirection: "column", gap: "8px" },
  photoThumb: {
    padding: "10px 12px",
    background: "#f8f9fa",
    borderRadius: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photoName: { fontSize: "14px", color: "#333", fontWeight: "500" },
  photoDate: { fontSize: "12px", color: "#999" },
  sectionTitle: { margin: "0 0 16px", fontSize: "18px", color: "#1a1a2e" },
  stars: { display: "flex", gap: "4px" },
  star: { lineHeight: 1 },
  success: {
    background: "#d1fae5",
    color: "#065f46",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
  },
  field: {},
  textarea: {
    width: "100%",
    padding: "10px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
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
  occurrenceDate: { fontSize: "14px", color: "#333" },
  tabs: {
    display: "flex",
    marginBottom: "16px",
    borderBottom: "1px solid #eee",
  },
  tab: {
    padding: "10px 16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },
  commentsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "16px",
    maxHeight: "350px",
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
  historyList: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "450px",
    overflowY: "auto",
  },
  historyItem: { display: "flex", gap: "12px", paddingBottom: "16px" },
  historyLine: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "20px",
    flexShrink: 0,
  },
  historyDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "#667eea",
    flexShrink: 0,
  },
  historyConnector: {
    width: "2px",
    flex: 1,
    background: "#eee",
    marginTop: "4px",
  },
  historyContent: { flex: 1, paddingBottom: "8px" },
  historyChange: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  historyBadge: {
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: "600",
  },
  historyArrow: { color: "#999", fontSize: "14px" },
  historyMeta: {
    display: "flex",
    gap: "12px",
    fontSize: "12px",
    color: "#999",
  },
};
