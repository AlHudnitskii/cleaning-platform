import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

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

const STATUS_COLORS = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  completed: "#10b981",
  on_hold: "#94a3b8",
  cancelled: "#ef4444",
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

function HBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={styles.barRow}>
      <span style={styles.barLabel}>{label}</span>
      <div style={styles.barTrack}>
        <div
          style={{
            ...styles.barFill,
            width: `${pct}%`,
            background: color || "#667eea",
          }}
        />
      </div>
      <span style={styles.barCount}>{value}</span>
    </div>
  );
}

function LineChart({ data, labelKey, valueKey }) {
  if (!data || data.length === 0)
    return <div style={styles.empty}>No data for period</div>;

  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const width = 600;
  const height = 120;
  const padX = 40;
  const padY = 10;

  const points = data.map((d, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * (width - padX * 2),
    y: padY + (1 - d[valueKey] / max) * (height - padY * 2),
    value: d[valueKey],
    label: d[labelKey].slice(5),
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 24}`}
      style={{ width: "100%", overflow: "visible" }}
    >
      {[0, 0.5, 1].map((t, i) => (
        <line
          key={i}
          x1={padX}
          x2={width - padX}
          y1={padY + t * (height - padY * 2)}
          y2={padY + t * (height - padY * 2)}
          stroke="#f0f0f0"
          strokeWidth="1"
        />
      ))}
      <path d={areaD} fill="#667eea" fillOpacity="0.08" />
      <path
        d={pathD}
        fill="none"
        stroke="#667eea"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#667eea" />
          <text
            x={p.x}
            y={height + 18}
            textAnchor="middle"
            fontSize="10"
            fill="#aaa"
          >
            {p.label}
          </text>
          <text
            x={p.x}
            y={p.y - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#667eea"
            fontWeight="600"
          >
            {p.value}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [filters, setFilters] = useState({
    date_from: thirtyDaysAgo,
    date_to: today,
    country: "",
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState("daily");

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: filters.date_from,
        date_to: filters.date_to,
      });
      if (filters.country) params.append("country", filters.country);
      const res = await client.get(`/stats/reports?${params}`);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (e) => {
    e.preventDefault();
    fetchReports();
  };

  const totalTasks = data?.total_tasks || 0;
  const maxStatus = data ? Math.max(...Object.values(data.status_stats), 1) : 1;
  const maxPriority = data
    ? Math.max(...Object.values(data.priority_stats), 1)
    : 1;
  const maxCountry = data
    ? Math.max(...data.country_stats.map((c) => c.count), 1)
    : 1;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Reports</h1>

      <div style={styles.filtersCard}>
        <form onSubmit={handleApply} style={styles.filtersForm}>
          <div style={styles.filterField}>
            <label style={styles.label}>From</label>
            <input
              style={styles.input}
              type="date"
              value={filters.date_from}
              onChange={(e) =>
                setFilters({ ...filters, date_from: e.target.value })
              }
            />
          </div>
          <div style={styles.filterField}>
            <label style={styles.label}>To</label>
            <input
              style={styles.input}
              type="date"
              value={filters.date_to}
              onChange={(e) =>
                setFilters({ ...filters, date_to: e.target.value })
              }
            />
          </div>
          {user.role === "admin" && (
            <div style={styles.filterField}>
              <label style={styles.label}>Country</label>
              <select
                style={styles.input}
                value={filters.country}
                onChange={(e) =>
                  setFilters({ ...filters, country: e.target.value })
                }
              >
                <option value="">All countries</option>
                {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={styles.filterField}>
            <label style={styles.label}>&nbsp;</label>
            <button style={styles.primaryBtn} type="submit">
              Apply
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div style={styles.center}>Loading...</div>
      ) : !data ? null : (
        <>
          <div style={styles.cardsRow}>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>{totalTasks}</div>
              <div style={styles.statLabel}>Total tasks</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNumber, color: "#10b981" }}>
                {data.status_stats.completed || 0}
              </div>
              <div style={styles.statLabel}>Completed</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNumber, color: "#10b981" }}>
                {totalTasks > 0
                  ? Math.round(
                      ((data.status_stats.completed || 0) / totalTasks) * 100,
                    )
                  : 0}
                %
              </div>
              <div style={styles.statLabel}>Completion rate</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNumber, color: "#f59e0b" }}>
                {data.quality_stats.avg
                  ? data.quality_stats.avg.toFixed(1)
                  : "—"}
              </div>
              <div style={styles.statLabel}>Avg quality</div>
              {data.quality_stats.reviewed_count > 0 && (
                <div style={styles.statSub}>
                  {data.quality_stats.reviewed_count} reviews
                </div>
              )}
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNumber, color: "#ef4444" }}>
                {data.status_stats.cancelled || 0}
              </div>
              <div style={styles.statLabel}>Cancelled</div>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>By status</h2>
              {Object.entries(data.status_stats).map(([status, count]) => (
                <HBar
                  key={status}
                  label={status.replace("_", " ")}
                  value={count}
                  max={maxStatus}
                  color={STATUS_COLORS[status]}
                />
              ))}
            </div>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>By priority</h2>
              {Object.entries(data.priority_stats).map(([priority, count]) => (
                <HBar
                  key={priority}
                  label={PRIORITY_LABELS[priority]}
                  value={count}
                  max={maxPriority}
                  color={PRIORITY_COLORS[priority]}
                />
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.chartHeader}>
              <h2 style={styles.sectionTitle}>Tasks over time</h2>
              <div style={styles.chartToggle}>
                <button
                  style={{
                    ...styles.toggleBtn,
                    background: chartMode === "daily" ? "#667eea" : "white",
                    color: chartMode === "daily" ? "white" : "#667eea",
                  }}
                  onClick={() => setChartMode("daily")}
                >
                  Daily
                </button>
                <button
                  style={{
                    ...styles.toggleBtn,
                    background: chartMode === "weekly" ? "#667eea" : "white",
                    color: chartMode === "weekly" ? "white" : "#667eea",
                  }}
                  onClick={() => setChartMode("weekly")}
                >
                  Weekly
                </button>
              </div>
            </div>
            <LineChart
              data={
                chartMode === "daily" ? data.daily_stats : data.weekly_stats
              }
              labelKey={chartMode === "daily" ? "date" : "week"}
              valueKey="count"
            />
          </div>

          {data.country_stats.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>By country</h2>
              {data.country_stats.map((item) => (
                <HBar
                  key={item.country}
                  label={COUNTRY_NAMES[item.country] || item.country}
                  value={item.count}
                  max={maxCountry}
                  color="#667eea"
                />
              ))}
            </div>
          )}

          {data.top_cleaners.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Top cleaners</h2>
              <div style={styles.cleanerHeader}>
                <span>Email</span>
                <span>Country</span>
                <span>Assigned</span>
                <span>Completed</span>
                <span>Rate</span>
              </div>
              {data.top_cleaners.map((c, i) => (
                <div key={i} style={styles.cleanerRow}>
                  <span style={styles.cleanerEmail}>{c.email}</span>
                  <span style={styles.cleanerCell}>
                    {COUNTRY_NAMES[c.country] || c.country || "—"}
                  </span>
                  <span style={styles.cleanerCell}>{c.task_count}</span>
                  <span style={styles.cleanerCell}>{c.completed_count}</span>
                  <span
                    style={{
                      ...styles.cleanerCell,
                      color:
                        c.completion_rate >= 80
                          ? "#10b981"
                          : c.completion_rate >= 50
                            ? "#f59e0b"
                            : "#ef4444",
                      fontWeight: "600",
                    }}
                  >
                    {c.completion_rate}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: { textAlign: "center", padding: "40px", color: "#888" },
  filtersCard: {
    background: "white",
    borderRadius: "12px",
    padding: "20px 24px",
    marginBottom: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  filtersForm: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  filterField: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "13px", fontWeight: "600", color: "#555" },
  input: {
    padding: "8px 12px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "14px",
  },
  primaryBtn: {
    padding: "10px 24px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  cardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  statCard: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  statNumber: {
    fontSize: "32px",
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: "4px",
  },
  statLabel: { fontSize: "13px", color: "#888" },
  statSub: { fontSize: "11px", color: "#aaa", marginTop: "4px" },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "16px",
  },
  section: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    marginBottom: "16px",
  },
  sectionTitle: { margin: "0 0 20px", fontSize: "18px", color: "#1a1a2e" },
  chartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  chartToggle: {
    display: "flex",
    border: "2px solid #667eea",
    borderRadius: "8px",
    overflow: "hidden",
  },
  toggleBtn: {
    padding: "6px 16px",
    border: "none",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  barLabel: {
    width: "90px",
    fontSize: "13px",
    color: "#555",
    flexShrink: 0,
    textTransform: "capitalize",
  },
  barTrack: {
    flex: 1,
    height: "8px",
    background: "#f0f0f0",
    borderRadius: "4px",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: "4px", transition: "width 0.4s" },
  barCount: {
    width: "30px",
    fontSize: "13px",
    color: "#888",
    textAlign: "right",
    flexShrink: 0,
  },
  cleanerHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
    gap: "16px",
    padding: "8px 0",
    borderBottom: "2px solid #f0f0f0",
    fontSize: "12px",
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: "8px",
  },
  cleanerRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
    gap: "16px",
    padding: "12px 0",
    borderBottom: "1px solid #f0f0f0",
    alignItems: "center",
  },
  cleanerEmail: { fontSize: "14px", fontWeight: "500", color: "#1a1a2e" },
  cleanerCell: { fontSize: "14px", color: "#555" },
};
