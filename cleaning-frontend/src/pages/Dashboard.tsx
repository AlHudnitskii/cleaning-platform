import { TASK_PRIORITIES, TASK_STATUSES } from "../api/types";
import { BarList, ColumnChart, StatCard, StatusBreakdown } from "../components/Charts";
import { EmptyState, ErrorState, StatsSkeleton } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { useDashboard } from "../features/stats/api";
import { countryNames } from "../labels";
import { t } from "../i18n/locale";

function tasksLink(params: Record<string, string>): string {
  return `/tasks?${new URLSearchParams(params).toString()}`;
}

export function Dashboard() {
  const stats = useDashboard();

  if (stats.isPending) {
    return (
      <>
        <PageHeader title={t().stats.dashboard} description={t().stats.dashboardHint} />
        <StatsSkeleton label={t().stats.loadingDashboard} />
      </>
    );
  }
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;

  const data = stats.data;
  const completionRate = data.total_tasks > 0 ? Math.round((data.status_stats.completed / data.total_tasks) * 100) : 0;

  return (
    <>
      <PageHeader title={t().stats.dashboard} description={t().stats.dashboardHint} />
      {data.total_tasks === 0 ? (
        <EmptyState title={t().stats.noTasks} hint={t().stats.noTasksHint} />
      ) : (
        <>
          <div className="stat-grid stat-grid-5">
            <StatCard
              label={t().stats.totalTasks}
              value={data.total_tasks}
              tone="accent"
              to="/tasks"
              sub={t().stats.recurringUsers(data.recurring_count, data.total_users)}
            />
            <StatCard
              label={t().stats.toReview}
              value={data.status_stats.on_review}
              tone="status-on_review"
              to={tasksLink({ status: "on_review" })}
              sub={data.status_stats.on_review > 0 ? t().stats.needApproval : t().stats.nothingToReview}
            />
            <StatCard
              label={t().stats.overdue}
              value={data.overdue_count}
              tone="danger"
              to={tasksLink({ overdue: "true" })}
              sub={data.overdue_count > 0 ? t().stats.pastDue : t().stats.onTime}
            />
            <StatCard
              label={t().stats.completionRate}
              value={`${completionRate}%`}
              tone="success"
              sub={t().stats.completedOf(data.status_stats.completed, data.total_tasks)}
            />
            <StatCard
              label={t().stats.averageQuality}
              value={data.avg_quality !== null ? data.avg_quality.toFixed(1) : "—"}
              tone="warning"
              sub={data.reviewed_count > 0 ? t().stats.reviews(data.reviewed_count) : t().stats.noReviews}
            />
          </div>

          <section className="card" aria-labelledby="by-status">
            <h2 id="by-status" className="section-title">
              {t().stats.byStatus}
            </h2>
            <StatusBreakdown
              title={t().stats.statusShare}
              items={TASK_STATUSES.map((status) => ({
                key: status,
                label: t().status[status],
                value: data.status_stats[status],
                tone: `status-${status}`,
                to: tasksLink({ status }),
              }))}
            />
          </section>

          <div className="three-columns">
            <section className="card" aria-labelledby="by-country">
              <h2 id="by-country" className="section-title">
                {t().stats.byCountry}
              </h2>
              <BarList
                items={data.country_stats.map((item) => ({
                  key: item.country,
                  label: countryNames()[item.country],
                  value: item.count,
                  to: tasksLink({ country: item.country }),
                }))}
              />
            </section>
            <section className="card" aria-labelledby="by-priority">
              <h2 id="by-priority" className="section-title">
                {t().stats.byPriority}
              </h2>
              <BarList
                items={TASK_PRIORITIES.map((priority) => ({
                  key: priority,
                  label: t().priority[priority],
                  value: data.priority_stats[priority],
                  tone: `priority-${priority}`,
                  to: tasksLink({ priority }),
                }))}
              />
            </section>
            <section className="card" aria-labelledby="top-locations">
              <h2 id="top-locations" className="section-title">
                {t().stats.busiestLocations}
              </h2>
              <BarList
                items={data.top_locations.map((location) => ({
                  key: location.id,
                  label: location.name,
                  value: location.count,
                  to: tasksLink({ location_id: location.id }),
                }))}
              />
            </section>
          </div>

          <section className="card" aria-labelledby="last-days">
            <h2 id="last-days" className="section-title">
              {t().stats.lastWeek}
            </h2>
            <ColumnChart
              emptyText={t().stats.noLastWeek}
              points={data.daily_stats.map((day) => ({
                key: day.date,
                label: day.date.slice(5),
                value: day.count,
                to: tasksLink({ date_from: day.date, date_to: day.date }),
              }))}
            />
          </section>
        </>
      )}
    </>
  );
}
