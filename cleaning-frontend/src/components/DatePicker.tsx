import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { addDays, addMonths, formatDay, monthGrid, mondayIndex, parseDay, toDay, today } from "../dates";
import { Icon } from "./Icon";
import { Popover } from "./Popover";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const monthTitle = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const FOCUSABLE = "button:not([disabled])";

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Any date",
  min,
  max,
  clearable = true,
  variant = "field",
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  variant?: "field" | "inline";
  "aria-describedby"?: string;
}) {
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;
  const titleId = `${triggerId}-title`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(() => parseDay(value) ?? new Date());
  const todayValue = today();

  useEffect(() => {
    if (!open || !focusDay.current) return;
    focusDay.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toDay(focused)}"]`)?.focus();
  }, [open, focused]);

  const isDisabled = (day: string) => (min !== undefined && day < min) || (max !== undefined && day > max);

  const openCalendar = () => {
    setFocused(parseDay(value) ?? parseDay(todayValue) ?? new Date());
    focusDay.current = true;
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const pick = (day: string) => {
    if (isDisabled(day)) return;
    onChange(day);
    close();
  };

  const handleGridKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -mondayIndex(focused)),
      End: () => addDays(focused, 6 - mondayIndex(focused)),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusDay.current = true;
    setFocused(move());
  };

  const handlePanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.tabIndex >= 0,
    );
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

  const days = monthGrid(focused);
  const focusedDay = toDay(focused);

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`select-trigger date-trigger select-${variant}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => (open ? close() : openCalendar())}
      >
        <span className={value ? "select-value" : "select-value select-placeholder"}>
          {value ? formatDay(value) : placeholder}
        </span>
        <span className="select-chevron" aria-hidden="true">
          <Icon name="calendar" size={15} />
        </span>
      </button>
      {open && (
        <Popover
          anchorRef={triggerRef}
          onDismiss={() => setOpen(false)}
          className="calendar"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={handlePanelKey}
        >
          <div className="calendar-header">
            <button
              type="button"
              className="calendar-nav"
              aria-label="Previous month"
              onClick={() => setFocused(addMonths(focused, -1))}
            >
              <Icon name="back" size={14} />
            </button>
            <h2 id={titleId} className="calendar-title" aria-live="polite">
              {monthTitle.format(focused)}
            </h2>
            <button type="button" className="calendar-nav" aria-label="Next month" onClick={() => setFocused(addMonths(focused, 1))}>
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="calendar-grid" ref={gridRef} role="group" aria-label={monthTitle.format(focused)}>
            {days.map((date) => {
              const day = toDay(date);
              const outside = date.getMonth() !== focused.getMonth();
              const classes = ["calendar-day"];
              if (outside) classes.push("is-outside");
              if (day === value) classes.push("is-selected");
              if (day === todayValue) classes.push("is-today");
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  className={classes.join(" ")}
                  tabIndex={day === focusedDay ? 0 : -1}
                  aria-label={dayLabel.format(date)}
                  aria-pressed={day === value}
                  aria-current={day === todayValue ? "date" : undefined}
                  disabled={isDisabled(day)}
                  onClick={() => pick(day)}
                  onKeyDown={handleGridKey}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="calendar-footer">
            <button type="button" className="link-button" disabled={isDisabled(todayValue)} onClick={() => pick(todayValue)}>
              Today
            </button>
            {clearable && value && (
              <button
                type="button"
                className="link-button link-button-muted"
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
