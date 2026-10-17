import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const MARGIN = 8;

interface Position {
  top: number;
  left: number;
  minWidth: number;
  maxHeight: number;
}

function place(anchor: DOMRect, panel: HTMLElement, matchWidth: boolean): Position {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceBelow = viewportHeight - anchor.bottom - GAP - MARGIN;
  const spaceAbove = anchor.top - GAP - MARGIN;
  const height = panel.scrollHeight;
  const openUp = height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(openUp ? spaceAbove : spaceBelow, 160);
  const shownHeight = Math.min(height, maxHeight);
  const width = Math.max(panel.offsetWidth, matchWidth ? anchor.width : 0);
  return {
    top: openUp ? anchor.top - GAP - shownHeight : anchor.bottom + GAP,
    left: Math.min(Math.max(anchor.left, MARGIN), Math.max(viewportWidth - width - MARGIN, MARGIN)),
    minWidth: matchWidth ? anchor.width : 0,
    maxHeight,
  };
}

function samePosition(a: Position | null, b: Position): boolean {
  return a !== null && a.top === b.top && a.left === b.left && a.minWidth === b.minWidth && a.maxHeight === b.maxHeight;
}

export function Popover({
  anchorRef,
  onDismiss,
  matchWidth = false,
  className = "",
  children,
  ...rest
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  matchWidth?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const dismiss = useEffectEvent(onDismiss);

  const update = useEffectEvent(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const next = place(anchor.getBoundingClientRect(), panel, matchWidth);
    setPosition((previous) => (samePosition(previous, next) ? previous : next));
  });

  useLayoutEffect(() => {
    update();
  }, [children]);

  useEffect(() => {
    const handleReflow = () => update();
    const handlePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      dismiss();
    };
    window.addEventListener("resize", handleReflow);
    window.addEventListener("scroll", handleReflow, true);
    document.addEventListener("pointerdown", handlePointer);
    return () => {
      window.removeEventListener("resize", handleReflow);
      window.removeEventListener("scroll", handleReflow, true);
      document.removeEventListener("pointerdown", handlePointer);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      {...rest}
      ref={panelRef}
      data-popover=""
      className={`popover ${className}`}
      style={
        position
          ? { top: position.top, left: position.left, minWidth: position.minWidth, maxHeight: position.maxHeight }
          : { top: 0, left: 0, visibility: "hidden" }
      }
    >
      {children}
    </div>,
    document.body,
  );
}
