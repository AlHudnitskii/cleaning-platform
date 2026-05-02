import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import MyTasks from "./pages/MyTasks";
import Locations from "./pages/Locations";
import Export from "./pages/Export";
import Import from "./pages/Import";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>
    );
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/tasks"
          element={
            <PrivateRoute roles={["admin", "manager"]}>
              <Tasks />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute roles={["admin", "manager"]}>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PrivateRoute roles={["admin", "manager"]}>
              <Reports />
            </PrivateRoute>
          }
        />
        <Route
          path="/users"
          element={
            <PrivateRoute roles={["admin"]}>
              <Users />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />
        <Route
          path="/my-tasks"
          element={
            <PrivateRoute roles={["cleaner"]}>
              <MyTasks />
            </PrivateRoute>
          }
        />
        <Route
          path="/locations"
          element={
            <PrivateRoute roles={["admin", "manager"]}>
              <Locations />
            </PrivateRoute>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <PrivateRoute roles={["admin", "manager", "cleaner"]}>
              <TaskDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/export"
          element={
            <PrivateRoute roles={["admin", "manager"]}>
              <Export />
            </PrivateRoute>
          }
        />
        <Route
          path="/import"
          element={
            <PrivateRoute roles={["admin", "manager"]}>
              <Import />
            </PrivateRoute>
          }
        />
        <Route
          path="/"
          element={
            user ? (
              user.role === "cleaner" ? (
                <Navigate to="/my-tasks" />
              ) : (
                <Navigate to="/tasks" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
