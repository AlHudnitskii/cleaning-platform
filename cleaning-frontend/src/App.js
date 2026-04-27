import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import MyTasks from "./pages/MyTasks";
import Locations from "./pages/Locations";
import Export from "./pages/Export";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>Загрузка...</div>
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
