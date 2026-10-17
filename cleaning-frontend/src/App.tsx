import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { homePath } from "./auth/homePath";
import { RequireRole } from "./auth/RequireRole";
import { useAuth } from "./auth/useAuth";
import { AppShell } from "./components/AppShell";
import { Loading, NotFoundState } from "./components/Feedback";
import { useTaskEvents } from "./features/realtime/useTaskEvents";
import { t, useLocale } from "./i18n/locale";
import { Login } from "./pages/Login";

const ChecklistTemplates = lazy(() =>
  import("./pages/ChecklistTemplates").then((module) => ({ default: module.ChecklistTemplates })),
);
const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const Export = lazy(() => import("./pages/Export").then((module) => ({ default: module.Export })));
const Import = lazy(() => import("./pages/Import").then((module) => ({ default: module.Import })));
const Locations = lazy(() => import("./pages/Locations").then((module) => ({ default: module.Locations })));
const MyTasks = lazy(() => import("./pages/MyTasks").then((module) => ({ default: module.MyTasks })));
const Profile = lazy(() => import("./pages/Profile").then((module) => ({ default: module.Profile })));
const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const TaskDetail = lazy(() => import("./pages/TaskDetail").then((module) => ({ default: module.TaskDetail })));
const Tasks = lazy(() => import("./pages/Tasks").then((module) => ({ default: module.Tasks })));
const Users = lazy(() => import("./pages/Users").then((module) => ({ default: module.Users })));

const MANAGERS = ["admin", "manager"] as const;

function AppLayout() {
  const { state } = useAuth();
  useTaskEvents(state.status === "authenticated" && !state.offline);
  return (
    <AppShell>
      <Suspense fallback={<Loading label={t().app.loadingPage} />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

function HomeRedirect() {
  const { state } = useAuth();
  if (state.status === "loading") return <Loading label={t().app.restoringSession} />;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return <Navigate to={homePath(state.user.role)} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route
        element={
          <RequireRole>
            <AppLayout />
          </RequireRole>
        }
      >
        <Route path="/dashboard" element={guard(MANAGERS, <Dashboard />)} />
        <Route path="/tasks" element={guard(MANAGERS, <Tasks />)} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/my-tasks" element={guard(["cleaner"], <MyTasks />)} />
        <Route path="/locations" element={guard(MANAGERS, <Locations />)} />
        <Route path="/checklist-templates" element={guard(MANAGERS, <ChecklistTemplates />)} />
        <Route path="/reports" element={guard(MANAGERS, <Reports />)} />
        <Route path="/import" element={guard(MANAGERS, <Import />)} />
        <Route path="/export" element={guard(MANAGERS, <Export />)} />
        <Route path="/users" element={guard(["admin"], <Users />)} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<NotFoundState />} />
      </Route>
    </Routes>
  );
}

function guard(roles: readonly ("admin" | "manager" | "cleaner")[], element: ReactNode) {
  return <RequireRole roles={roles}>{element}</RequireRole>;
}

export function LocalizedRoutes() {
  useLocale();
  return <AppRoutes />;
}

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <LocalizedRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
