import { useState, type SubmitEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/useAuth";
import { homePath } from "../auth/homePath";
import { Notice } from "../components/Feedback";
import { Field } from "../components/Field";

export function Login() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") return <Navigate to={homePath(state.user.role)} replace />;

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      void navigate(homePath(user.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title" className="login-title">
          Cleaning Platform
        </h1>
        <p className="login-subtitle">Sign in to continue</p>
        {error && <Notice tone="error">{error}</Notice>}
        <form onSubmit={handleSubmit} className="stack">
          <Field label="Email">
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
