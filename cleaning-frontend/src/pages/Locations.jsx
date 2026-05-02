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

const LEVEL_COLORS = {
  country: "#667eea",
  city: "#3b82f6",
  building: "#10b981",
  floor: "#f59e0b",
  room: "#94a3b8",
};

function buildTree(locations) {
  const map = {};
  const roots = [];

  locations.forEach((loc) => {
    map[loc.id] = { ...loc, children: [] };
  });

  locations.forEach((loc) => {
    if (loc.parent_id && map[loc.parent_id]) {
      map[loc.parent_id].children.push(map[loc.id]);
    } else {
      roots.push(map[loc.id]);
    }
  });

  return roots;
}

function TreeNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 20 }}>
      <div
        style={{
          ...styles.node,
          borderLeft: `3px solid ${LEVEL_COLORS[node.level]}`,
        }}
      >
        <div style={styles.nodeLeft}>
          {hasChildren ? (
            <button
              style={styles.toggleBtn}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "-" : "+"}
            </button>
          ) : (
            <div style={styles.togglePlaceholder} />
          )}
          <div>
            <div style={styles.nodeName}>{node.name}</div>
            <div style={styles.nodePath}>{node.path}</div>
          </div>
        </div>
        <div style={styles.nodeRight}>
          <span
            style={{
              ...styles.levelBadge,
              background: LEVEL_COLORS[node.level] + "20",
              color: LEVEL_COLORS[node.level],
            }}
          >
            {LEVEL_LABELS[node.level]}
          </span>
          <span style={styles.nodeCountry}>{node.country}</span>
        </div>
      </div>

      {expanded && hasChildren && (
        <div style={styles.children}>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [countryFilter, setCountryFilter] = useState("");

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
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
      await client.post("/locations", {
        name: form.name,
        country: form.country,
        level: form.level,
        parent_id: form.parent_id || undefined,
      });
      setShowForm(false);
      setForm({ name: "", country: "DE", level: "country", parent_id: "" });
      fetchLocations();
    } catch (err) {
      setError(err.response?.data?.error || "Location creating error");
    }
  };

  const filtered = countryFilter
    ? locations.filter((l) => l.country === countryFilter)
    : locations;

  const tree = buildTree(filtered);

  if (loading) return <div style={styles.center}>Loading...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Locations</h1>
        <div style={styles.headerRight}>
          <select
            style={styles.filterSelect}
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          >
            <option value="">All countries</option>
            <option value="DE">Germany</option>
            <option value="NL">Netherlands</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="FR">France</option>
            <option value="ES">Spain</option>
            <option value="PL">Poland</option>
            <option value="SE">Sweden</option>
            <option value="NO">Norway</option>
            <option value="FI">Finland</option>
            <option value="CH">Switzerland</option>
            <option value="AT">Austria</option>
          </select>
          {user.role === "admin" && (
            <button
              style={styles.primaryBtn}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? "Cancel" : "Create location"}
            </button>
          )}
        </div>
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
                <label style={styles.label}>Country</label>
                <select
                  style={styles.input}
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                >
                  <option value="DE">Germany</option>
                  <option value="NL">Netherlands</option>
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="FR">France</option>
                  <option value="ES">Spain</option>
                  <option value="PL">Poland</option>
                  <option value="SE">Sweden</option>
                  <option value="NO">Norway</option>
                  <option value="FI">Finland</option>
                  <option value="CH">Switzerland</option>
                  <option value="AT">Austria</option>
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
                <label style={styles.label}>Parent location</label>
                <select
                  style={styles.input}
                  value={form.parent_id}
                  onChange={(e) =>
                    setForm({ ...form, parent_id: e.target.value })
                  }
                >
                  <option value="">No parent</option>
                  {locations
                    .filter((l) => l.country === form.country)
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.path}
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

      <div style={styles.legend}>
        {Object.entries(LEVEL_LABELS).map(([level, label]) => (
          <div key={level} style={styles.legendItem}>
            <div
              style={{ ...styles.legendDot, background: LEVEL_COLORS[level] }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div style={styles.tree}>
        {tree.length === 0 && <div style={styles.empty}>No locations yet</div>}
        {tree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1000px", margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  headerRight: { display: "flex", gap: "12px", alignItems: "center" },
  title: { margin: 0, fontSize: "28px", color: "#1a1a2e" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: { textAlign: "center", padding: "60px", color: "#888" },
  filterSelect: {
    padding: "8px 12px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
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
  legend: {
    display: "flex",
    gap: "16px",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "13px",
    color: "#555",
  },
  legendDot: { width: "10px", height: "10px", borderRadius: "50%" },
  tree: {
    background: "white",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  node: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    marginBottom: "6px",
    background: "#f8f9fa",
    borderRadius: "8px",
  },
  nodeLeft: { display: "flex", alignItems: "center", gap: "10px" },
  nodeRight: { display: "flex", alignItems: "center", gap: "10px" },
  nodeName: { fontSize: "14px", fontWeight: "600", color: "#1a1a2e" },
  nodePath: { fontSize: "11px", color: "#aaa", fontFamily: "monospace" },
  nodeCountry: { fontSize: "12px", color: "#999" },
  levelBadge: {
    padding: "3px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: "600",
  },
  toggleBtn: {
    width: "22px",
    height: "22px",
    border: "2px solid #ddd",
    borderRadius: "4px",
    background: "white",
    cursor: "pointer",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontWeight: "700",
    color: "#555",
  },
  togglePlaceholder: { width: "22px", height: "22px", flexShrink: 0 },
  children: { marginTop: "4px" },
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
