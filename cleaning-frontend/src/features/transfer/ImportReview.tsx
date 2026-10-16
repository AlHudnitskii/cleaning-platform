
import type { ImportResult } from "../../api/types";
import { PriorityText } from "../../components/Badges";
import { Notice } from "../../components/Feedback";
import { Person } from "../../components/People";
import { t } from "../../i18n/locale";
import { rruleLabel } from "../../labels";

export function ImportReview({
  result,
  importing,
  importError,
  onImport,
}: {
  result: ImportResult;
  importing: boolean;
  importError: string | null;
  onImport: () => void;
}) {
  const hidden = result.valid_rows - result.preview.length;
  return (
    <>
      <div className="import-summary">
        <div className="import-stat tone-success">
          <span className="import-stat-value">{result.valid_rows}</span>
          <span className="import-stat-label">{t().importing.ready}</span>
        </div>
        <div className={`import-stat ${result.errors.length > 0 ? "tone-danger" : "tone-neutral"}`}>
          <span className="import-stat-value">{result.errors.length}</span>
          <span className="import-stat-label">{t().importing.withErrors}</span>
        </div>
        <div className="import-stat tone-neutral">
          <span className="import-stat-value">{result.total_rows}</span>
          <span className="import-stat-label">{t().importing.rowsInFile}</span>
        </div>
      </div>

      {result.errors.length > 0 && (
        <details className="error-details" open={result.valid_rows === 0}>
          <summary>
            {t().importing.willBeSkipped(result.errors.length)}
          </summary>
          <ul className="error-list">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}

      {result.preview.length > 0 && (
        <div className="table-scroll preview-table">
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="cell-index">
                  {t().importing.row}
                </th>
                <th scope="col">{t().importing.titleColumn}</th>
                <th scope="col">{t().importing.priority}</th>
                <th scope="col">{t().importing.location}</th>
                <th scope="col">{t().importing.assignee}</th>
                <th scope="col">{t().importing.repeats}</th>
              </tr>
            </thead>
            <tbody>
              {result.preview.map((row) => (
                <tr key={row.row}>
                  <td className="cell-index">{row.row}</td>
                  <td>{row.title}</td>
                  <td>
                    <PriorityText priority={row.priority} />
                  </td>
                  <td className="cell-muted">{row.location_name ?? "—"}</td>
                  <td>
                    <Person email={row.assignee_email} />
                  </td>
                  <td className="cell-muted">{row.rrule ? rruleLabel(row.rrule) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && <p className="muted preview-more">{t().importing.more(hidden)}</p>}
        </div>
      )}

      {importError && <Notice tone="error">{importError}</Notice>}
      <div className="form-actions form-actions-end">
        <button type="button" className="btn btn-primary" disabled={result.valid_rows === 0 || importing} onClick={onImport}>
          {importing
            ? t().importing.importing
            : result.valid_rows === 0
              ? t().importing.nothing
              : t().importing.importCount(result.valid_rows)}
        </button>
      </div>
    </>
  );
}
