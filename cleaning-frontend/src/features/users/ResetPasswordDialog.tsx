import { useState } from "react";

import { errorMessage } from "../../api/errors";
import { type UserResponse } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Field } from "../../components/Field";
import { useResetPassword } from "./api";
import { t } from "../../i18n/locale";

export function ResetPasswordDialog({ user, onClose, onDone }: { user: UserResponse; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const reset = useResetPassword(user.id);
  const tooShort = password.length < 6;

  const submit = () => {
    if (tooShort) return;
    reset.mutate(password, { onSuccess: onDone });
  };

  return (
    <ConfirmDialog
      title={t().users.resetTitle(user.email)}
      confirmLabel={t().users.resetConfirm}
      busy={reset.isPending}
      disabled={tooShort}
      error={reset.isError ? errorMessage(reset.error) : null}
      onConfirm={submit}
      onCancel={onClose}
    >
      <p>{t().users.resetHint}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label={t().users.newPassword} hint={t().users.passwordHint}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            data-autofocus
          />
        </Field>
      </form>
    </ConfirmDialog>
  );
}
