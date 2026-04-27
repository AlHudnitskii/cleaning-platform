import { useState, useEffect } from "react";
import client from "../api/client";

const STATUS_COLORS = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  completed: "#10b981",
};

const COUNTRY_NAMES = {
  DE: "Germany",
  DK: "Denmark",
  IT: "Italy",
  AU: "Australia",
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get("/stats/dashboard")
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={styles.center}>Загрузка...</div>;
  if (!stats) return <div style={styles.center}>Нет данных</div>;

  const completionRate =
    stats.total_tasks > 0
      ? Math.round((stats.status_stats.completed / stats.total_tasks) * 100)
      : 0;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Dashboard</h1>

      <div style={styles.cardsRow}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{stats.total_tasks}</div>
          <div style={styles.statLabel}>Всего задач</div>
        </div>
        <div style={{ ...styles.statCard, borderTop: "4px solid #f59e0b" }}>
          <div style={{ ...styles.statNumber, color: "#f59e0b" }}>
            {stats.status_stats.pending}
          </div>
          <div style={styles.statLabel}>Ожидают</div>
        </div>
        <div style={{ ...styles.statCard, borderTop: "4px solid #3b82f6" }}>
          <div style={{ ...styles.statNumber, color: "#3b82f6" }}>
            {stats.status_stats.in_progress}
          </div>
          <div style={styles.statLabel}>В работе</div>
        </div>
        <div style={{ ...styles.statCard, borderTop: "4px solid #10b981" }}>
          <div style={{ ...styles.statNumber, color: "#10b981" }}>
            {stats.status_stats.completed}
          </div>
          <div style={styles.statLabel}>Выполнено</div>
        </div>
        <div style={{ ...styles.statCard, borderTop: "4px solid #667eea" }}>
          <div style={{ ...styles.statNumber, color: "#667eea" }}>
            {completionRate}%
          </div>
          <div style={styles.statLabel}>Выполнено %</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{stats.total_users}</div>
          <div style={styles.statLabel}>Пользователей</div>
        </div>
      </div>

      <div style={styles.row}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Задачи по странам</h2>
          {stats.country_stats.map((item) => (
            <div key={item.country} style={styles.barRow}>
              <span style={styles.barLabel}>
                {COUNTRY_NAMES[item.country] || item.country}
              </span>
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.barFill,
                    width: `${(item.count / stats.total_tasks) * 100}%`,
                  }}
                />
              </div>
              <span style={styles.barCount}>{item.count}</span>
            </div>
          ))}
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Топ локации</h2>
          {stats.top_locations.map((loc, i) => (
            <div key={i} style={styles.locRow}>
              <div style={styles.locRank}>{i + 1}</div>
              <div>
                <div style={styles.locName}>{loc.name}</div>
                <div style={styles.locLevel}>{loc.level}</div>
              </div>
              <div style={styles.locCount}>{loc.count} задач</div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Задачи за последние 7 дней</h2>
        {stats.daily_stats.length === 0 ? (
          <div style={styles.empty}>Нет данных за последние 7 дней</div>
        ) : (
          <div style={styles.chartRow}>
            {stats.daily_stats.map((item) => (
              <div key={item.date} style={styles.chartCol}>
                <div style={styles.chartBarWrap}>
                  <div
                    style={{
                      ...styles.chartBar,
                      height: `${Math.max((item.count / Math.max(...stats.daily_stats.map((d) => d.count))) * 120, 8)}px`,
                    }}
                  />
                </div>
                <div style={styles.chartCount}>{item.count}</div>
                <div style={styles.chartDate}>{item.date.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  title: { margin: "0 0 24px", fontSize: "28px", color: "#1a1a2e" },
  center: { textAlign: "center", padding: "60px", color: "#888" },
  empty: { textAlign: "center", padding: "40px", color: "#888" },
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
    borderTop: "4px solid #eee",
    textAlign: "center",
  },
  statNumber: {
    fontSize: "36px",
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: "4px",
  },
  statLabel: { fontSize: "13px", color: "#888" },
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
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  barLabel: { width: "80px", fontSize: "14px", color: "#555" },
  barTrack: {
    flex: 1,
    height: "8px",
    background: "#f0f0f0",
    borderRadius: "4px",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: "#667eea",
    borderRadius: "4px",
    transition: "width 0.3s",
  },
  barCount: {
    width: "30px",
    fontSize: "14px",
    color: "#888",
    textAlign: "right",
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
  },
  locName: { fontSize: "14px", fontWeight: "600", color: "#1a1a2e" },
  locLevel: { fontSize: "12px", color: "#888" },
  locCount: {
    marginLeft: "auto",
    fontSize: "13px",
    color: "#667eea",
    fontWeight: "600",
  },
  chartRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    height: "160px",
  },
  chartCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  chartBarWrap: {
    flex: 1,
    display: "flex",
    alignItems: "flex-end",
    width: "100%",
  },
  chartBar: {
    width: "100%",
    background: "#667eea",
    borderRadius: "4px 4px 0 0",
  },
  chartCount: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#667eea",
    marginTop: "4px",
  },
  chartDate: { fontSize: "11px", color: "#888" },
};
