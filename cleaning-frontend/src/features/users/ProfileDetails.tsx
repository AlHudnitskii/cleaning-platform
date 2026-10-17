import { useId, useState, type ChangeEvent, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import type { UserResponse } from "../../api/types";
import { useAuth } from "../../auth/useAuth";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { Avatar } from "../../components/People";
import { showToast } from "../../components/toast";
import { t } from "../../i18n/locale";
import { useDeleteAvatar, useUpdateProfile, useUploadAvatar } from "./api";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function ProfileDetails({ user }: { user: UserResponse }) {
  const { updateUser } = useAuth();
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const update = useUpdateProfile();
  const unchanged = fullName.trim() === (user.full_name ?? "") && phone.trim() === (user.phone ?? "");

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate(
      { full_name: fullName.trim() || null, phone: phone.trim() || null },
      {
        onSuccess: (saved) => {
          updateUser(saved);
          setFullName(saved.full_name ?? "");
          setPhone(saved.phone ?? "");
          showToast(t().profile.detailsSaved);
        },
      },
    );
  };

  return (
    <section className="card profile-details" aria-labelledby="details-title">
      <h2 id="details-title" className="section-title">
        {t().profile.details}
      </h2>
      <AvatarPicker user={user} onChange={updateUser} />
      <form className="stack" onSubmit={handleSubmit}>
        {update.isError && <Notice tone="error">{errorMessage(update.error)}</Notice>}
        <Field label={t().profile.fullName} hint={t().profile.fullNameHint}>
          <input
            className="input"
            autoComplete="name"
            maxLength={100}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label={t().profile.phone} hint={t().profile.phoneHint}>
          <input
            className="input"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" type="submit" disabled={update.isPending || unchanged}>
          {update.isPending ? t().common.saving : t().profile.saveDetails}
        </button>
      </form>
    </section>
  );
}

function AvatarPicker({ user, onChange }: { user: UserResponse; onChange: (user: UserResponse) => void }) {
  const inputId = useId();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending;
  const failure = upload.error ?? remove.error;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setLocalError(t().profile.photoTooLarge);
      return;
    }
    setLocalError(null);
    upload.mutate(file, { onSuccess: onChange });
  };

  return (
    <div className="avatar-picker">
      <Avatar user={user} size="large" />
      <div className="avatar-picker-actions">
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={handleFile}
        />
        <label htmlFor={inputId} className={`btn btn-secondary${busy ? " is-disabled" : ""}`}>
          {upload.isPending ? t().photos.uploading : user.avatar_url ? t().profile.changePhoto : t().profile.addPhoto}
        </label>
        {user.avatar_url && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => remove.mutate(undefined, { onSuccess: onChange })}
          >
            {t().profile.removePhoto}
          </button>
        )}
        <p className="field-hint">{t().profile.photoHint}</p>
      </div>
      {(localError ?? failure) && <Notice tone="error">{localError ?? errorMessage(failure)}</Notice>}
    </div>
  );
}
