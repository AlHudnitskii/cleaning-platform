import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { homePath } from "./auth/homePath";
import { RequireRole } from "./auth/RequireRole";
import { useAuth } from "./auth/useAuth";
import { AppShell } from "./components/AppShell";
import { Loading, NotFoundState } from "./components/Feedback";
import { useTaskEvents } from "./features/realtime/useTaskEvents";
import { Dashboard } from "./pages/Dashboard";
import { Export } from "./pages/Export";
import { Import } from "./pages/Import";
import { Locations } from "./pages/Locations";
import { Login } from "./pages/Login";
import { MyTasks } from "./pages/MyTasks";
import { Profile } from "./pages/Profile";
import { Reports } from "./pages/Reports";
import { TaskDetail } from "./pages/TaskDetail";
import { Tasks } from "./pages/Tasks";
import { Users } from "./pages/Users";

const MANAGERS = ["admin", "manager"] as const;

function AppLayout() {
  const { state } = useAuth();
  useTaskEvents(state.status === "authenticated" && !state.offline);
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function HomeRedirect() {
  const { state } = useAuth();
  if (state.status === "loading") return <Loading label="Restoring session" />;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return <Navigate to={homePath(state.user.role)} replace />;
}

export function AppRoutes() {
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

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
