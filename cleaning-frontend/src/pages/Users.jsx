import { useState, useEffect } from "react";
import client from "../api/client";

const ROLE_COLORS = {
  admin: "#8b5cf6",
  manager: "#3b82f6",
  cleaner: "#10b981",
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

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "cleaner",
    country: "DE",
  });

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, countryFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.append("role", roleFilter);
      if (countryFilter) params.append("country", countryFilter);
      const res = await client.get(`/users?${params}`);
      setUsers(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await client.post("/users", form);
      setSuccess(`User ${form.email} created`);
      setShowForm(false);
      setForm({ email: "", password: "", role: "cleaner", country: "DE" });
      fetchUsers();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create user");
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      await client.patch(`/users/${userId}/toggle-active`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: !isActive } : u)),
      );
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update user");
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (countryFilter && u.country !== countryFilter) return false;
    return true;
  });

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Users</h1>
        <button
          style={styles.primaryBtn}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "Create user"}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {showForm && (
        <div style={styles.formCard}>
          <h2 style={styles.formTitle}>New user</h2>
          <form onSubmit={handleCreate}>
            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Password</label>
                <input
                  style={styles.input}
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="Min 6 characters"
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Role</label>
                <select
                  style={styles.input}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="cleaner">Cleaner</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
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
                  {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
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
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="cleaner">Cleaner</option>
        </select>
        <select
          style={styles.filterSelect}
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="">All countries</option>
          {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <span style={styles.totalLabel}>{filtered.length} users</span>
      </div>

      {loading ? (
        <div style={styles.center}>Loading...</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span>Email</span>
            <span>Role</span>
            <span>Country</span>
            <span>Created</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 && (
            <div style={styles.empty}>No users found</div>
          )}
          {filtered.map((u) => (
            <div
              key={u.id}
              style={{ ...styles.tableRow, opacity: u.is_active ? 1 : 0.5 }}
            >
              <span style={styles.email}>{u.email}</span>
              <span>
                <span
                  style={{
                    ...styles.roleBadge,
                    background: ROLE_COLORS[u.role] + "20",
                    color: ROLE_COLORS[u.role],
                  }}
                >
                  {u.role}
                </span>
              </span>
              <span style={styles.cell}>
                {u.country ? COUNTRY_NAMES[u.country] || u.country : "—"}
              </span>
              <span style={styles.cell}>
                {new Date(u.created_at).toLocaleDateString("en")}
              </span>
              <span>
                <span
                  style={{
                    ...styles.statusBadge,
                    background: u.is_active ? "#d1fae5" : "#fee",
                    color: u.is_active ? "#065f46" : "#c33",
                  }}
                >
                  {u.is_active ? "Active" : "Inactive"}
                </span>
              </span>
              <span>
                <button
                  style={{
                    ...styles.toggleBtn,
                    background: u.is_active ? "#fee" : "#d1fae5",
                    color: u.is_active ? "#c33" : "#065f46",
                  }}
                  onClick={() => handleToggleActive(u.id, u.is_active)}
                >
                  {u.is_active ? "Deactivate" : "Activate"}
                </button>
              </span>
            </div>
          ))}
        </div>
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
  empty: { textAlign: "center", padding: "40px", color: "#888" },
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
  totalLabel: { marginLeft: "auto", fontSize: "14px", color: "#888" },
  table: {
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
    gap: "16px",
    padding: "16px 24px",
    background: "#f8f9fa",
    fontSize: "12px",
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
    gap: "16px",
    padding: "16px 24px",
    borderTop: "1px solid #f0f0f0",
    alignItems: "center",
  },
  email: { fontSize: "14px", fontWeight: "600", color: "#1a1a2e" },
  cell: { fontSize: "14px", color: "#555" },
  roleBadge: {
    padding: "3px 8px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
  },
  statusBadge: {
    padding: "3px 8px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
  },
  toggleBtn: {
    padding: "6px 12px",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
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
