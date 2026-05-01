import { useState, useEffect } from "react";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

const LEVEL_LABELS = {
  country: "Country",
  city: "City",
  building: "Building",
  floor: "Floor",
  room: "Room",
};

export default function Locations() {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    country: "DE",
    level: "country",
    parent_id: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRootLocations();
  }, []);

  const fetchRootLocations = async () => {
    try {
      const res = await client.get("/locations");
      setLocations(res.data);
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        name: form.name,
        country: form.country,
        level: form.level,
        parent_id: form.parent_id || undefined,
      };
      await client.post("/locations", payload);
      setShowForm(false);
      setForm({ name: "", country: "DE", level: "country", parent_id: "" });
      fetchRootLocations();
    } catch (err) {
      setError(err.response?.data?.error || "Location creating error");
    }
  };

  if (loading) return <div style={styles.center}>Download...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Locations</h1>
        {user.role === "admin" && (
          <button
            style={styles.primaryBtn}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Create location"}
          </button>
        )}
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h2 style={styles.formTitle}>New location</h2>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleCreate}>
            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Name</label>
                <input
                  style={styles.input}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Berlin"
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
                <label style={styles.label}>Level</label>
                <select
                  style={styles.input}
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                >
                  <option value="country">Country</option>
                  <option value="city">City</option>
                  <option value="building">Building</option>
                  <option value="floor">Floor</option>
                  <option value="room">Room</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Parent ID (optional)</label>
                <input
                  style={styles.input}
                  value={form.parent_id}
                  onChange={(e) =>
                    setForm({ ...form, parent_id: e.target.value })
                  }
                  placeholder="Parent's location IUUID "
                />
              </div>
            </div>
            <button style={styles.primaryBtn} type="submit">
              Create
            </button>
          </form>
        </div>
      )}

      <div style={styles.grid}>
        {locations.length === 0 && (
          <div style={styles.empty}>No locations yet</div>
        )}
        {locations.map((loc) => (
          <div key={loc.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.locName}>{loc.name}</span>
              <span style={styles.levelBadge}>{LEVEL_LABELS[loc.level]}</span>
            </div>
            <p style={styles.path}>{loc.path}</p>
            <span style={styles.country}>{loc.country}</span>
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
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
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
    alignItems: "center",
    marginBottom: "8px",
  },
  locName: { fontWeight: "600", fontSize: "16px", color: "#1a1a2e" },
  levelBadge: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    background: "#667eea20",
    color: "#667eea",
  },
  path: {
    fontSize: "13px",
    color: "#888",
    margin: "4px 0",
    fontFamily: "monospace",
  },
  country: { fontSize: "12px", color: "#999" },
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
