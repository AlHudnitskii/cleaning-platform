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
import { t } from "../i18n/locale";
import { countryNames } from "../labels";

const MAX_EXPORT_DAYS = 366;
const FORMATS: readonly ExportFormat[] = ["excel", "parquet"];
const FORMAT_LABELS: Record<ExportFormat, string> = { excel: "Excel (.xlsx)", parquet: "Parquet" };
function formatHint(format: ExportFormat): string {
  return format === "excel" ? t().exporting.excelHint : t().exporting.parquetHint;
}

function presets(): { label: string; from: () => string }[] {
  const messages = t().exporting;
  return [
    { label: messages.last7, from: () => daysAgo(7) },
    { label: messages.last30, from: () => daysAgo(30) },
    { label: messages.thisMonth, from: startOfMonth },
    { label: messages.thisYear, from: startOfYear },
  ];
}

function rangeError(from: string, to: string): string | null {
  const days = daysBetween(from, to);
  if (days === null) return t().exporting.chooseDates;
  if (days < 0) return t().exporting.startAfterEnd;
  if (days > MAX_EXPORT_DAYS) return t().exporting.tooLong(MAX_EXPORT_DAYS);
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
      { onSuccess: (result) => showToast(t().exporting.downloaded(result.filename, result.total)) },
    );
  };

  const applyPreset = (from: string) => {
    setDateFrom(from);
    setDateTo(today());
  };

  return (
    <>
      <PageHeader title={t().exporting.title} description={t().exporting.description} />
      <form className="export-layout" onSubmit={handleSubmit}>
        <section className="card" aria-labelledby="export-period">
          <h2 id="export-period" className="section-title">
            {t().exporting.period}
          </h2>
          <div className="pager-group preset-group" role="group" aria-label={t().exporting.quickPeriods}>
            {presets().map((preset) => {
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
            <Field label={t().exporting.from}>
              <DatePicker clearable={false} value={dateFrom} max={dateTo} onChange={setDateFrom} />
            </Field>
            <Field label={t().exporting.to}>
              <DatePicker clearable={false} value={dateTo} min={dateFrom} onChange={setDateTo} />
            </Field>
          </div>
          {invalid && <Notice tone="error">{invalid}</Notice>}

          <h2 className="section-title section-title-spaced">{t().exporting.file}</h2>
          <div className="form-grid form-grid-tight">
            <Field label={t().exporting.format} hint={formatHint(format)}>
              <Select value={format} options={optionList(FORMATS, FORMAT_LABELS)} onChange={setFormat} />
            </Field>
            {user.role === "admin" && (
              <Field label={t().exporting.country}>
                <Select
                  value={country}
                  options={withEmpty(t().common.allCountries, optionList(COUNTRIES, countryNames()))}
                  onChange={setCountry}
                />
              </Field>
            )}
          </div>
        </section>

        <aside className="card export-summary" aria-labelledby="export-summary">
          <h2 id="export-summary" className="subsection-title">
            {t().exporting.summary}
          </h2>
          <div className="export-count" aria-live="polite">
            {invalid ? (
              <span className="muted">{t().exporting.fixPeriod}</span>
            ) : preview.isPending ? (
              <span className="skeleton-cell skeleton-figure" aria-label={t().exporting.counting} />
            ) : preview.isError ? (
              <span className="muted">{t().exporting.couldNotCount(errorMessage(preview.error))}</span>
            ) : (
              <>
                <span className="export-count-value">{total}</span>
                <span className="export-count-label">{t().exporting.willBeExported(total ?? 0)}</span>
              </>
            )}
          </div>
          <dl className="summary-list">
            <div>
              <dt>{t().exporting.period}</dt>
              <dd>
                {formatDay(dateFrom)} – {formatDay(dateTo)}
              </dd>
            </div>
            <div>
              <dt>{t().exporting.format}</dt>
              <dd>{FORMAT_LABELS[format]}</dd>
            </div>
            <div>
              <dt>{t().exporting.country}</dt>
              <dd>{user.role === "admin" ? (country ? countryNames()[country] : t().common.allCountries) : t().exporting.yourCountry}</dd>
            </div>
          </dl>
          {exportTasks.isError && <Notice tone="error">{errorMessage(exportTasks.error)}</Notice>}
          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={exportTasks.isPending || invalid !== null || total === 0}
          >
            <Icon name="export" size={15} />
            {exportTasks.isPending
              ? t().exporting.exporting
              : total
                ? t().exporting.downloadCount(total)
                : t().exporting.download}
          </button>
          {total === 0 && <p className="field-hint">{t().exporting.empty}</p>}
        </aside>
      </form>
    </>
  );
}
