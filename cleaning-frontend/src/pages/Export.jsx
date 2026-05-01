import { useState } from "react";
import client from "../api/client";

export default function Export() {
  const [form, setForm] = useState({
    date_from: "2026-01-01",
    date_to: "2026-12-31",
    format: "excel",
    country: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleExport = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const params = new URLSearchParams({
        date_from: form.date_from,
        date_to: form.date_to,
        format: form.format,
      });
      if (form.country) params.append("country", form.country);

      const res = await client.get(`/export/tasks?${params}`, {
        responseType: "blob",
      });

      const ext = form.format === "excel" ? "xlsx" : "parquet";
      const filename = `tasks_${form.date_from}_${form.date_to}.${ext}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      setSuccess(`File ${filename} has been download`);
    } catch (err) {
      setError("Export error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Task export</h1>

      <div style={styles.card}>
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleExport}>
          <div style={styles.grid}>
            <div style={styles.field}>
              <label style={styles.label}>Дата от</label>
              <input
                style={styles.input}
                type="date"
                value={form.date_from}
                onChange={(e) =>
                  setForm({ ...form, date_from: e.target.value })
                }
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Дата до</label>
              <input
                style={styles.input}
                type="date"
                value={form.date_to}
                onChange={(e) => setForm({ ...form, date_to: e.target.value })}
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Формат</label>
              <select
                style={styles.input}
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}
              >
                <option value="excel">Excel (.xlsx)</option>
                <option value="parquet">Parquet</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Counry (optional)</label>
              <select
                style={styles.input}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              >
                <option value="">All countries</option>
                <option value="DE">Germany</option>
                <option value="DK">Denmark</option>
                <option value="IT">Italy</option>
                <option value="AU">Australia</option>
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
          </div>

          <button
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Exporting..." : "Download report"}
          </button>
        </form>

        <div style={styles.info}>
          <h3 style={styles.infoTitle}>Форматы</h3>
          <p style={styles.infoText}>
            Excel is convenient for viewing and editing tables.
          </p>
          <p style={styles.infoText}>
            Parquet is a columnar format, 5-7 times smaller than Excel for big
            data. It's used for analytics.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "700px", margin: "0 auto" },
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "32px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "24px",
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
  btn: {
    width: "100%",
    padding: "14px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "24px",
  },
  error: {
    background: "#fee",
    color: "#c33",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  success: {
    background: "#d1fae5",
    color: "#065f46",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  info: { borderTop: "1px solid #eee", paddingTop: "24px" },
  infoTitle: { margin: "0 0 12px", fontSize: "16px", color: "#333" },
  infoText: {
    color: "#666",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0 0 8px",
  },
};
