import { Icon } from "./Icon";
import { dismissToast, useToasts } from "./toast";

export function ToastHost() {
  const toasts = useToasts();
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-mark" aria-hidden="true" />
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
