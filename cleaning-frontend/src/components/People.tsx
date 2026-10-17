import type { UserResponse } from "../api/types";
import { t } from "../i18n/locale";
import { displayName, formatDateTime, formatRelative } from "../labels";

export function Person({ email, name }: { email: string | null; name?: string | null }) {
  if (!email) return <span className="person person-empty">{t().common.unassigned}</span>;
  const shown = displayName(email, name);
  return (
    <span className="person" title={email}>
      <span className="person-avatar" aria-hidden="true">
        {shown.charAt(0).toUpperCase()}
      </span>
      <span className="person-name" aria-hidden="true">
        {shown}
      </span>
      <span className="visually-hidden">{name ? `${name}, ${email}` : email}</span>
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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function Avatar({ user, size = "small" }: { user: UserResponse; size?: "small" | "large" }) {
  const name = displayName(user.email, user.full_name);
  const className = `avatar${size === "large" ? " avatar-large" : ""}`;
  if (user.avatar_url && isHttpUrl(user.avatar_url)) {
    return <img className={`${className} avatar-photo`} src={user.avatar_url} alt="" aria-hidden="true" />;
  }
  return (
    <span className={className} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
