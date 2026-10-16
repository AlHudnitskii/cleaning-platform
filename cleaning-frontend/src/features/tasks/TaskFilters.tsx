import { useEffect, useEffectEvent, useId, useRef, useState, type Ref } from "react";

import { COUNTRIES, TASK_PRIORITIES, TASK_STATUSES, type LocationResponse } from "../../api/types";
import { DatePicker } from "../../components/DatePicker";
import { FilterControl } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { optionList, withEmpty } from "../../components/options";
import { SearchField } from "../../components/SearchField";
import { Select } from "../../components/Select";
import { formatDay } from "../../dates";
import { COUNTRY_NAMES, PRIORITY_LABELS, STATUS_LABELS } from "../../labels";
import { sortedByFullName } from "../locations/api";
import type { TaskListParams } from "./api";

const SEARCH_DELAY_MS = 300;

type FilterKey = "status" | "priority" | "country" | "location_id" | "date_from" | "date_to";
type Changes = Partial<Record<FilterKey | "search", string | undefined>>;

export function SearchBox({
  value,
  onSearch,
  inputRef,
}: {
  value: string;
  onSearch: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const commit = useEffectEvent(onSearch);

  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft.trim() === value) return;
    const timer = setTimeout(() => commit(draft.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return <SearchField ref={inputRef} value={draft} onChange={setDraft} label="Search tasks" shortcut="/" />;
}

export function FilterMenu({
  filters,
  locations,
  showCountry,
  onChange,
}: {
  filters: TaskListParams;
  locations: LocationResponse[];
  showCountry: boolean;
  onChange: (changes: Changes) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = activeFilterCount(filters);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target) || target.closest("[data-popover]")) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="filter-menu" ref={rootRef}>
      <button
        type="button"
        className={`toolbar-button${active > 0 ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="filter" size={16} />
        Filter
        {active > 0 && <span className="toolbar-button-count">{active}</span>}
      </button>
      {open && (
        <div id={panelId} className="filter-panel" role="group" aria-label="Task filters">
          <FilterControl label="Status">
            <Select
              variant="inline"
              value={filters.status ?? ""}
              options={withEmpty("All", optionList(TASK_STATUSES, STATUS_LABELS))}
              onChange={(status) => onChange({ status })}
            />
          </FilterControl>
          <FilterControl label="Priority">
            <Select
              variant="inline"
              value={filters.priority ?? ""}
              options={withEmpty("All", optionList(TASK_PRIORITIES, PRIORITY_LABELS))}
              onChange={(priority) => onChange({ priority })}
            />
          </FilterControl>
          {showCountry && (
            <FilterControl label="Country">
              <Select
                variant="inline"
                value={filters.country ?? ""}
                options={withEmpty("All", optionList(COUNTRIES, COUNTRY_NAMES))}
                onChange={(country) => onChange({ country, location_id: undefined })}
              />
            </FilterControl>
          )}
          <FilterControl label="Location">
            <Select
              variant="inline"
              value={filters.location_id ?? ""}
              options={withEmpty(
                "All",
                sortedByFullName(locations).map((location) => ({ value: location.id, label: location.full_name })),
              )}
              onChange={(location_id) => onChange({ location_id })}
            />
          </FilterControl>
          <FilterControl label="Created from">
            <DatePicker
              variant="inline"
              value={filters.date_from ?? ""}
              max={filters.date_to}
              onChange={(date_from) => onChange({ date_from })}
            />
          </FilterControl>
          <FilterControl label="Created to">
            <DatePicker
              variant="inline"
              value={filters.date_to ?? ""}
              min={filters.date_from}
              onChange={(date_to) => onChange({ date_to })}
            />
          </FilterControl>
        </div>
      )}
    </div>
  );
}

function activeFilterCount(filters: TaskListParams): number {
  return [filters.status, filters.priority, filters.country, filters.location_id, filters.date_from, filters.date_to].filter(Boolean)
    .length;
}

export function ActiveFilters({
  filters,
  locations,
  onChange,
  onClear,
}: {
  filters: TaskListParams;
  locations: LocationResponse[];
  onChange: (changes: Changes) => void;
  onClear: () => void;
}) {
  const locationName = locations.find((location) => location.id === filters.location_id)?.full_name ?? "Selected";
  const chips: { key: FilterKey; label: string; value: string }[] = [];
  if (filters.status) chips.push({ key: "status", label: "Status", value: STATUS_LABELS[filters.status] });
  if (filters.priority) chips.push({ key: "priority", label: "Priority", value: PRIORITY_LABELS[filters.priority] });
  if (filters.country) chips.push({ key: "country", label: "Country", value: COUNTRY_NAMES[filters.country] });
  if (filters.location_id) chips.push({ key: "location_id", label: "Location", value: locationName });
  if (filters.date_from) chips.push({ key: "date_from", label: "From", value: formatDay(filters.date_from) });
  if (filters.date_to) chips.push({ key: "date_to", label: "To", value: formatDay(filters.date_to) });

  if (chips.length === 0 && !filters.search) return null;

  return (
    <div className="filter-chips">
      {filters.search && (
        <span className="filter-chip">
          <span className="filter-chip-label">Search</span> “{filters.search}”
          <button type="button" className="filter-chip-remove" aria-label="Remove search" onClick={() => onChange({ search: undefined })}>
            <Icon name="close" size={12} />
          </button>
        </span>
      )}
      {chips.map((chip) => (
        <span key={chip.key} className="filter-chip">
          <span className="filter-chip-label">{chip.label}</span> {chip.value}
          <button
            type="button"
            className="filter-chip-remove"
            aria-label={`Remove ${chip.label} filter`}
            onClick={() => onChange({ [chip.key]: undefined })}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <button type="button" className="link-button" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}
