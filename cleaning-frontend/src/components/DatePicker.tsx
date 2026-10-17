import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { addDays, addMonths, formatDay, monthGrid, mondayIndex, parseDay, toDay, today } from "../dates";
import { dateFormatter } from "../i18n/format";
import { t } from "../i18n/locale";
import { Icon } from "./Icon";
import { Popover } from "./Popover";

function monthTitle(date: Date): string {
  const title = dateFormatter("month", { month: "long", year: "numeric" }).format(date);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function dayLabel(date: Date): string {
  return dateFormatter("weekday", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}
const FOCUSABLE = "button:not([disabled])";

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = t().calendar.anyDate,
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
              aria-label={t().calendar.previousMonth}
              onClick={() => setFocused(addMonths(focused, -1))}
            >
              <Icon name="back" size={14} />
            </button>
            <h2 id={titleId} className="calendar-title" aria-live="polite">
              {monthTitle(focused)}
            </h2>
            <button
              type="button"
              className="calendar-nav"
              aria-label={t().calendar.nextMonth}
              onClick={() => setFocused(addMonths(focused, 1))}
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {t().calendar.weekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="calendar-grid" ref={gridRef} role="group" aria-label={monthTitle(focused)}>
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
                  aria-label={dayLabel(date)}
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
              {t().calendar.today}
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
                {t().common.clear}
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
