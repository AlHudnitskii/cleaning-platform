import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useModalFocus } from "./modalFocus";

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(panelRef, onCancel, "[data-autofocus]");

  return createPortal(
    <div className="drawer-layer dialog-layer">
      <button type="button" className="drawer-backdrop" aria-label="Cancel" tabIndex={-1} onClick={onCancel} />
      <div
        ref={panelRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <div id={descriptionId} className="dialog-body">
          {children}
        </div>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" data-autofocus onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
