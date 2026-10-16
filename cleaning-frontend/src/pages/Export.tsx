import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { DatePicker } from "../components/DatePicker";
import { Notice } from "../components/Feedback";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { optionList, withEmpty } from "../components/options";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { showToast } from "../components/toast";
import { daysAgo, daysBetween, formatDay, startOfMonth, startOfYear, today } from "../dates";
import { useTasks } from "../features/tasks/api";
import { useExportTasks, type ExportFormat } from "../features/transfer/api";
import { COUNTRY_NAMES } from "../labels";

const MAX_EXPORT_DAYS = 366;
const FORMATS: readonly ExportFormat[] = ["excel", "parquet"];
const FORMAT_LABELS: Record<ExportFormat, string> = { excel: "Excel (.xlsx)", parquet: "Parquet" };
const FORMAT_HINTS: Record<ExportFormat, string> = {
  excel: "Opens in Excel, Numbers or Google Sheets. Best for reading and sharing.",
  parquet: "Compact columnar file for analytics tools such as pandas or Power BI.",
};

const PRESETS = [
  { label: "Last 7 days", from: () => daysAgo(7) },
  { label: "Last 30 days", from: () => daysAgo(30) },
  { label: "This month", from: startOfMonth },
  { label: "This year", from: startOfYear },
];

function rangeError(from: string, to: string): string | null {
  const days = daysBetween(from, to);
  if (days === null) return "Choose both dates.";
  if (days < 0) return "The start date must not be after the end date.";
  if (days > MAX_EXPORT_DAYS) return `The period must not exceed ${MAX_EXPORT_DAYS} days.`;
  return null;
}

export function Export() {
  const user = useCurrentUser();
  const [dateFrom, setDateFrom] = useState(() => daysAgo(30));
  const [dateTo, setDateTo] = useState(today);
  const [format, setFormat] = useState<ExportFormat>("excel");
  const [country, setCountry] = useState<Country | "">("");
  const exportTasks = useExportTasks();
  const invalid = rangeError(dateFrom, dateTo);
  const preview = useTasks({ page: 1, limit: 1, date_from: dateFrom, date_to: dateTo, country: country || undefined });
  const total = invalid ? null : (preview.data?.pagination.total ?? null);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalid) return;
    exportTasks.mutate(
      { date_from: dateFrom, date_to: dateTo, format, country: country || undefined },
      { onSuccess: (result) => showToast(`Downloaded ${result.filename} (${result.total} tasks)`) },
    );
  };

  const applyPreset = (from: string) => {
    setDateFrom(from);
    setDateTo(today());
  };

  return (
    <>
      <PageHeader title="Export tasks" description="Download the tasks created in a period as a spreadsheet or an analytics file." />
      <form className="export-layout" onSubmit={handleSubmit}>
        <section className="card" aria-labelledby="export-period">
          <h2 id="export-period" className="section-title">
            Period
          </h2>
          <div className="pager-group preset-group" role="group" aria-label="Quick periods">
            {PRESETS.map((preset) => {
              const from = preset.from();
              return (
                <button
                  key={preset.label}
                  type="button"
                  className="pager-size"
                  aria-pressed={dateFrom === from && dateTo === today()}
                  onClick={() => applyPreset(from)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="form-grid form-grid-tight">
            <Field label="From">
              <DatePicker clearable={false} value={dateFrom} max={dateTo} onChange={setDateFrom} />
            </Field>
            <Field label="To">
              <DatePicker clearable={false} value={dateTo} min={dateFrom} onChange={setDateTo} />
            </Field>
          </div>
          {invalid && <Notice tone="error">{invalid}</Notice>}

          <h2 className="section-title section-title-spaced">File</h2>
          <div className="form-grid form-grid-tight">
            <Field label="Format" hint={FORMAT_HINTS[format]}>
              <Select value={format} options={optionList(FORMATS, FORMAT_LABELS)} onChange={setFormat} />
            </Field>
            {user.role === "admin" && (
              <Field label="Country">
                <Select
                  value={country}
                  options={withEmpty("All countries", optionList(COUNTRIES, COUNTRY_NAMES))}
                  onChange={setCountry}
                />
              </Field>
            )}
          </div>
        </section>

        <aside className="card export-summary" aria-labelledby="export-summary">
          <h2 id="export-summary" className="subsection-title">
            Summary
          </h2>
          <div className="export-count" aria-live="polite">
            {invalid ? (
              <span className="muted">Fix the period to see how many tasks will be exported.</span>
            ) : preview.isPending ? (
              <span className="skeleton-cell skeleton-figure" aria-label="Counting tasks" />
            ) : preview.isError ? (
              <span className="muted">Could not count tasks: {errorMessage(preview.error)}</span>
            ) : (
              <>
                <span className="export-count-value">{total}</span>
                <span className="export-count-label">{total === 1 ? "task" : "tasks"} will be exported</span>
              </>
            )}
          </div>
          <dl className="summary-list">
            <div>
              <dt>Period</dt>
              <dd>
                {formatDay(dateFrom)} – {formatDay(dateTo)}
              </dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{FORMAT_LABELS[format]}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{user.role === "admin" ? (country ? COUNTRY_NAMES[country] : "All countries") : "Your country"}</dd>
            </div>
          </dl>
          {exportTasks.isError && <Notice tone="error">{errorMessage(exportTasks.error)}</Notice>}
          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={exportTasks.isPending || invalid !== null || total === 0}
          >
            <Icon name="export" size={15} />
            {exportTasks.isPending ? "Exporting…" : total ? `Download ${total} ${total === 1 ? "task" : "tasks"}` : "Download"}
          </button>
          {total === 0 && <p className="field-hint">No tasks were created in this period.</p>}
        </aside>
      </form>
    </>
  );
}
