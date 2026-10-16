import { useState } from "react";
import { Link } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { useCurrentUser } from "../auth/useAuth";
import { ListSkeleton, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/toast";
import { useDownloadTemplate, useImportPreview, useImportTasks } from "../features/transfer/api";
import { t } from "../i18n/locale";
import { ImportFilePicker } from "../features/transfer/ImportFile";
import { fileProblem, formatSize } from "../features/transfer/importFiles";
import { ImportReview } from "../features/transfer/ImportReview";
import { ImportFormatReference } from "../features/transfer/ImportFormat";

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
          <ImportFilePicker problem={problem} onChoose={choose} />
          <ImportFormatReference managerCountry={user.role === "manager"} />
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
            <ImportReview
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
