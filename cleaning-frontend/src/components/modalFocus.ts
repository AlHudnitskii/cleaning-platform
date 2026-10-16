import { useEffect, useEffectEvent, type RefObject } from "react";

const FOCUSABLE = "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]";

let openModals = 0;

function hideBackground(): () => void {
  const root = document.getElementById("root");
  openModals += 1;
  root?.setAttribute("inert", "");
  return () => {
    openModals -= 1;
    if (openModals === 0) root?.removeAttribute("inert");
  };
}

export function useModalFocus(panelRef: RefObject<HTMLElement | null>, onClose: () => void, initialFocus: string): void {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const showBackground = hideBackground();
    (panel?.querySelector<HTMLElement>(initialFocus) ?? panel)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("has-drawer");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("has-drawer");
      showBackground();
      previous?.focus();
    };
  }, [panelRef, initialFocus]);
}
