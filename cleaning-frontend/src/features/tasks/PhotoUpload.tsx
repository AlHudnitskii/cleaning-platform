import { useId, useState, type ChangeEvent } from "react";

import { errorMessage } from "../../api/errors";
import { Notice } from "../../components/Feedback";
import { showToast } from "../../components/toast";
import { useUploadPhoto } from "./api";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function PhotoUpload({ taskId, online }: { taskId: string; online: boolean }) {
  const inputId = useId();
  const upload = useUploadPhoto();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError("Photo must be at most 10 MB.");
      return;
    }
    setLocalError(null);
    upload.mutate({ id: taskId, file }, { onSuccess: () => showToast("Photo uploaded.") });
  };

  return (
    <div className="photo-upload">
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept={ACCEPT}
        disabled={!online || upload.isPending}
        onChange={handleChange}
      />
      <label htmlFor={inputId} className={`btn btn-secondary${!online || upload.isPending ? " is-disabled" : ""}`}>
        {upload.isPending ? "Uploading…" : "Upload photo"}
      </label>
      {!online && <span className="muted">Photo upload is unavailable offline.</span>}
      {(localError ?? upload.isError) && (
        <Notice tone="error">{localError ?? errorMessage(upload.error)}</Notice>
      )}
    </div>
  );
}
