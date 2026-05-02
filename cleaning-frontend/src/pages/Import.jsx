import { useState, useRef } from "react";
import client from "../api/client";

export default function Import() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setResult(null);
      setError("");
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await client.post("/import/tasks", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await client.get("/import/template", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("Failed to download template");
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Import Tasks</h1>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Upload file</h2>
          <p style={styles.hint}>
            Supported formats: Excel (.xlsx) and CSV. Download the template to
            see the required columns.
          </p>

          {error && <div style={styles.error}>{error}</div>}

          {result && (
            <div style={result.imported > 0 ? styles.success : styles.warning}>
              <div style={styles.resultTitle}>
                Imported {result.imported} of {result.total_rows} rows
              </div>
              {result.errors.length > 0 && (
                <div style={styles.errorList}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={styles.errorItem}>
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleImport}>
            <div
              style={{
                ...styles.dropzone,
                borderColor: file ? "#667eea" : "#ddd",
                background: file ? "#667eea08" : "#fafafa",
              }}
              onClick={() => fileInputRef.current.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              {file ? (
                <div>
                  <div style={styles.fileName}>{file.name}</div>
                  <div style={styles.fileSize}>
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              ) : (
                <div>
                  <div style={styles.dropText}>Click to select file</div>
                  <div style={styles.dropHint}>.xlsx, .xls, .csv</div>
                </div>
              )}
            </div>

            <div style={styles.actions}>
              <button
                style={{
                  ...styles.primaryBtn,
                  opacity: !file || loading ? 0.7 : 1,
                }}
                type="submit"
                disabled={!file || loading}
              >
                {loading ? "Importing..." : "Import"}
              </button>
              <button
                style={styles.secondaryBtn}
                type="button"
                onClick={handleDownloadTemplate}
              >
                Download template
              </button>
            </div>
          </form>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>File format</h2>
          <p style={styles.hint}>Required columns:</p>
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <span>Column</span>
              <span>Required</span>
              <span>Description</span>
            </div>
            {[
              { col: "title", req: true, desc: "Task title (min 3 chars)" },
              {
                col: "country",
                req: true,
                desc: "2-letter code: DE, NL, US...",
              },
              { col: "description", req: false, desc: "Optional description" },
              {
                col: "priority",
                req: false,
                desc: "low / normal / high / urgent",
              },
              { col: "assigned_to", req: false, desc: "Cleaner UUID" },
              {
                col: "location_name",
                req: false,
                desc: "Location name from the system",
              },
              {
                col: "rrule",
                req: false,
                desc: "Recurrence rule, e.g. FREQ=DAILY",
              },
            ].map((row) => (
              <div key={row.col} style={styles.tableRow}>
                <span style={styles.colName}>{row.col}</span>
                <span
                  style={{
                    ...styles.reqBadge,
                    background: row.req ? "#fee2e2" : "#f0fdf4",
                    color: row.req ? "#dc2626" : "#16a34a",
                  }}
                >
                  {row.req ? "Required" : "Optional"}
                </span>
                <span style={styles.colDesc}>{row.desc}</span>
              </div>
            ))}
          </div>

          <p style={{ ...styles.hint, marginTop: "16px" }}>
            Manager can only import tasks for their own country. Location is
            matched by name — use exact names from the Locations page.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1100px", margin: "0 auto" },
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  sectionTitle: { margin: "0 0 12px", fontSize: "18px", color: "#1a1a2e" },
  hint: { fontSize: "14px", color: "#888", marginBottom: "16px" },
  error: {
    background: "#fee",
    color: "#c33",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
  },
  success: {
    background: "#d1fae5",
    color: "#065f46",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  warning: {
    background: "#fef3c7",
    color: "#92400e",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  resultTitle: { fontWeight: "600", marginBottom: "8px", fontSize: "15px" },
  errorList: { marginTop: "8px" },
  errorItem: { fontSize: "13px", marginBottom: "4px" },
  dropzone: {
    border: "2px dashed #ddd",
    borderRadius: "12px",
    padding: "40px",
    textAlign: "center",
    cursor: "pointer",
    marginBottom: "16px",
    transition: "all 0.2s",
  },
  dropText: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#555",
    marginBottom: "4px",
  },
  dropHint: { fontSize: "13px", color: "#aaa" },
  fileName: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#667eea",
    marginBottom: "4px",
  },
  fileSize: { fontSize: "13px", color: "#888" },
  actions: { display: "flex", gap: "12px" },
  primaryBtn: {
    flex: 1,
    padding: "12px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  secondaryBtn: {
    flex: 1,
    padding: "12px",
    background: "white",
    color: "#667eea",
    border: "2px solid #667eea",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  table: {
    border: "1px solid #f0f0f0",
    borderRadius: "8px",
    overflow: "hidden",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 80px 2fr",
    gap: "12px",
    padding: "10px 14px",
    background: "#f8f9fa",
    fontSize: "12px",
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1fr 80px 2fr",
    gap: "12px",
    padding: "10px 14px",
    borderTop: "1px solid #f0f0f0",
    alignItems: "center",
  },
  colName: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#333",
    fontFamily: "monospace",
  },
  reqBadge: {
    padding: "2px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: "600",
    textAlign: "center",
  },
  colDesc: { fontSize: "13px", color: "#666" },
};
