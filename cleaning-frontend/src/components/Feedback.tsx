import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { toApiError } from "../api/errors";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = toApiError(error);
  if (apiError.kind === "not_found") return <NotFoundState />;
  if (apiError.kind === "forbidden") {
    return (
      <div className="state state-error" role="alert">
        <p className="state-title">Access denied</p>
        <p className="state-hint">{apiError.message}</p>
        <Link to="/">Go to start page</Link>
      </div>
    );
  }
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">Could not load data</p>
      <p className="state-hint">{apiError.message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function NotFoundState({ what = "page" }: { what?: string }) {
  return (
    <div className="state state-empty">
      <p className="state-title">This {what} does not exist</p>
      <p className="state-hint">It may have been removed, or you may not have access to it.</p>
      <Link to="/">Go to start page</Link>
    </div>
  );
}

export type NoticeTone = "info" | "success" | "warning" | "error";

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
