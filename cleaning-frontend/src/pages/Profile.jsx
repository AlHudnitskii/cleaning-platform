import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";

const ROLE_LABELS = {
  admin: "Administrator",
  manager: "Manager",
  cleaner: "Cleaner",
};

const COUNTRY_NAMES = {
  DE: "Germany",
  NL: "Netherlands",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  ES: "Spain",
  PL: "Poland",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  CH: "Switzerland",
  AT: "Austria",
};

export default function Profile() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match");
      return;
    }

    if (form.new_password.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await client.patch("/users/me/password", {
        old_password: form.old_password,
        new_password: form.new_password,
      });
      setSuccess("Password changed successfully");
      setForm({ old_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Profile</h1>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Account info</h2>

          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Email</span>
            <span style={styles.infoValue}>{user.email}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Role</span>
            <span
              style={{
                ...styles.roleBadge,
                background: "#667eea20",
                color: "#667eea",
              }}
            >
              {ROLE_LABELS[user.role]}
            </span>
          </div>
          {user.country && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Country</span>
              <span style={styles.infoValue}>
                {COUNTRY_NAMES[user.country] || user.country}
              </span>
            </div>
          )}

          <div style={styles.divider} />

          <button style={styles.logoutBtn} onClick={logout}>
            Log out
          </button>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Change password</h2>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <form onSubmit={handleChangePassword}>
            <div style={styles.field}>
              <label style={styles.label}>Current password</label>
              <input
                style={styles.input}
                type="password"
                value={form.old_password}
                onChange={(e) =>
                  setForm({ ...form, old_password: e.target.value })
                }
                placeholder="Enter current password"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>New password</label>
              <input
                style={styles.input}
                type="password"
                value={form.new_password}
                onChange={(e) =>
                  setForm({ ...form, new_password: e.target.value })
                }
                placeholder="Min 6 characters"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Confirm new password</label>
              <input
                style={styles.input}
                type="password"
                value={form.confirm_password}
                onChange={(e) =>
                  setForm({ ...form, confirm_password: e.target.value })
                }
                placeholder="Repeat new password"
                required
              />
            </div>
            <button
              style={{ ...styles.primaryBtn, opacity: loading ? 0.7 : 1 }}
              type="submit"
              disabled={loading}
            >
              {loading ? "Saving..." : "Change password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "900px", margin: "0 auto" },
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  sectionTitle: { margin: "0 0 24px", fontSize: "18px", color: "#1a1a2e" },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "16px",
    marginBottom: "16px",
    borderBottom: "1px solid #f0f0f0",
  },
  infoLabel: { fontSize: "14px", color: "#888", fontWeight: "600" },
  infoValue: { fontSize: "14px", color: "#1a1a2e", fontWeight: "500" },
  roleBadge: {
    padding: "4px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
  },
  divider: { borderTop: "1px solid #f0f0f0", margin: "8px 0 24px" },
  logoutBtn: {
    width: "100%",
    padding: "12px",
    background: "#fee",
    color: "#c33",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  field: { marginBottom: "16px" },
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
    fontSize: "14px",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
};
