import { useId, useState, type DragEvent } from "react";

import { Notice } from "../../components/Feedback";
import { Icon } from "../../components/Icon";
import { t } from "../../i18n/locale";
import { ACCEPTED } from "./importFiles";

export function ImportFilePicker({ problem, onChoose }: { problem: string | null; onChoose: (file: File | null) => void }) {
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
