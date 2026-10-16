import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { t } from "../i18n/locale";
import { Icon } from "./Icon";
import { useModalFocus } from "./modalFocus";

export function Drawer({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(panelRef, onClose, "input, select, textarea, [role='combobox']");

  return createPortal(
    <div className="drawer-layer">
      <button type="button" className="drawer-backdrop" aria-label={t().feedback.closePanel} tabIndex={-1} onClick={onClose} />
      <div ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="drawer-header">
          <div>
            <h2 id={titleId} className="drawer-title">
              {title}
            </h2>
            {description && <p className="drawer-description">{description}</p>}
          </div>
          <button type="button" className="icon-button" aria-label={t().feedback.closePanel} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
