import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { errorMessage } from "../api/errors";
import type { UserRole } from "../api/types";
import { useAuth, useCurrentUser } from "../auth/useAuth";
import { homePath } from "../auth/homePath";
import { clearOfflineData, pendingChanges } from "../features/offline/offlineStore";
import { sendPendingChanges } from "../features/offline/useOfflineSync";
import { usePushNotifications } from "../features/push/usePushNotifications";
import { useTaskCount } from "../features/tasks/api";
import { t } from "../i18n/locale";
import { focusPageSearch, shortcutsBlocked, useShortcut } from "../shortcuts";
import { BrandMark } from "./BrandMark";
import { ConfirmDialog } from "./ConfirmDialog";
import { PageErrorBoundary } from "./ErrorBoundary";
import { Icon, type IconName } from "./Icon";
import { LanguageSwitch } from "./LanguageSwitch";
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

function counterText(counter: Counter): string {
  return counter === "review" ? t().nav.waitingForReview : t().nav.notStarted;
}

const MANAGERS: readonly UserRole[] = ["admin", "manager"];

function navGroups(): { title: string; items: NavItem[] }[] {
  const nav = t().nav;
  return [
    {
      title: nav.overview,
      items: [
        { to: "/dashboard", label: nav.dashboard, icon: "dashboard", roles: MANAGERS },
        { to: "/reports", label: nav.reports, icon: "reports", roles: MANAGERS },
      ],
    },
    {
      title: nav.operations,
      items: [
        { to: "/tasks", label: nav.tasks, icon: "tasks", roles: MANAGERS, counter: "review" },
        { to: "/my-tasks", label: nav.myTasks, icon: "tasks", roles: ["cleaner"], counter: "pending" },
        { to: "/calendar", label: nav.calendar, icon: "calendar", roles: ["admin", "manager", "cleaner"] },
        { to: "/locations", label: nav.locations, icon: "locations", roles: MANAGERS },
        { to: "/checklist-templates", label: nav.templates, icon: "check", roles: MANAGERS },
      ],
    },
    {
      title: nav.data,
      items: [
        { to: "/import", label: nav.import, icon: "import", roles: MANAGERS },
        { to: "/export", label: nav.export, icon: "export", roles: MANAGERS },
      ],
    },
    {
      title: nav.administration,
      items: [{ to: "/users", label: nav.users, icon: "users", roles: ["admin"] }],
    },
  ];
}

function pageTitle(section: string): string {
  const nav = t().nav;
  const titles: Record<string, string> = {
    dashboard: nav.dashboard,
    reports: nav.reports,
    tasks: nav.tasks,
    "my-tasks": nav.myTasks,
    locations: nav.locations,
    calendar: nav.calendar,
    "checklist-templates": nav.templates,
    import: nav.import,
    export: nav.export,
    users: nav.users,
    profile: nav.profile,
  };
  return titles[section] ?? nav.notFound;
}

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
    ...navGroups()
      .flatMap((group) => group.items)
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
  const groups = navGroups().map((group) => ({
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
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        {t().nav.skipToContent}
      </a>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-brand">
          <BrandMark />
          <span className="brand-name">{t().app.name}</span>
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label={t().nav.closeMenu}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label={t().nav.primary}>
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
                  {item.counter && <NavCounter value={counters[item.counter]} text={counterText(item.counter)} />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item sidebar-footer-item"
            aria-label={t().nav.keyboardShortcuts}
            aria-keyshortcuts="?"
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="keyboard" />
            <span className="nav-label">{t().nav.shortcuts}</span>
            <kbd className="kbd nav-label-kbd" aria-hidden="true">
              ?
            </kbd>
          </button>
          <button
            type="button"
            className="nav-item sidebar-collapse"
            aria-label={collapsed ? t().nav.expandSidebar : t().nav.collapseSidebar}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <Icon name="sidebar" />
            <span className="nav-label">{t().nav.collapse}</span>
          </button>
        </div>
      </aside>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label={t().nav.closeMenu}
        tabIndex={-1}
        onClick={() => setMenuOpen(false)}
      />

      <div className="sheet">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar-menu"
            aria-label={t().nav.openMenu}
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
        <main className="content" id="main" tabIndex={-1}>
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
  const sectionTitle = pageTitle(parentSection);

  return (
    <nav className="breadcrumbs" aria-label={t().nav.breadcrumb}>
      <Link className="crumb-link" to={homePath(role)}>
        {t().nav.home}
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
            {t().nav.task}
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
  const [unsent, setUnsent] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  const finishLogout = async () => {
    clearOfflineData(user.id);
    await push.forget();
    await logout();
    void navigate("/login");
  };

  const handleLogout = async () => {
    setLeaving(true);
    await sendPendingChanges(user.id).catch(() => null);
    const left = pendingChanges(user.id).length;
    if (left > 0) {
      setLeaving(false);
      setUnsent(left);
      return;
    }
    await finishLogout();
  };

  return (
    <div className="topbar-actions">
      {offline && <span className="badge tone-warning">{t().common.offline}</span>}
      {push.supported && (
        <button
          type="button"
          className={`icon-button${push.enabled ? " is-on" : ""}`}
          aria-pressed={push.enabled}
          aria-label={t().nav.pushNotifications}
          title={
            push.toggle.isError
              ? errorMessage(push.toggle.error)
              : push.enabled
                ? t().nav.notificationsOn
                : t().nav.notificationsOff
          }
          disabled={push.toggle.isPending}
          onClick={() => push.toggle.mutate(!push.enabled)}
        >
          <Icon name="bell" />
          {push.enabled && <span className="icon-button-dot" aria-hidden="true" />}
        </button>
      )}
      <LanguageSwitch />
      <ThemeSwitch />
      <Link to="/profile" className="user-chip" aria-label={t().nav.profileOf(user.email, t().role[user.role])}>
        <span className="avatar" aria-hidden="true">
          {user.email.charAt(0).toUpperCase()}
        </span>
        <span className="user-chip-text" aria-hidden="true">
          <span className="user-chip-email">{user.email}</span>
          <span className="user-chip-role">{t().role[user.role]}</span>
        </span>
      </Link>
      <button
        type="button"
        className="icon-button"
        aria-label={t().nav.logOut}
        title={t().nav.logOut}
        disabled={leaving}
        onClick={() => void handleLogout()}
      >
        <Icon name="logout" />
      </button>
      {unsent !== null && (
        <ConfirmDialog
          title={t().nav.unsentTitle(unsent)}
          confirmLabel={t().nav.logOutAnyway}
          onConfirm={() => void finishLogout()}
          onCancel={() => setUnsent(null)}
        >
          {t().nav.unsentHint}
        </ConfirmDialog>
      )}
    </div>
  );
}
