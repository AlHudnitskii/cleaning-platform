import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { errorMessage } from "../api/errors";
import type { UserRole } from "../api/types";
import { useAuth, useCurrentUser } from "../auth/useAuth";
import { homePath } from "../auth/homePath";
import { usePushNotifications } from "../features/push/usePushNotifications";
import { useTaskCount } from "../features/tasks/api";
import { ROLE_LABELS } from "../labels";
import { focusPageSearch, shortcutsBlocked, useShortcut } from "../shortcuts";
import { BrandMark } from "./BrandMark";
import { PageErrorBoundary } from "./ErrorBoundary";
import { Icon, type IconName } from "./Icon";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { ThemeSwitch } from "./ThemeSwitch";
import { ToastHost } from "./Toasts";

type Counter = "review" | "pending";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: readonly UserRole[];
  counter?: Counter;
}

const COUNTER_TEXT: Record<Counter, string> = {
  review: "waiting for review",
  pending: "not started",
};

const MANAGERS: readonly UserRole[] = ["admin", "manager"];

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "dashboard", roles: MANAGERS },
      { to: "/reports", label: "Reports", icon: "reports", roles: MANAGERS },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/tasks", label: "Tasks", icon: "tasks", roles: MANAGERS, counter: "review" },
      { to: "/my-tasks", label: "My tasks", icon: "tasks", roles: ["cleaner"], counter: "pending" },
      { to: "/locations", label: "Locations", icon: "locations", roles: MANAGERS },
    ],
  },
  {
    title: "Data",
    items: [
      { to: "/import", label: "Import", icon: "import", roles: MANAGERS },
      { to: "/export", label: "Export", icon: "export", roles: MANAGERS },
    ],
  },
  {
    title: "Administration",
    items: [{ to: "/users", label: "Users", icon: "users", roles: ["admin"] }],
  },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  reports: "Reports",
  tasks: "Tasks",
  "my-tasks": "My tasks",
  locations: "Locations",
  import: "Import",
  export: "Export",
  users: "Users",
  profile: "Profile",
};

