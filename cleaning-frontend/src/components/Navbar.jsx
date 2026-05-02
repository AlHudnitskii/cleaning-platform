import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { usePushNotifications } from "../hooks/usePushNotifications";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isSupported, isSubscribed, subscribe, unsubscribe, loading } =
    usePushNotifications();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.left}>
        <span style={styles.logo}>Cleaning Platform</span>
        {user?.role !== "cleaner" && (
          <>
            <Link style={styles.link} to="/dashboard">
              Dashboard
            </Link>
            <Link style={styles.link} to="/tasks">
              Tasks
            </Link>
            <Link style={styles.link} to="/locations">
              Locations
            </Link>
            <Link style={styles.link} to="/reports">
              Reports
            </Link>
            <Link style={styles.link} to="/import">
              Import
            </Link>
            <Link style={styles.link} to="/export">
              Export
            </Link>
            {user?.role === "admin" && (
              <Link style={styles.link} to="/users">
                Users
              </Link>
            )}
          </>
        )}
        {user?.role === "cleaner" && (
          <Link style={styles.link} to="/my-tasks">
            My Tasks
          </Link>
        )}
      </div>
      <div style={styles.right}>
        {isSupported && (
          <button
            style={{
              ...styles.pushBtn,
              background: isSubscribed ? "#d1fae5" : "#ede9fe",
              color: isSubscribed ? "#065f46" : "#5b21b6",
            }}
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={loading}
          >
            {loading
              ? "..."
              : isSubscribed
                ? "Notifications On"
                : "Enable Notifications"}
          </button>
        )}
        <Link style={styles.profileLink} to="/profile">
          <div style={styles.avatar}>{user?.email?.[0]?.toUpperCase()}</div>
        </Link>
        <button style={styles.logout} onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 24px",
    height: "60px",
    background: "white",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  left: { display: "flex", alignItems: "center", gap: "20px" },
  right: { display: "flex", alignItems: "center", gap: "16px" },
  logo: { fontWeight: "700", fontSize: "18px", color: "#667eea" },
  link: {
    color: "#555",
    textDecoration: "none",
    fontWeight: "500",
    fontSize: "14px",
  },
  profileLink: { textDecoration: "none" },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#667eea",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  logout: {
    padding: "8px 16px",
    background: "#fee",
    color: "#c33",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
  },
  pushBtn: {
    padding: "6px 12px",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
};
