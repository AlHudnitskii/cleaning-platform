import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Icon } from "./Icon";
import type { SelectOption } from "./options";
import { Popover } from "./Popover";

const TYPEAHEAD_RESET_MS = 600;

function optionIndex(target: EventTarget): number | null {
  if (!(target instanceof Element)) return null;
  const index = target.closest("[data-index]")?.getAttribute("data-index");
  return index ? Number(index) : null;
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  variant = "field",
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  variant?: "field" | "inline";
  "aria-describedby"?: string;
}) {
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;
  const listId = `${triggerId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const option = document.getElementById(`${listId}-${active}`);
    const container = option?.closest<HTMLElement>(".popover");
    if (!option || !container) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [open, active, listId]);

  const openList = () => {
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  };

  const jumpTo = (key: string) => {
    const now = Date.now();
    const text = now - typeahead.current.at > TYPEAHEAD_RESET_MS ? key : typeahead.current.text + key;
    typeahead.current = { text, at: now };
    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(text.toLowerCase()));
    if (match >= 0) setActive(match);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) jumpTo(event.key);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        className={`select-trigger select-${variant}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className={selected ? "select-value" : "select-value select-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="select-chevron" aria-hidden="true">
          <Icon name="chevronDown" size={14} />
        </span>
      </button>
      {open && (
        <Popover anchorRef={triggerRef} onDismiss={() => setOpen(false)} matchWidth className="select-popover">
          <ul
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={triggerId}
            className="select-list"
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={handleKeyDown}
            onPointerMove={(event) => {
              const index = optionIndex(event.target);
              if (index !== null) setActive(index);
            }}
            onClick={(event) => {
              const index = optionIndex(event.target);
              if (index !== null) choose(index);
            }}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                data-index={index}
                aria-selected={option.value === value}
                className={`select-option${index === active ? " is-active" : ""}`}
              >
                <span className="select-option-label">{option.label}</span>
                {option.value === value && <Icon name="check" size={14} />}
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  );
}
