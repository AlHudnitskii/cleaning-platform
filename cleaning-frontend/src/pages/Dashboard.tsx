import { TASK_PRIORITIES, TASK_STATUSES } from "../api/types";
import { BarList, ColumnChart, StatCard, StatusBreakdown } from "../components/Charts";
import { EmptyState, ErrorState, StatsSkeleton } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { useDashboard } from "../features/stats/api";
import { COUNTRY_NAMES, PRIORITY_LABELS, STATUS_LABELS } from "../labels";

function tasksLink(params: Record<string, string>): string {
  return `/tasks?${new URLSearchParams(params).toString()}`;
}

export function Dashboard() {
  const stats = useDashboard();

  if (stats.isPending) {
    return (
      <>
        <PageHeader title="Dashboard" description="Current state of cleaning tasks in your area." />
        <StatsSkeleton label="Loading dashboard" />
      </>
    );
  }
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;

  const data = stats.data;
  const completionRate = data.total_tasks > 0 ? Math.round((data.status_stats.completed / data.total_tasks) * 100) : 0;

  return (
    <>
      <PageHeader title="Dashboard" description="Current state of cleaning tasks in your area." />
      {data.total_tasks === 0 ? (
        <EmptyState title="No tasks yet" hint="Statistics appear once tasks are created or imported." />
      ) : (
        <>
          <div className="stat-grid stat-grid-4">
            <StatCard
              label="Total tasks"
              value={data.total_tasks}
              tone="accent"
              to="/tasks"
              sub={`${data.recurring_count} recurring · ${data.total_users} users`}
            />
            <StatCard
              label="Waiting for review"
              value={data.status_stats.on_review}
              tone="status-on_review"
              to={tasksLink({ status: "on_review" })}
              sub={data.status_stats.on_review > 0 ? "Need your approval" : "Nothing to review"}
            />
            <StatCard
              label="Completion rate"
              value={`${completionRate}%`}
              tone="success"
              sub={`${data.status_stats.completed} of ${data.total_tasks} completed`}
            />
            <StatCard
              label="Average quality"
              value={data.avg_quality !== null ? data.avg_quality.toFixed(1) : "—"}
              tone="warning"
              sub={data.reviewed_count > 0 ? `${data.reviewed_count} reviews` : "No reviews yet"}
            />
          </div>

          <section className="card" aria-labelledby="by-status">
            <h2 id="by-status" className="section-title">
              Tasks by status
            </h2>
            <StatusBreakdown
              title="Share of tasks in each status"
              items={TASK_STATUSES.map((status) => ({
                key: status,
                label: STATUS_LABELS[status],
                value: data.status_stats[status],
                tone: `status-${status}`,
                to: tasksLink({ status }),
              }))}
            />
          </section>

          <div className="three-columns">
            <section className="card" aria-labelledby="by-country">
              <h2 id="by-country" className="section-title">
                By country
              </h2>
              <BarList
                items={data.country_stats.map((item) => ({
                  key: item.country,
                  label: COUNTRY_NAMES[item.country],
                  value: item.count,
                  to: tasksLink({ country: item.country }),
                }))}
              />
            </section>
            <section className="card" aria-labelledby="by-priority">
              <h2 id="by-priority" className="section-title">
                By priority
              </h2>
              <BarList
                items={TASK_PRIORITIES.map((priority) => ({
                  key: priority,
                  label: PRIORITY_LABELS[priority],
                  value: data.priority_stats[priority],
                  tone: `priority-${priority}`,
                  to: tasksLink({ priority }),
                }))}
              />
            </section>
            <section className="card" aria-labelledby="top-locations">
              <h2 id="top-locations" className="section-title">
                Busiest locations
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
              Tasks created in the last 7 days
            </h2>
            <ColumnChart
              emptyText="No tasks in the last 7 days"
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
