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
import { t } from "../i18n/locale";
import { rruleLabel } from "../labels";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = [".xlsx", ".csv"];

function columns(): { name: string; required: boolean; description: string }[] {
  const messages = t().importing;
  return [
    { name: "title", required: true, description: messages.columnTitle },
    { name: "country", required: true, description: messages.columnCountry },
    { name: "description", required: false, description: messages.columnDescription },
    { name: "priority", required: false, description: messages.columnPriority },
    { name: "assignee_email", required: false, description: messages.columnAssignee },
    { name: "location_name", required: false, description: messages.columnLocation },
    { name: "rrule", required: false, description: messages.columnRrule },
  ];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return t().importing.bytes(bytes);
  if (bytes < 1024 * 1024) return t().importing.kb((bytes / 1024).toFixed(1));
  return t().importing.mb((bytes / (1024 * 1024)).toFixed(1));
}

function fileProblem(file: File): string | null {
  if (!ACCEPTED.some((extension) => file.name.toLowerCase().endsWith(extension))) return t().importing.wrongType;
  if (file.size > MAX_BYTES) return t().importing.tooLarge;
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
      onSuccess: (result) => showToast(t().importing.imported(result.imported)),
    });
  };

  return (
    <>
      <PageHeader
        title={t().importing.title}
        description={t().importing.description}
        actions={
          <button type="button" className="btn btn-secondary" disabled={template.isPending} onClick={() => template.mutate()}>
            <Icon name="import" size={15} />
            {template.isPending ? t().importing.preparing : t().importing.template}
          </button>
        }
      />
      {template.isError && <Notice tone="error">{errorMessage(template.error)}</Notice>}

      <ol className="stepper" aria-label={t().importing.progress}>
        {t().importing.steps.map((label, index) => (
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
              {t().importing.chooseAnother}
            </button>
          </div>
          {preview.isPending ? (
            <ListSkeleton label={t().importing.checking} rows={4} columns={5} />
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
            {t().importing.importedTitle(importTasks.data.imported)}
          </h2>
          {importTasks.data.errors.length > 0 && (
            <p className="muted">{t().importing.skippedAfter(importTasks.data.errors.length)}</p>
          )}
          <div className="button-row">
            <Link className="btn btn-primary" to="/tasks">
              {t().importing.viewTasks}
            </Link>
            <button type="button" className="btn btn-secondary" onClick={restart}>
              {t().importing.importAnother}
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
        {t().importing.upload}
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
        <span className="dropzone-title">{t().importing.drop}</span>
        <span className="muted">{t().importing.limits}</span>
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

function FormatReference({ managerCountry }: { managerCountry: boolean }) {
  return (
    <section className="card" aria-labelledby="format-title">
      <h2 id="format-title" className="section-title">
        {t().importing.format}
      </h2>
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              <th scope="col">{t().importing.column}</th>
              <th scope="col">{t().importing.meaning}</th>
            </tr>
          </thead>
          <tbody>
            {columns().map((column) => (
              <tr key={column.name}>
                <td className="cell-nowrap">
                  <code>{column.name}</code>
                  {column.required && <span className="required-mark">{t().importing.required}</span>}
                </td>
                <td className="cell-muted">{column.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {managerCountry && <p className="muted">{t().importing.managerNote}</p>}
    </section>
  );
}
