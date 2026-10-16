import { useState } from "react";

import { COUNTRIES, TASK_PRIORITIES, TASK_STATUSES, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { BarList, LineChart, StatCard, StatusBreakdown } from "../components/Charts";
import { EmptyState, ErrorState, StatsSkeleton } from "../components/Feedback";
import { DatePicker } from "../components/DatePicker";
import { FilterControl } from "../components/Field";
import { optionList, withEmpty } from "../components/options";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { daysAgo, today } from "../dates";
import { Person } from "../components/People";
import { useReport } from "../features/stats/api";
import { COUNTRY_NAMES, PRIORITY_LABELS, STATUS_LABELS, countryName } from "../labels";
import { readDate, readEnum, useUrlState } from "../urlState";

type ChartMode = "daily" | "weekly";

export function Reports() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update } = useUrlState();
  const applied = {
    date_from: readDate(params, "date_from") ?? daysAgo(30),
    date_to: readDate(params, "date_to") ?? today(),
    country: isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined,
  };
  const [mode, setMode] = useState<ChartMode>("daily");
  const report = useReport(applied);

  return (
    <>
      <PageHeader title="Reports" description="Task volume, outcomes and quality for a chosen period." />
      <div className="toolbar toolbar-plain" role="group" aria-label="Report period">
        <FilterControl label="From">
          <DatePicker
            variant="inline"
            clearable={false}
            value={applied.date_from}
            max={applied.date_to}
            onChange={(date_from) => update({ date_from }, false)}
          />
        </FilterControl>
        <FilterControl label="To">
          <DatePicker
            variant="inline"
            clearable={false}
            value={applied.date_to}
            min={applied.date_from}
            onChange={(date_to) => update({ date_to }, false)}
          />
        </FilterControl>
        {isAdmin && (
          <FilterControl label="Country">
            <Select
              variant="inline"
              value={applied.country ?? ""}
              options={withEmpty("All", optionList(COUNTRIES, COUNTRY_NAMES))}
              onChange={(country) => update({ country }, false)}
            />
          </FilterControl>
        )}
      </div>

      {report.isPending ? (
        <StatsSkeleton label="Building report" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.data.total_tasks === 0 ? (
        <EmptyState title="No tasks in this period" hint="Choose a wider period or another country." />
      ) : (
        <div className="page-section" aria-busy={report.isFetching}>
          <div className="stat-grid stat-grid-4">
            <StatCard
              label="Total tasks"
              value={report.data.total_tasks}
              tone="accent"
              sub={`${report.data.status_stats.cancelled} cancelled`}
            />
            <StatCard
              label="Completion rate"
              value={`${Math.round((report.data.status_stats.completed / report.data.total_tasks) * 100)}%`}
              tone="success"
              sub={`${report.data.status_stats.completed} completed`}
            />
            <StatCard
              label="Waiting for review"
              value={report.data.status_stats.on_review}
              tone="status-on_review"
            />
            <StatCard
              label="Average quality"
              value={report.data.quality_stats.avg !== null ? report.data.quality_stats.avg.toFixed(1) : "—"}
              tone="warning"
              sub={report.data.quality_stats.reviewed_count > 0 ? `${report.data.quality_stats.reviewed_count} reviews` : "No reviews yet"}
            />
          </div>

          <div className="two-columns">
            <section className="card" aria-labelledby="report-status">
              <h2 id="report-status" className="section-title">
                By status
              </h2>
              <StatusBreakdown
                title="Share of tasks in each status"
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
              <div className="pager-group" role="group" aria-label="Chart granularity">
                {(["daily", "weekly"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="pager-size"
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
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Cleaner</th>
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
                        <td>
                          <Person email={cleaner.email} />
                        </td>
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
