import { useId, useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { useCurrentUser } from "../auth/useAuth";
import { Notice } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { useDownloadTemplate, useImportTasks } from "../features/transfer/api";

const MAX_BYTES = 5 * 1024 * 1024;

const COLUMNS = [
  { name: "title", required: true, description: "Task title, 3–255 characters" },
  { name: "country", required: true, description: "Two-letter code: DE, NL, US…" },
  { name: "description", required: false, description: "Free text" },
  { name: "priority", required: false, description: "low / normal / high / urgent (default normal)" },
  { name: "assignee_email", required: false, description: "Email of an active cleaner from the same country" },
  { name: "location_name", required: false, description: "Exact location name in the same country" },
  { name: "rrule", required: false, description: "Recurrence rule, e.g. FREQ=DAILY" },
];

export function Import() {
  const user = useCurrentUser();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const importTasks = useImportTasks();
  const template = useDownloadTemplate();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file) importTasks.mutate(file);
  };

  const result = importTasks.data;

  return (
    <>
      <PageHeader
        title="Import tasks"
        description="Upload a CSV or Excel (.xlsx) file to create many tasks at once."
        actions={
          <button type="button" className="btn btn-secondary" disabled={template.isPending} onClick={() => template.mutate()}>
            {template.isPending ? "Preparing…" : "Download template"}
          </button>
        }
      />
      <div className="two-columns">
        <section className="card" aria-labelledby="upload-title">
          <h2 id="upload-title" className="section-title">
            Upload file
          </h2>
          {template.isError && <Notice tone="error">{errorMessage(template.error)}</Notice>}
          {importTasks.isError && <Notice tone="error">{errorMessage(importTasks.error)}</Notice>}
          {tooLarge && <Notice tone="error">The file must be at most 5 MB.</Notice>}
          {result && (
            <Notice tone={result.errors.length === 0 ? "success" : result.imported > 0 ? "warning" : "error"}>
              <p>
                Imported {result.imported} of {result.total_rows} rows.
              </p>
              {result.errors.length > 0 && (
                <ul className="error-list">
                  {result.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}
          <form className="stack" onSubmit={handleSubmit}>
            <label htmlFor={inputId} className="dropzone">
              <span className="dropzone-title">{file ? file.name : "Choose a file"}</span>
              <span className="muted">{file ? `${(file.size / 1024).toFixed(1)} KB` : ".xlsx or .csv, up to 5 MB"}</span>
            </label>
            <input
              id={inputId}
              className="visually-hidden"
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                const oversized = selected !== null && selected.size > MAX_BYTES;
                setTooLarge(oversized);
                setFile(oversized ? null : selected);
                importTasks.reset();
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={!file || importTasks.isPending}>
              {importTasks.isPending ? "Importing…" : "Import"}
            </button>
          </form>
        </section>

        <section className="card" aria-labelledby="format-title">
          <h2 id="format-title" className="section-title">
            File format
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Column</th>
                <th scope="col">Required</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((column) => (
                <tr key={column.name}>
                  <td>
                    <code>{column.name}</code>
                  </td>
                  <td>{column.required ? "Yes" : "No"}</td>
                  <td>{column.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {user.role === "manager" && (
            <p className="muted">As a manager, every imported task is created in your country.</p>
          )}
        </section>
      </div>
    </>
  );
}
