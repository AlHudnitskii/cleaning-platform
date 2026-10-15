import { NavLink, useNavigate } from "react-router-dom";

import { errorMessage } from "../api/errors";
import type { UserRole } from "../api/types";
import { useAuth, useCurrentUser } from "../auth/useAuth";
import { usePushNotifications } from "../features/push/usePushNotifications";
import { ROLE_LABELS } from "../labels";

const LINKS: { to: string; label: string; roles: readonly UserRole[] }[] = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "manager"] },
  { to: "/tasks", label: "Tasks", roles: ["admin", "manager"] },
  { to: "/my-tasks", label: "My tasks", roles: ["cleaner"] },
  { to: "/locations", label: "Locations", roles: ["admin", "manager"] },
  { to: "/reports", label: "Reports", roles: ["admin", "manager"] },
  { to: "/import", label: "Import", roles: ["admin", "manager"] },
  { to: "/export", label: "Export", roles: ["admin", "manager"] },
  { to: "/users", label: "Users", roles: ["admin"] },
];

export function Navbar() {
  const user = useCurrentUser();
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const push = usePushNotifications();
  const offline = state.status === "authenticated" && state.offline;

  const handleLogout = async () => {
    await logout();
    void navigate("/login");
  };

  return (
    <header className="navbar">
      <nav className="navbar-left" aria-label="Main">
        <span className="navbar-logo">Cleaning Platform</span>
        {LINKS.filter((link) => link.roles.includes(user.role)).map((link) => (
          <NavLink key={link.to} to={link.to} className="navbar-link">
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="navbar-right">
        {offline && <span className="badge tone-warning">Offline</span>}
        {push.supported && (
          <button
            type="button"
            className={push.enabled ? "btn btn-success btn-small" : "btn btn-secondary btn-small"}
            aria-pressed={push.enabled}
            disabled={push.toggle.isPending}
            title={push.toggle.isError ? errorMessage(push.toggle.error) : undefined}
            onClick={() => push.toggle.mutate(!push.enabled)}
          >
            {push.toggle.isPending ? "Updating…" : push.enabled ? "Notifications on" : "Enable notifications"}
          </button>
        )}
        <NavLink to="/profile" className="avatar" aria-label={`Profile of ${user.email} (${ROLE_LABELS[user.role]})`}>
          <span aria-hidden="true">{user.email.charAt(0).toUpperCase()}</span>
        </NavLink>
        <button type="button" className="btn btn-danger btn-small" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
