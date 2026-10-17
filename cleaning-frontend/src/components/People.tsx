import { t } from "../i18n/locale";
import { emailName, formatDateTime, formatRelative } from "../labels";

export function Person({ email }: { email: string | null }) {
  if (!email) return <span className="person person-empty">{t().common.unassigned}</span>;
  return (
    <span className="person" title={email}>
      <span className="person-avatar" aria-hidden="true">
        {email.charAt(0).toUpperCase()}
      </span>
      <span className="person-name" aria-hidden="true">
        {emailName(email)}
      </span>
      <span className="visually-hidden">{email}</span>
    </span>
  );
}

export function RelativeDate({ value }: { value: string }) {
  return (
    <time dateTime={value} title={formatDateTime(value)}>
      {formatRelative(value)}
    </time>
  );
}
