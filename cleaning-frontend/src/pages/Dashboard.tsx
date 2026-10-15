import { TASK_PRIORITIES, TASK_STATUSES } from "../api/types";
import { BarList, ColumnChart, StatCard } from "../components/Charts";
import { EmptyState, ErrorState, Loading } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StarDisplay } from "../components/StarRating";
import { useDashboard } from "../features/stats/api";
import { COUNTRY_NAMES, LEVEL_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "../labels";

function tasksLink(params: Record<string, string>): string {
  return `/tasks?${new URLSearchParams(params).toString()}`;
}

export function Dashboard() {
  const stats = useDashboard();

  if (stats.isPending) return <Loading label="Loading dashboard" />;
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
          <div className="stat-grid">
            <StatCard label="Total tasks" value={data.total_tasks} tone="accent" to="/tasks" />
            {TASK_STATUSES.filter((s) => s !== "cancelled").map((status) => (
              <StatCard
                key={status}
                label={STATUS_LABELS[status]}
                value={data.status_stats[status]}
                tone={`status-${status}`}
                to={tasksLink({ status })}
              />
            ))}
            <StatCard label="Completion rate" value={`${completionRate}%`} tone="success" />
            <StatCard label="Recurring" value={data.recurring_count} tone="role-admin" />
            <StatCard
              label="Average quality"
              value={data.avg_quality !== null ? data.avg_quality.toFixed(1) : "—"}
              tone="warning"
              sub={data.reviewed_count > 0 ? `${data.reviewed_count} reviews` : undefined}
            />
            <StatCard label="Users" value={data.total_users} />
          </div>

          <div className="two-columns">
            <section className="card" aria-labelledby="by-country">
              <h2 id="by-country" className="section-title">
                Tasks by country
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
                Tasks by priority
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
              <h3 className="subsection-title">Quality score</h3>
              <StarDisplay value={data.avg_quality} />
            </section>
          </div>

          <div className="two-columns">
            <section className="card" aria-labelledby="top-locations">
              <h2 id="top-locations" className="section-title">
                Busiest locations
              </h2>
              <BarList
                items={data.top_locations.map((location) => ({
                  key: location.id,
                  label: `${location.name} · ${LEVEL_LABELS[location.level]}`,
                  value: location.count,
                  to: tasksLink({ location_id: location.id }),
                }))}
              />
            </section>
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
          </div>
        </>
      )}
    </>
  );
}
