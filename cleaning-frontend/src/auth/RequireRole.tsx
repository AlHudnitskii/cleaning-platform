import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { UserRole } from "../api/types";
import { Loading } from "../components/Feedback";
import { homePath } from "./homePath";
import { useAuth } from "./useAuth";

export function RequireRole({ roles, children }: { roles?: readonly UserRole[]; children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <Loading label="Restoring session" />;
  if (state.status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(state.user.role)) return <Navigate to={homePath(state.user.role)} replace />;
  return children;
}
