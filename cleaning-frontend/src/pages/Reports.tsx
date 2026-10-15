import { useState, type SubmitEvent } from "react";

import { COUNTRIES, TASK_PRIORITIES, TASK_STATUSES, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { BarList, LineChart, StatCard } from "../components/Charts";
import { EmptyState, ErrorState, Loading } from "../components/Feedback";
import { Field, Options } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { useReport } from "../features/stats/api";
import { COUNTRY_NAMES, PRIORITY_LABELS, STATUS_LABELS, countryName, daysAgo, isoDate } from "../labels";
import { readDate, readEnum, useUrlState } from "../urlState";

type ChartMode = "daily" | "weekly";

export function Reports() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update } = useUrlState();
  const applied = {
    date_from: readDate(params, "date_from") ?? daysAgo(30),
    date_to: readDate(params, "date_to") ?? isoDate(new Date()),
    country: isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined,
  };
  const [draft, setDraft] = useState(applied);
  const [mode, setMode] = useState<ChartMode>("daily");
  const report = useReport(applied);

  const handleApply = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    update({ date_from: draft.date_from, date_to: draft.date_to, country: draft.country }, false);
  };

  return (
    <>
      <PageHeader title="Reports" description="Task volume, outcomes and quality for a chosen period." />
      <form className="filters" aria-label="Report period" onSubmit={handleApply}>
        <Field label="From">
          <input className="input" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        </Field>
        <Field label="To">
          <input className="input" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        </Field>
        {isAdmin && (
          <Field label="Country">
            <select
              className="input"
              value={draft.country ?? ""}
              onChange={(e) => setDraft({ ...draft, country: (e.target.value || undefined) as Country | undefined })}
            >
              <Options values={COUNTRIES} labels={COUNTRY_NAMES} empty="All countries" />
            </select>
          </Field>
        )}
        <div className="filters-summary">
          <button className="btn btn-primary" type="submit">
            Apply
          </button>
        </div>
      </form>

      {report.isPending ? (
        <Loading label="Building report" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.data.total_tasks === 0 ? (
        <EmptyState title="No tasks in this period" hint="Choose a wider period or another country." />
      ) : (
        <div aria-busy={report.isFetching}>
          <div className="stat-grid">
            <StatCard label="Total tasks" value={report.data.total_tasks} tone="accent" />
            <StatCard label="Completed" value={report.data.status_stats.completed} tone="success" />
            <StatCard
              label="Completion rate"
              value={`${Math.round((report.data.status_stats.completed / report.data.total_tasks) * 100)}%`}
              tone="success"
            />
            <StatCard
              label="Average quality"
              value={report.data.quality_stats.avg !== null ? report.data.quality_stats.avg.toFixed(1) : "—"}
              tone="warning"
              sub={report.data.quality_stats.reviewed_count > 0 ? `${report.data.quality_stats.reviewed_count} reviews` : undefined}
            />
            <StatCard label="Cancelled" value={report.data.status_stats.cancelled} tone="danger" />
          </div>

          <div className="two-columns">
            <section className="card" aria-labelledby="report-status">
              <h2 id="report-status" className="section-title">
                By status
              </h2>
              <BarList
                items={TASK_STATUSES.map((status) => ({
                  key: status,
                  label: STATUS_LABELS[status],
                  value: report.data.status_stats[status],
                  tone: `status-${status}`,
                }))}
              />
            </section>
            <section className="card" aria-labelledby="report-priority">
              <h2 id="report-priority" className="section-title">
                By priority
              </h2>
              <BarList
                items={TASK_PRIORITIES.map((priority) => ({
                  key: priority,
                  label: PRIORITY_LABELS[priority],
                  value: report.data.priority_stats[priority],
                  tone: `priority-${priority}`,
                }))}
              />
            </section>
          </div>

          <section className="card" aria-labelledby="report-timeline">
            <div className="section-header">
              <h2 id="report-timeline" className="section-title">
                Tasks over time
              </h2>
              <div className="segmented" role="group" aria-label="Chart granularity">
                {(["daily", "weekly"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={mode === value ? "btn btn-primary btn-small" : "btn btn-secondary btn-small"}
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                  >
                    {value === "daily" ? "Daily" : "Weekly"}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              title={mode === "daily" ? "Tasks created per day" : "Tasks created per week"}
              emptyText="No data for this period"
              points={
                mode === "daily"
                  ? report.data.daily_stats.map((d) => ({ key: d.date, label: d.date.slice(5), value: d.count }))
                  : report.data.weekly_stats.map((w) => ({ key: w.week, label: w.week.slice(5), value: w.count }))
              }
            />
          </section>

          {report.data.country_stats.length > 1 && (
            <section className="card" aria-labelledby="report-country">
              <h2 id="report-country" className="section-title">
                By country
              </h2>
              <BarList
                items={report.data.country_stats.map((c) => ({ key: c.country, label: COUNTRY_NAMES[c.country], value: c.count }))}
              />
            </section>
          )}

          <section className="card" aria-labelledby="report-cleaners">
            <h2 id="report-cleaners" className="section-title">
              Top cleaners
            </h2>
            {report.data.top_cleaners.length === 0 ? (
              <p className="muted">No cleaners in this scope.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Country</th>
                      <th scope="col" className="numeric">
                        Assigned
                      </th>
                      <th scope="col" className="numeric">
                        Completed
                      </th>
                      <th scope="col" className="numeric">
                        Completion rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.top_cleaners.map((cleaner) => (
                      <tr key={cleaner.email}>
                        <td>{cleaner.email}</td>
                        <td>{countryName(cleaner.country)}</td>
                        <td className="numeric">{cleaner.task_count}</td>
                        <td className="numeric">{cleaner.completed_count}</td>
                        <td className="numeric">{cleaner.completion_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
