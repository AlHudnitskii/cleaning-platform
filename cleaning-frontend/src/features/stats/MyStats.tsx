import type { UserResponse } from "../../api/types";
import { StatCard } from "../../components/Charts";
import { ErrorState, StatsSkeleton } from "../../components/Feedback";
import { t } from "../../i18n/locale";
import { countryName, formatDuration } from "../../labels";
import { useProfileStats } from "./api";

function scopeText(user: UserResponse): string {
  if (user.role === "cleaner") return t().myStats.scopeOwn;
  if (user.role === "manager") return t().myStats.scopeCountry(countryName(user.country));
  return t().myStats.scopeAll;
}

export function MyStats({ user }: { user: UserResponse }) {
  const stats = useProfileStats();
  const listPath = user.role === "cleaner" ? "/my-tasks" : "/tasks";
  return (
    <section className="card" aria-labelledby="my-stats-title">
      <h2 id="my-stats-title" className="section-title">
        {t().myStats.title}
      </h2>
      {stats.isPending ? (
        <StatsSkeleton label={t().myStats.loading} />
      ) : stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <>
          <p className="field-hint">{`${scopeText(user)} ${t().myStats.period(stats.data.period_days)}`}</p>
          <div className="stat-grid stat-grid-5">
            <StatCard label={t().myStats.completed} value={stats.data.completed} tone="success" />
            <StatCard
              label={t().myStats.open}
              value={stats.data.open}
              tone="info"
              sub={t().myStats.onReview(stats.data.on_review)}
              to={listPath}
            />
            <StatCard
              label={t().myStats.overdue}
              value={stats.data.overdue}
              tone={stats.data.overdue > 0 ? "danger" : "neutral"}
              to={user.role === "cleaner" ? undefined : "/tasks?overdue=true"}
            />
            <StatCard
              label={t().myStats.quality}
              value={stats.data.avg_quality !== null ? stats.data.avg_quality.toFixed(1) : "—"}
              tone="warning"
              sub={stats.data.avg_quality === null ? t().myStats.noReviews : undefined}
            />
            <StatCard
              label={t().myStats.workTime}
              value={stats.data.avg_work_seconds !== null ? formatDuration(stats.data.avg_work_seconds) : "—"}
              tone="accent"
              sub={stats.data.avg_work_seconds === null ? t().myStats.noWork : undefined}
            />
          </div>
        </>
      )}
    </section>
  );
}
