import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

const COUNTRY_NAMES = {
  DE: "Germany",
  DK: "Denmark",
  IT: "Italy",
  AU: "Australia",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  ES: "Spain",
  PL: "Poland",
  NL: "Netherlands",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  CH: "Switzerland",
  AT: "Austria",
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

function StatCard({ label, value, color, sub, onClick }) {
  return (
    <div
      style={{
        ...styles.statCard,
        borderTop: `4px solid ${color || "#eee"}`,
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
    >
      <div style={{ ...styles.statNumber, color: color || "#1a1a2e" }}>
        {value}
      </div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function HBar({ label, value, max, color, onClick }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div
      style={{ ...styles.barRow, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
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

function BarChart({ data, onBarClick }) {
  if (!data || data.length === 0) {
    return <div style={styles.empty}>No data for the last 7 days</div>;
  }

  const max = Math.max(...data.map((d) => d.count));

  return (
    <div style={styles.chartWrap}>
      <div style={styles.chartYAxis}>
        {[max, Math.round(max / 2), 0].map((v, i) => (
          <div key={i} style={styles.chartYLabel}>
            {v}
          </div>
        ))}
      </div>
      <div style={styles.chartArea}>
        <div style={styles.chartGridLines}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={styles.chartGridLine} />
          ))}
        </div>
        <div style={styles.chartBars}>
          {data.map((item) => (
            <div
              key={item.date}
              style={{ ...styles.chartCol, cursor: "pointer" }}
              onClick={() => onBarClick && onBarClick(item.date)}
            >
              <div style={styles.chartBarWrap}>
                <div
                  style={{
                    ...styles.chartBar,
                    height: `${max > 0 ? (item.count / max) * 100 : 0}%`,
                  }}
                >
                  <span style={styles.chartBarValue}>{item.count}</span>
                </div>
              </div>
              <div style={styles.chartDate}>{item.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StarScore({ value }) {
  if (!value) return <span style={styles.noData}>No reviews yet</span>;
  return (
    <div style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          style={{
            ...styles.star,
            color: s <= Math.round(value) ? "#f59e0b" : "#ddd",
          }}
        >
          *
        </span>
      ))}
      <span style={styles.starValue}>{value.toFixed(1)}</span>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get("/stats/dashboard")
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false));
  }, []);

  const goToTasks = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    navigate(`/tasks${query ? `?${query}` : ""}`);
  };

  if (loading) return <div style={styles.center}>Loading...</div>;
  if (!stats) return <div style={styles.center}>No data</div>;

  const completionRate =
    stats.total_tasks > 0
      ? Math.round((stats.status_stats.completed / stats.total_tasks) * 100)
      : 0;

  const maxCountry = Math.max(...stats.country_stats.map((c) => c.count), 1);
  const maxPriority = Math.max(...Object.values(stats.priority_stats), 1);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Dashboard</h1>

      <div style={styles.cardsRow}>
        <StatCard
          label="Total tasks"
          value={stats.total_tasks}
          color="#667eea"
          onClick={() => goToTasks()}
        />
        <StatCard
          label="Pending"
          value={stats.status_stats.pending}
          color="#f59e0b"
          onClick={() => goToTasks({ status: "pending" })}
        />
        <StatCard
          label="In progress"
          value={stats.status_stats.in_progress}
          color="#3b82f6"
          onClick={() => goToTasks({ status: "in_progress" })}
        />
        <StatCard
          label="Completed"
          value={stats.status_stats.completed}
          color="#10b981"
          onClick={() => goToTasks({ status: "completed" })}
        />
        <StatCard label="Done %" value={`${completionRate}%`} color="#10b981" />
        <StatCard
          label="Recurring"
          value={stats.recurring_count}
          color="#8b5cf6"
        />
        <StatCard
          label="Avg quality"
          value={stats.avg_quality ? stats.avg_quality.toFixed(1) : "—"}
          color="#f59e0b"
          sub={stats.reviewed_count ? `${stats.reviewed_count} reviews` : null}
        />
        <StatCard label="Users" value={stats.total_users} color="#64748b" />
      </div>

      <div style={styles.row}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Tasks by country</h2>
          {stats.country_stats.map((item) => (
            <HBar
              key={item.country}
              label={COUNTRY_NAMES[item.country] || item.country}
              value={item.count}
              max={maxCountry}
              color="#667eea"
              onClick={() => goToTasks({ country: item.country })}
            />
          ))}
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Tasks by priority</h2>
          {Object.entries(stats.priority_stats).map(([priority, count]) => (
            <HBar
              key={priority}
              label={PRIORITY_LABELS[priority]}
              value={count}
              max={maxPriority}
              color={PRIORITY_COLORS[priority]}
              onClick={() => goToTasks({ priority })}
            />
          ))}

          <h2 style={{ ...styles.sectionTitle, marginTop: "24px" }}>
            Quality score
          </h2>
          <StarScore value={stats.avg_quality} />
          {stats.reviewed_count > 0 && (
            <div style={styles.reviewedCount}>
              Based on {stats.reviewed_count} completed tasks
            </div>
          )}
        </div>
      </div>

      <div style={styles.row}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Top locations</h2>
          {stats.top_locations.map((loc, i) => (
            <div
              key={i}
              style={{
                ...styles.locRow,
                cursor: loc.id ? "pointer" : "default",
              }}
              onClick={() => loc.id && goToTasks({ location_id: loc.id })}
            >
              <div style={styles.locRank}>{i + 1}</div>
              <div style={styles.locInfo}>
                <div style={styles.locName}>{loc.name}</div>
                <div style={styles.locLevel}>{loc.level}</div>
              </div>
              <div style={styles.locCount}>{loc.count} tasks</div>
            </div>
          ))}
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Tasks for the last 7 days</h2>
          <BarChart
            data={stats.daily_stats}
            onBarClick={(date) => goToTasks({ date_from: date, date_to: date })}
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: { textAlign: "center", padding: "40px", color: "#888" },
  noData: { fontSize: "14px", color: "#aaa" },
  cardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  statCard: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    textAlign: "center",
    transition: "box-shadow 0.2s",
  },
  statNumber: { fontSize: "32px", fontWeight: "700", marginBottom: "4px" },
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
  },
  sectionTitle: { margin: "0 0 20px", fontSize: "18px", color: "#1a1a2e" },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  barLabel: { width: "90px", fontSize: "13px", color: "#555", flexShrink: 0 },
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
  locRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  locRank: {
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
  locInfo: { flex: 1 },
  locName: { fontSize: "14px", fontWeight: "600", color: "#1a1a2e" },
  locLevel: { fontSize: "12px", color: "#888" },
  locCount: {
    fontSize: "13px",
    color: "#667eea",
    fontWeight: "600",
    flexShrink: 0,
  },
  starRow: { display: "flex", alignItems: "center", gap: "4px" },
  star: { fontSize: "24px", lineHeight: 1 },
  starValue: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#f59e0b",
    marginLeft: "8px",
  },
  reviewedCount: { fontSize: "12px", color: "#aaa", marginTop: "8px" },
  chartWrap: { display: "flex", gap: "8px", height: "180px" },
  chartYAxis: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    paddingBottom: "20px",
  },
  chartYLabel: {
    fontSize: "11px",
    color: "#aaa",
    textAlign: "right",
    width: "24px",
  },
  chartArea: { flex: 1, position: "relative" },
  chartGridLines: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    pointerEvents: "none",
  },
  chartGridLine: { borderTop: "1px dashed #f0f0f0", width: "100%" },
  chartBars: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "flex-end",
    gap: "4px",
  },
  chartCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    height: "100%",
  },
  chartBarWrap: {
    flex: 1,
    width: "100%",
    display: "flex",
    alignItems: "flex-end",
  },
  chartBar: {
    width: "100%",
    background: "#667eea",
    borderRadius: "4px 4px 0 0",
    position: "relative",
    transition: "height 0.4s",
    minHeight: "4px",
  },
  chartBarValue: {
    position: "absolute",
    top: "-18px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "11px",
    fontWeight: "600",
    color: "#667eea",
    whiteSpace: "nowrap",
  },
  chartDate: {
    fontSize: "11px",
    color: "#888",
    marginTop: "4px",
    whiteSpace: "nowrap",
  },
};
