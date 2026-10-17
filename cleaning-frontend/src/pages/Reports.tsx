import { useState, type ReactNode } from "react";

import { COUNTRIES, TASK_PRIORITIES, TASK_STATUSES, type Country, type WorkTimeStats } from "../api/types";
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
import { countryName, countryNames, formatDuration } from "../labels";
import { t } from "../i18n/locale";
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
      <PageHeader title={t().stats.reports} description={t().stats.reportsHint} />
      <div className="toolbar toolbar-plain" role="group" aria-label={t().stats.period}>
        <FilterControl label={t().stats.from}>
          <DatePicker
            variant="inline"
            clearable={false}
            value={applied.date_from}
            max={applied.date_to}
            onChange={(date_from) => update({ date_from }, false)}
          />
        </FilterControl>
        <FilterControl label={t().stats.to}>
          <DatePicker
            variant="inline"
            clearable={false}
            value={applied.date_to}
            min={applied.date_from}
            onChange={(date_to) => update({ date_to }, false)}
          />
        </FilterControl>
        {isAdmin && (
          <FilterControl label={t().stats.country}>
            <Select
              variant="inline"
              value={applied.country ?? ""}
              options={withEmpty(t().common.all, optionList(COUNTRIES, countryNames()))}
              onChange={(country) => update({ country }, false)}
            />
          </FilterControl>
        )}
      </div>

      {report.isPending ? (
        <StatsSkeleton label={t().stats.building} />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.data.total_tasks === 0 ? (
        <EmptyState title={t().stats.noPeriodTasks} hint={t().stats.noPeriodTasksHint} />
      ) : (
        <div className="page-section" aria-busy={report.isFetching}>
          <div className="stat-grid stat-grid-4">
            <StatCard
              label={t().stats.totalTasks}
              value={report.data.total_tasks}
              tone="accent"
              sub={t().stats.cancelled(report.data.status_stats.cancelled)}
            />
            <StatCard
              label={t().stats.completionRate}
              value={`${Math.round((report.data.status_stats.completed / report.data.total_tasks) * 100)}%`}
              tone="success"
              sub={t().stats.completed(report.data.status_stats.completed)}
            />
            <StatCard
              label={t().stats.waitingForReview}
              value={report.data.status_stats.on_review}
              tone="status-on_review"
            />
            <StatCard
              label={t().stats.averageQuality}
              value={report.data.quality_stats.avg !== null ? report.data.quality_stats.avg.toFixed(1) : "—"}
              tone="warning"
              sub={
                report.data.quality_stats.reviewed_count > 0
                  ? t().stats.reviews(report.data.quality_stats.reviewed_count)
                  : t().stats.noReviews
              }
            />
          </div>

          <div className="two-columns">
            <section className="card" aria-labelledby="report-status">
              <h2 id="report-status" className="section-title">
                {t().stats.byStatusShort}
              </h2>
              <StatusBreakdown
                title={t().stats.statusShare}
                items={TASK_STATUSES.map((status) => ({
                  key: status,
                  label: t().status[status],
                  value: report.data.status_stats[status],
                  tone: `status-${status}`,
                }))}
              />
            </section>
            <section className="card" aria-labelledby="report-priority">
              <h2 id="report-priority" className="section-title">
                {t().stats.byPriority}
              </h2>
              <BarList
                items={TASK_PRIORITIES.map((priority) => ({
                  key: priority,
                  label: t().priority[priority],
                  value: report.data.priority_stats[priority],
                  tone: `priority-${priority}`,
                }))}
              />
            </section>
          </div>

          <section className="card" aria-labelledby="report-timeline">
            <div className="section-header">
              <h2 id="report-timeline" className="section-title">
                {t().stats.overTime}
              </h2>
              <div className="pager-group" role="group" aria-label={t().stats.granularity}>
                {(["daily", "weekly"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="pager-size"
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                  >
                    {value === "daily" ? t().stats.daily : t().stats.weekly}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              title={mode === "daily" ? t().stats.perDay : t().stats.perWeek}
              emptyText={t().stats.noPeriodData}
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
                {t().stats.byCountry}
              </h2>
              <BarList
                items={report.data.country_stats.map((c) => ({ key: c.country, label: countryNames()[c.country], value: c.count }))}
              />
            </section>
          )}

          <section className="card" aria-labelledby="report-cleaners">
            <h2 id="report-cleaners" className="section-title">
              {t().stats.topCleaners}
            </h2>
            {report.data.top_cleaners.length === 0 ? (
              <p className="muted">{t().stats.noCleaners}</p>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t().stats.cleaner}</th>
                      <th scope="col">{t().stats.country}</th>
                      <th scope="col" className="numeric">
                        {t().stats.assigned}
                      </th>
                      <th scope="col" className="numeric">
                        {t().stats.completedColumn}
                      </th>
                      <th scope="col" className="numeric">
                        {t().stats.completionRate}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.top_cleaners.map((cleaner) => (
                      <tr key={cleaner.email}>
                        <td>
                          <Person email={cleaner.email} name={cleaner.name} />
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

          <WorkTimeSection work={report.data.work_time} />
        </div>
      )}
    </>
  );
}

function WorkTimeSection({ work }: { work: WorkTimeStats }) {
  return (
    <section className="card" aria-labelledby="report-work">
      <h2 id="report-work" className="section-title">
        {t().stats.workTime}
      </h2>
      <p className="field-hint">{t().stats.workTimeHint}</p>
      {work.avg_seconds === null ? (
        <p className="muted">{t().stats.noWorkTime}</p>
      ) : (
        <>
          <div className="stat-grid stat-grid-4">
            <StatCard
              label={t().stats.averageWork}
              value={formatDuration(work.avg_seconds)}
              tone="accent"
              sub={t().stats.measuredTasks(work.task_count)}
            />
          </div>
          <div className="two-columns">
            <WorkTable
              title={t().stats.byCleaner}
              nameColumn={t().stats.cleaner}
              rows={work.by_cleaner.map((row) => ({
                key: row.email,
                name: <Person email={row.email} name={row.name} />,
                tasks: row.task_count,
                seconds: row.avg_seconds,
              }))}
            />
            <WorkTable
              title={t().stats.byLocation}
              nameColumn={t().stats.location}
              rows={work.by_location.map((row) => ({
                key: row.id,
                name: row.name,
                tasks: row.task_count,
                seconds: row.avg_seconds,
              }))}
            />
          </div>
        </>
      )}
    </section>
  );
}

interface WorkRow {
  key: string;
  name: ReactNode;
  tasks: number;
  seconds: number;
}

function WorkTable({ title, nameColumn, rows }: { title: string; nameColumn: string; rows: WorkRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="subsection-title">{title}</caption>
        <thead>
          <tr>
            <th scope="col">{nameColumn}</th>
            <th scope="col" className="numeric">
              {t().stats.tasksColumn}
            </th>
            <th scope="col" className="numeric">
              {t().stats.averageColumn}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td className="numeric">{row.tasks}</td>
              <td className="numeric">{formatDuration(row.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
