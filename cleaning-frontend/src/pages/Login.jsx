import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role === "cleaner") {
        navigate("/my-tasks");
      } else {
        navigate("/tasks");
      }
    } catch (err) {
      setError("Неверный email или пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Cleaning Platform</h1>
        <p style={styles.subtitle}>Войдите в систему</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@cleaning.com"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Пароль</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </div>
          <button
            style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    textAlign: "center",
    color: "#333",
  },
  subtitle: {
    textAlign: "center",
    color: "#888",
    marginBottom: "30px",
  },
  error: {
    background: "#fee",
    color: "#c33",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
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
    padding: "12px",
    border: "2px solid #eee",
    borderRadius: "8px",
    fontSize: "16px",
    boxSizing: "border-box",
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "8px",
  },
};
