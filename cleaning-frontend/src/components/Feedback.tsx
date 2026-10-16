import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { toApiError } from "../api/errors";
import { t } from "../i18n/locale";

export function Loading({ label = t().common.loading }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function ListSkeleton({ label, rows = 6, columns = 6 }: { label: string; rows?: number; columns?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <span key={column} className={`skeleton-cell${column === 1 ? " skeleton-cell-wide" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ label }: { label: string }) {
  return (
    <div className="page-section" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      <div className="stat-grid stat-grid-4" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="stat-card">
            <span className="skeleton-cell skeleton-line" />
            <span className="skeleton-cell skeleton-figure" />
          </div>
        ))}
      </div>
      <div className="card skeleton-card" aria-hidden="true">
        <span className="skeleton-cell skeleton-line" />
        <span className="skeleton-cell skeleton-bar" />
      </div>
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
    return <StatusPage code="403" title={t().feedback.noAccess} hint={apiError.message} />;
  }
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{t().feedback.couldNotLoad}</p>
      <p className="state-hint">{apiError.message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {t().common.tryAgain}
        </button>
      )}
    </div>
  );
}

export function NotFoundState({ what = "page" }: { what?: "page" | "task" }) {
  return (
    <StatusPage code="404" title={t().feedback.doesNotExist(t().feedback[what])} hint={t().feedback.notFoundHint} />
  );
}

function StatusPage({ code, title, hint }: { code: string; title: string; hint: string }) {
  const navigate = useNavigate();
  return (
    <div className="status-page">
      <span className="status-code" aria-hidden="true">
        {code}
      </span>
      <h1 className="status-title">{title}</h1>
      <p className="status-hint">{hint}</p>
      <div className="button-row">
        <Link className="btn btn-primary" to="/">
          {t().common.goToStart}
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void navigate(-1)}>
          {t().common.goBack}
        </button>
      </div>
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
