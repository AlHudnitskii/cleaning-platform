import { useId, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";

import { errorMessage } from "../api/errors";
import type { ImportResult } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { PriorityText } from "../components/Badges";
import { ListSkeleton, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Person } from "../components/People";
import { showToast } from "../components/toast";
import { useDownloadTemplate, useImportPreview, useImportTasks } from "../features/transfer/api";
import { rruleLabel } from "../labels";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = [".xlsx", ".csv"];

const COLUMNS = [
  { name: "title", required: true, description: "Task title, 3–255 characters" },
  { name: "country", required: true, description: "Two-letter code: DE, NL, US…" },
  { name: "description", required: false, description: "Free text" },
  { name: "priority", required: false, description: "low / normal / high / urgent (default normal)" },
  { name: "assignee_email", required: false, description: "Email of an active cleaner from the same country" },
  { name: "location_name", required: false, description: "Exact location name in the same country" },
  { name: "rrule", required: false, description: "Recurrence rule, e.g. FREQ=DAILY" },
];

const STEPS = ["Choose file", "Review", "Done"] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileProblem(file: File): string | null {
  if (!ACCEPTED.some((extension) => file.name.toLowerCase().endsWith(extension))) return "Choose a .xlsx or .csv file.";
  if (file.size > MAX_BYTES) return "The file must be at most 5 MB.";
  return null;
}

export function Import() {
  const user = useCurrentUser();
  const preview = useImportPreview();
  const importTasks = useImportTasks();
  const template = useDownloadTemplate();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const step = importTasks.isSuccess ? 2 : file ? 1 : 0;

  const choose = (selected: File | null) => {
    importTasks.reset();
    preview.reset();
    if (!selected) return;
    const issue = fileProblem(selected);
    setProblem(issue);
    setFile(issue ? null : selected);
    if (!issue) preview.mutate(selected);
  };

  const restart = () => {
    setFile(null);
    setProblem(null);
    preview.reset();
    importTasks.reset();
  };

  const runImport = () => {
    if (!file) return;
    importTasks.mutate(file, {
      onSuccess: (result) => showToast(`Imported ${result.imported} ${result.imported === 1 ? "task" : "tasks"}`),
    });
  };

  return (
    <>
      <PageHeader
        title="Import tasks"
        description="Create many tasks at once from a CSV or Excel file. You review the result before anything is saved."
        actions={
          <button type="button" className="btn btn-secondary" disabled={template.isPending} onClick={() => template.mutate()}>
            <Icon name="import" size={15} />
            {template.isPending ? "Preparing…" : "Download template"}
          </button>
        }
      />
      {template.isError && <Notice tone="error">{errorMessage(template.error)}</Notice>}

      <ol className="stepper" aria-label="Import progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index < step ? "is-done" : index === step ? "is-current" : undefined}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="stepper-mark" aria-hidden="true">
              {index < step ? <Icon name="check" size={13} /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="two-columns">
          <FilePicker problem={problem} onChoose={choose} />
          <FormatReference managerCountry={user.role === "manager"} />
        </div>
      )}

      {step === 1 && file && (
        <section className="card" aria-labelledby="review-title">
          <div className="section-header">
            <div>
              <h2 id="review-title" className="section-title">
                {file.name}
              </h2>
              <p className="muted">{formatSize(file.size)}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={restart}>
              Choose another file
            </button>
          </div>
          {preview.isPending ? (
            <ListSkeleton label="Checking the file" rows={4} columns={5} />
          ) : preview.isError ? (
            <Notice tone="error">{errorMessage(preview.error)}</Notice>
          ) : preview.data ? (
            <Review
              result={preview.data}
              importing={importTasks.isPending}
              importError={importTasks.isError ? errorMessage(importTasks.error) : null}
              onImport={runImport}
            />
          ) : null}
        </section>
      )}

      {step === 2 && importTasks.data && (
        <section className="card import-done" aria-labelledby="done-title">
          <span className="import-done-mark" aria-hidden="true">
            <Icon name="check" size={22} />
          </span>
          <h2 id="done-title" className="section-title">
            {importTasks.data.imported} {importTasks.data.imported === 1 ? "task" : "tasks"} imported
          </h2>
          {importTasks.data.errors.length > 0 && (
            <p className="muted">{importTasks.data.errors.length} rows were skipped because of errors.</p>
          )}
          <div className="button-row">
            <Link className="btn btn-primary" to="/tasks">
              View tasks
            </Link>
            <button type="button" className="btn btn-secondary" onClick={restart}>
              Import another file
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function FilePicker({ problem, onChoose }: { problem: string | null; onChoose: (file: File | null) => void }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    onChoose(event.dataTransfer.files[0] ?? null);
  };

  return (
    <section className="card" aria-labelledby="upload-title">
      <h2 id="upload-title" className="section-title">
        Upload file
      </h2>
      {problem && <Notice tone="error">{problem}</Notice>}
      <label
        htmlFor={inputId}
        className={`dropzone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="dropzone-icon" aria-hidden="true">
          <Icon name="import" size={22} />
        </span>
        <span className="dropzone-title">Drop a file here or click to choose</span>
        <span className="muted">.xlsx or .csv, up to 5 MB and 5,000 rows</span>
      </label>
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={(event) => {
          onChoose(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </section>
  );
}

function Review({
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
          <span className="import-stat-label">ready to import</span>
        </div>
        <div className={`import-stat ${result.errors.length > 0 ? "tone-danger" : "tone-neutral"}`}>
          <span className="import-stat-value">{result.errors.length}</span>
          <span className="import-stat-label">with errors</span>
        </div>
        <div className="import-stat tone-neutral">
          <span className="import-stat-value">{result.total_rows}</span>
          <span className="import-stat-label">rows in file</span>
        </div>
      </div>

      {result.errors.length > 0 && (
        <details className="error-details" open={result.valid_rows === 0}>
          <summary>
            {result.errors.length} {result.errors.length === 1 ? "row will be skipped" : "rows will be skipped"}
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
                  Row
                </th>
                <th scope="col">Title</th>
                <th scope="col">Priority</th>
                <th scope="col">Location</th>
                <th scope="col">Assignee</th>
                <th scope="col">Repeats</th>
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
          {hidden > 0 && <p className="muted preview-more">and {hidden} more…</p>}
        </div>
      )}

      {importError && <Notice tone="error">{importError}</Notice>}
      <div className="form-actions form-actions-end">
        <button type="button" className="btn btn-primary" disabled={result.valid_rows === 0 || importing} onClick={onImport}>
          {importing
            ? "Importing…"
            : result.valid_rows === 0
              ? "Nothing to import"
              : `Import ${result.valid_rows} ${result.valid_rows === 1 ? "task" : "tasks"}`}
        </button>
      </div>
    </>
  );
}

function FormatReference({ managerCountry }: { managerCountry: boolean }) {
  return (
    <section className="card" aria-labelledby="format-title">
      <h2 id="format-title" className="section-title">
        File format
      </h2>
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {COLUMNS.map((column) => (
              <tr key={column.name}>
                <td className="cell-nowrap">
                  <code>{column.name}</code>
                  {column.required && <span className="required-mark">required</span>}
                </td>
                <td className="cell-muted">{column.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {managerCountry && <p className="muted">As a manager, every imported task is created in your country.</p>}
    </section>
  );
}
