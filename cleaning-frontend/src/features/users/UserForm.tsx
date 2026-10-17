import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import { COUNTRIES, USER_ROLES, type Country, type UserResponse, type UserRole } from "../../api/types";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { optionList } from "../../components/options";
import { Select } from "../../components/Select";
import { useCreateUser, useUpdateUser } from "./api";
import { countryNames } from "../../labels";
import { t } from "../../i18n/locale";

export function UserForm({
  existing,
  isSelf = false,
  onSaved,
  onCancel,
  onResetPassword,
}: {
  existing?: UserResponse;
  isSelf?: boolean;
  onSaved: (user: UserResponse) => void;
  onCancel: () => void;
  onResetPassword?: () => void;
}) {
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(existing?.role ?? "cleaner");
  const [country, setCountry] = useState<Country>(existing?.country ?? "DE");
  const create = useCreateUser();
  const update = useUpdateUser(existing?.id ?? "");
  const save = existing ? update : create;
  const isAdminRole = role === "admin";

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (existing) {
      update.mutate({ email, role, country: isAdminRole ? null : country }, { onSuccess: onSaved });
      return;
    }
    create.mutate({ email, password, role, country: isAdminRole ? undefined : country }, { onSuccess: onSaved });
  };

  const accessHint = isSelf ? t().users.ownAccessLocked : undefined;
  const [idleLabel, busyLabel] = existing
    ? [t().users.save, t().users.saving]
    : [t().users.create, t().common.creating];

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-body">
        {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        <Field label={t().users.email}>
          <input className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {!existing && (
          <Field label={t().users.password} hint={t().users.passwordHint}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}
        <Field label={t().users.role} hint={accessHint}>
          <Select value={role} disabled={isSelf} options={optionList(USER_ROLES, t().role)} onChange={setRole} />
        </Field>
        <Field label={t().users.country} hint={accessHint ?? (isAdminRole ? t().users.adminNoCountry : undefined)}>
          <Select
            value={country}
            disabled={isSelf || isAdminRole}
            options={optionList(COUNTRIES, countryNames())}
            onChange={setCountry}
          />
        </Field>
      </div>
      <div className="drawer-footer">
        {existing && !isSelf && onResetPassword && (
          <button className="btn btn-secondary drawer-footer-start" type="button" onClick={onResetPassword}>
            {t().users.resetPassword}
          </button>
        )}
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          {t().common.cancel}
        </button>
        <button className="btn btn-primary" type="submit" disabled={save.isPending}>
          {save.isPending ? busyLabel : idleLabel}
        </button>
      </div>
    </form>
  );
}
