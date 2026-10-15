import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { useAuth, useCurrentUser } from "../auth/useAuth";
import { RoleBadge } from "../components/Badges";
import { Notice } from "../components/Feedback";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { useChangePassword } from "../features/users/api";
import { countryName } from "../labels";

const MIN_PASSWORD = 6;

export function Profile() {
  const user = useCurrentUser();
  const { acceptSession } = useAuth();
  const changePassword = useChangePassword();
  const [form, setForm] = useState({ old_password: "", new_password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const different = form.new_password !== form.confirm;
    setMismatch(different);
    if (different) return;
    changePassword.mutate(
      { old_password: form.old_password, new_password: form.new_password },
      {
        onSuccess: (session) => {
          acceptSession(session);
          setForm({ old_password: "", new_password: "", confirm: "" });
        },
      },
    );
  };

  return (
    <>
      <PageHeader title="Profile" description="Your account and password." />
      <div className="two-columns">
        <section className="card" aria-labelledby="account-title">
          <h2 id="account-title" className="section-title">
            Account
          </h2>
          <dl className="detail-list">
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Role</dt>
            <dd>
              <RoleBadge role={user.role} />
            </dd>
            <dt>Country</dt>
            <dd>{countryName(user.country)}</dd>
          </dl>
        </section>

        <section className="card" aria-labelledby="password-title">
          <h2 id="password-title" className="section-title">
            Change password
          </h2>
          <p className="muted">Changing the password signs you out on all other devices.</p>
          {changePassword.isSuccess && <Notice tone="success">Password changed.</Notice>}
          {changePassword.isError && <Notice tone="error">{errorMessage(changePassword.error)}</Notice>}
          {mismatch && <Notice tone="error">New passwords do not match.</Notice>}
          <form className="stack" onSubmit={handleSubmit}>
            <Field label="Current password">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={form.old_password}
                onChange={(e) => setForm({ ...form, old_password: e.target.value })}
                required
              />
            </Field>
            <Field label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                required
              />
            </Field>
            <Field label="Repeat new password">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
              />
            </Field>
            <button className="btn btn-primary" type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Saving…" : "Change password"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
