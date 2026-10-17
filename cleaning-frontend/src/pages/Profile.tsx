import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { useAuth, useCurrentUser } from "../auth/useAuth";
import { RoleBadge } from "../components/Badges";
import { Notice } from "../components/Feedback";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { LOCALES, setLocale, t, useLocale } from "../i18n/locale";
import { useChangePassword } from "../features/users/api";
import { ProfileDetails } from "../features/users/ProfileDetails";
import { countryName } from "../labels";
import { setTheme, useTheme, type Theme } from "../theme";

const THEMES: readonly Theme[] = ["light", "dark"];

const MIN_PASSWORD = 6;

export function Profile() {
  const user = useCurrentUser();
  const locale = useLocale();
  const theme = useTheme();
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
      <PageHeader title={t().profile.title} description={t().profile.description} />
      <div className="two-columns">
        <ProfileDetails user={user} />
        <section className="card" aria-labelledby="account-title">
          <h2 id="account-title" className="section-title">
            {t().profile.account}
          </h2>
          <dl className="detail-list">
            <dt>{t().profile.email}</dt>
            <dd>{user.email}</dd>
            <dt>{t().profile.role}</dt>
            <dd>
              <RoleBadge role={user.role} />
            </dd>
            <dt>{t().profile.country}</dt>
            <dd>{countryName(user.country)}</dd>
          </dl>
          <Field label={t().profile.language} hint={t().profile.languageHint}>
            <Select
              value={locale}
              options={LOCALES.map((option) => ({ value: option, label: t().language[option] }))}
              onChange={setLocale}
            />
          </Field>
          <Field label={t().profile.theme} hint={t().profile.themeHint}>
            <Select
              value={theme}
              options={THEMES.map((option) => ({ value: option, label: t().theme[option] }))}
              onChange={setTheme}
            />
          </Field>
        </section>
      </div>

      <div className="two-columns">
        <section className="card" aria-labelledby="password-title">
          <h2 id="password-title" className="section-title">
            {t().profile.changePassword}
          </h2>
          <p className="muted">{t().profile.signOutOthers}</p>
          {changePassword.isSuccess && <Notice tone="success">{t().profile.changed}</Notice>}
          {changePassword.isError && <Notice tone="error">{errorMessage(changePassword.error)}</Notice>}
          {mismatch && <Notice tone="error">{t().profile.mismatch}</Notice>}
          <form className="stack" onSubmit={handleSubmit}>
            <Field label={t().profile.current}>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={form.old_password}
                onChange={(e) => setForm({ ...form, old_password: e.target.value })}
                required
              />
            </Field>
            <Field label={t().profile.next} hint={t().profile.minLength(MIN_PASSWORD)}>
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
            <Field label={t().profile.repeat}>
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
              {changePassword.isPending ? t().common.saving : t().profile.changePassword}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
