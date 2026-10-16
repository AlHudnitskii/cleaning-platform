import { useEffect, useEffectEvent } from "react";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit"].includes(target.type);
  return false;
}

export function shortcutsBlocked(event: KeyboardEvent): boolean {
  return (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    isTypingTarget(event.target) ||
    document.body.classList.contains("has-drawer") ||
    document.querySelector("[data-popover]") !== null
  );
}

export function useShortcut(key: string, handler: () => void, enabled = true): void {
  const run = useEffectEvent(handler);
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase() || shortcutsBlocked(event)) return;
      event.preventDefault();
      run();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [key, enabled]);
}

export function focusPageSearch(): boolean {
  const input = document.querySelector<HTMLInputElement>('[aria-keyshortcuts="/"]');
  input?.focus();
  return input !== null;
}
