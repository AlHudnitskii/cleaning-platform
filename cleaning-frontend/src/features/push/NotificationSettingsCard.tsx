import { errorMessage } from "../../api/errors";
import type { NotificationTopic, UserRole } from "../../api/types";
import { ErrorState, Loading, Notice } from "../../components/Feedback";
import { t } from "../../i18n/locale";
import { useChangeNotification, useNotificationSettings } from "./api";
import { usePushNotifications } from "./usePushNotifications";

// The consumer sends these topics to these roles; showing others would offer switches that do nothing.
const TOPICS_BY_ROLE: Record<UserRole, NotificationTopic[]> = {
  cleaner: ["assigned", "status_changed", "due_soon", "overdue"],
  manager: ["task_created", "overdue"],
  admin: [],
};

export function NotificationSettingsCard({ role }: { role: UserRole }) {
  const topics = TOPICS_BY_ROLE[role];
  const settings = useNotificationSettings(topics.length > 0);
  const change = useChangeNotification();
  const push = usePushNotifications();
  if (topics.length === 0) return null;

  return (
    <section className="card" aria-labelledby="notifications-title">
      <h2 id="notifications-title" className="section-title">
        {t().notifications.title}
      </h2>
      {push.supported && !push.enabled && (
        <div className="notice-row">
          <p className="muted">{t().notifications.deviceOff}</p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={push.toggle.isPending}
            onClick={() => push.toggle.mutate(true)}
          >
            {t().notifications.turnOn}
          </button>
        </div>
      )}
      {!push.supported && <p className="muted">{t().notifications.unsupported}</p>}
      {change.isError && <Notice tone="error">{errorMessage(change.error)}</Notice>}
      {settings.isPending ? (
        <Loading label={t().notifications.loading} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <fieldset className="toggle-list">
          <legend className="visually-hidden">{t().notifications.title}</legend>
          {topics.map((topic) => (
            <div key={topic} className="check-field">
              <label className="check-field-label">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={settings.data[topic]}
                  aria-describedby={`topic-${topic}-hint`}
                  onChange={(event) => change.mutate({ topic, enabled: event.target.checked })}
                />
                {t().notifications.topics[topic]}
              </label>
              <p className="field-hint" id={`topic-${topic}-hint`}>
                {t().notifications.hints[topic]}
              </p>
            </div>
          ))}
        </fieldset>
      )}
    </section>
  );
}