const COLLAPSED_KEY = "cleaning-sidebar-collapsed";
const SEQUENCE_TIMEOUT_MS = 1200;
const GO_TO: Record<string, string> = {
  d: "/dashboard",
  t: "/tasks",
  r: "/reports",
  l: "/locations",
  u: "/users",
  p: "/profile",
};

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function storeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {
    return;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const allowedPaths = new Set([
    "/profile",
    ...NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => item.roles.includes(user.role))
      .map((item) => item.to),
  ]);
  const goTo = useEffectEvent((key: string) => {
    const target = key === "t" && user.role === "cleaner" ? "/my-tasks" : GO_TO[key];
    if (target && allowedPaths.has(target)) void navigate(target);
  });

  useShortcut("/", () => {
    focusPageSearch();
  });
  useShortcut("?", () => setHelpOpen(true));

  useEffect(() => {
    let armedAt = 0;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shortcutsBlocked(event)) return;
      const key = event.key.toLowerCase();
      if (armedAt && Date.now() - armedAt < SEQUENCE_TIMEOUT_MS && key in GO_TO) {
        event.preventDefault();
        armedAt = 0;
        goTo(key);
        return;
      }
      armedAt = key === "g" ? Date.now() : 0;
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
  const isCleaner = user.role === "cleaner";
  const counters: Record<Counter, number | undefined> = {
    review: useTaskCount("on_review", !isCleaner).data,
    pending: useTaskCount("pending", isCleaner).data,
  };
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(user.role)),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      storeCollapsed(!value);
      return !value;
    });
  };

  return (
    <div className={`app${collapsed ? " app-collapsed" : ""}${menuOpen ? " app-menu-open" : ""}`}>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-brand">
          <BrandMark />
          <span className="brand-name">Cleaning Platform</span>
          <button type="button" className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          {groups.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className="nav-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon name={item.icon} />
                  <span className="nav-label">{item.label}</span>
                  {item.counter && <NavCounter value={counters[item.counter]} text={COUNTER_TEXT[item.counter]} />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item sidebar-footer-item"
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="?"
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="keyboard" />
            <span className="nav-label">Shortcuts</span>
            <kbd className="kbd nav-label-kbd" aria-hidden="true">
              ?
            </kbd>
          </button>
          <button
            type="button"
            className="nav-item sidebar-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <Icon name="sidebar" />
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>
      <button type="button" className="sidebar-backdrop" aria-label="Close menu" tabIndex={-1} onClick={() => setMenuOpen(false)} />

      <div className="sheet">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar-menu"
            aria-label="Open menu"
            aria-controls="sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <Breadcrumbs pathname={location.pathname} role={user.role} />
          <span className="topbar-spacer" />
          <TopbarActions />
        </header>
        <main className="content">
          <div className="content-inner page-enter" key={location.pathname}>
            <PageErrorBoundary>{children}</PageErrorBoundary>
          </div>
        </main>
      </div>
      <ToastHost />
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function NavCounter({ value, text }: { value: number | undefined; text: string }) {
  if (!value) return null;
  return (
    <span className="nav-counter">
      <span aria-hidden="true">{value > 99 ? "99+" : value}</span>
      <span className="visually-hidden">
        , {value} {text}
      </span>
    </span>
  );
}

function Breadcrumbs({ pathname, role }: { pathname: string; role: UserRole }) {
  const [section = "", detail] = pathname.split("/").filter(Boolean);
  const isTaskDetail = section === "tasks" && detail !== undefined;
  const parentSection = isTaskDetail && role === "cleaner" ? "my-tasks" : section;
  const sectionTitle = PAGE_TITLES[parentSection] ?? "Not found";

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link className="crumb-link" to={homePath(role)}>
        Home
      </Link>
      <span className="crumb-separator" aria-hidden="true">
        /
      </span>
      {isTaskDetail ? (
        <>
          <Link className="crumb-link" to={`/${parentSection}`}>
            {sectionTitle}
          </Link>
          <span className="crumb-separator" aria-hidden="true">
            /
          </span>
          <span className="crumb-current" aria-current="page">
            Task
          </span>
        </>
      ) : (
        <span className="crumb-current" aria-current="page">
          {sectionTitle}
        </span>
      )}
    </nav>
  );
}

function TopbarActions() {
  const user = useCurrentUser();
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const push = usePushNotifications();
  const offline = state.status === "authenticated" && state.offline;

  const handleLogout = async () => {
    await push.forget();
    await logout();
    void navigate("/login");
  };

  return (
    <div className="topbar-actions">
      {offline && <span className="badge tone-warning">Offline</span>}
      {push.supported && (
        <button
          type="button"
          className={`icon-button${push.enabled ? " is-on" : ""}`}
          aria-pressed={push.enabled}
          aria-label="Push notifications"
          title={
            push.toggle.isError
              ? errorMessage(push.toggle.error)
              : push.enabled
                ? "Notifications are on. Click to turn them off"
                : "Notifications are off. Click to turn them on"
          }
          disabled={push.toggle.isPending}
          onClick={() => push.toggle.mutate(!push.enabled)}
        >
          <Icon name="bell" />
          {push.enabled && <span className="icon-button-dot" aria-hidden="true" />}
        </button>
      )}
      <ThemeSwitch />
      <Link to="/profile" className="user-chip" aria-label={`Profile of ${user.email} (${ROLE_LABELS[user.role]})`}>
        <span className="avatar" aria-hidden="true">
          {user.email.charAt(0).toUpperCase()}
        </span>
        <span className="user-chip-text" aria-hidden="true">
          <span className="user-chip-email">{user.email}</span>
          <span className="user-chip-role">{ROLE_LABELS[user.role]}</span>
        </span>
      </Link>
      <button type="button" className="icon-button" aria-label="Log out" title="Log out" onClick={handleLogout}>
        <Icon name="logout" />
      </button>
    </div>
  );
}
