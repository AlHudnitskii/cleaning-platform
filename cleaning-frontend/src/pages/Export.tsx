import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { Notice } from "../components/Feedback";
import { Field, Options } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { useExportTasks, type ExportFormat } from "../features/transfer/api";
import { COUNTRY_NAMES, daysAgo, isoDate } from "../labels";

const FORMAT_LABELS: Record<ExportFormat, string> = { excel: "Excel (.xlsx)", parquet: "Parquet" };
const FORMATS: readonly ExportFormat[] = ["excel", "parquet"];

export function Export() {
  const user = useCurrentUser();
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(isoDate(new Date()));
  const [format, setFormat] = useState<ExportFormat>("excel");
  const [country, setCountry] = useState<Country | "">("");
  const exportTasks = useExportTasks();
  const invalidRange = dateFrom > dateTo;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidRange) return;
    exportTasks.mutate({ date_from: dateFrom, date_to: dateTo, format, country: country || undefined });
  };

  return (
    <>
      <PageHeader
        title="Export tasks"
        description="Download tasks created in a period. Excel is convenient for reading; Parquet is compact and suited for analytics."
      />
      <section className="card">
        {exportTasks.isSuccess && (
          <Notice tone="success">
            Downloaded {exportTasks.data.filename} ({exportTasks.data.total} tasks).
          </Notice>
        )}
        {exportTasks.isError && <Notice tone="error">{errorMessage(exportTasks.error)}</Notice>}
        {invalidRange && <Notice tone="error">The start date must not be after the end date.</Notice>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <Field label="From">
              <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required />
            </Field>
            <Field label="Format">
              <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                <Options values={FORMATS} labels={FORMAT_LABELS} />
              </select>
            </Field>
            {user.role === "admin" && (
              <Field label="Country">
                <select className="input" value={country} onChange={(e) => setCountry(e.target.value as Country | "")}>
                  <Options values={COUNTRIES} labels={COUNTRY_NAMES} empty="All countries" />
                </select>
              </Field>
            )}
          </div>
          <button className="btn btn-primary" type="submit" disabled={exportTasks.isPending || invalidRange}>
            {exportTasks.isPending ? "Exporting…" : "Download"}
          </button>
        </form>
      </section>
    </>
  );
}
