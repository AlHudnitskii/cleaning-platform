import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, LOCATION_LEVELS, type Country, type LocationLevel, type LocationResponse } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { LevelBadge } from "../components/Badges";
import { Drawer } from "../components/Drawer";
import { EmptyState, ErrorState, ListSkeleton, Notice } from "../components/Feedback";
import { Field, FilterControl } from "../components/Field";
import { optionList, withEmpty } from "../components/options";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { Select } from "../components/Select";
import { showToast } from "../components/toast";
import {
  buildTree,
  filterTree,
  sortedByFullName,
  useCreateLocation,
  useLocations,
  type LocationNode,
} from "../features/locations/api";
import { COUNTRY_NAMES, LEVEL_LABELS } from "../labels";
import { useShortcut } from "../shortcuts";
import { readEnum, useUrlState } from "../urlState";

type OpenMode = "default" | "all" | "none";

interface LocationDraft {
  country: Country;
  level: LocationLevel;
  parentId: string;
}

function childDraft(node: LocationNode): LocationDraft {
  const level = LOCATION_LEVELS[LOCATION_LEVELS.indexOf(node.level) + 1] ?? node.level;
  return { country: node.country, level, parentId: node.id };
}

function countDescendants(node: LocationNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

export function Locations() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update } = useUrlState();
  const country = isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined;
  const locations = useLocations(country);
  const [draft, setDraft] = useState<LocationDraft | null>(null);
  const [query, setQuery] = useState("");
  const [openMode, setOpenMode] = useState<OpenMode>("default");
  const tree = locations.data ? buildTree(locations.data) : [];
  const visible = filterTree(tree, query);
  const searching = query.trim() !== "";

  const startCreate = (initial: LocationDraft) => setDraft(initial);
  const startRoot = () => startCreate({ country: country ?? "DE", level: "country", parentId: "" });
  useShortcut("n", startRoot, isAdmin);

  return (
    <>
      <PageHeader
        title="Locations"
        description="Countries, cities, buildings, floors and rooms where tasks are performed."
        actions={
          isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              aria-keyshortcuts="n"
              onClick={startRoot}
            >
              <Icon name="plus" size={15} />
              Create location
            </button>
          )
        }
      />
      {isAdmin && draft && (
        <Drawer title="New location" onClose={() => setDraft(null)}>
          <LocationForm
            initial={draft}
            onCancel={() => setDraft(null)}
            onCreated={(location) => {
              setDraft(null);
              showToast(`${location.name} created`);
            }}
          />
        </Drawer>
      )}

      <div className="toolbar toolbar-plain" role="group" aria-label="Filters">
        <SearchField value={query} onChange={setQuery} label="Search locations" shortcut="/" />
        {isAdmin && (
          <FilterControl label="Country">
            <Select
              variant="inline"
              value={country ?? ""}
              options={withEmpty("All", optionList(COUNTRIES, COUNTRY_NAMES))}
              onChange={(value) => update({ country: value })}
            />
          </FilterControl>
        )}
        <span className="toolbar-spacer" />
        {locations.data && <span className="toolbar-count">{locations.data.length} locations</span>}
        <div className="pager-group" role="group" aria-label="Tree view">
          <button type="button" className="pager-size" disabled={searching} onClick={() => setOpenMode("all")}>
            Expand all
          </button>
          <button type="button" className="pager-size" disabled={searching} onClick={() => setOpenMode("none")}>
            Collapse all
          </button>
        </div>
      </div>

      {locations.isPending ? (
        <ListSkeleton label="Loading locations" columns={3} />
      ) : locations.isError ? (
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      ) : locations.data.length === 0 ? (
        <EmptyState title="No locations yet" hint={isAdmin ? "Start by creating a country." : undefined} />
      ) : visible.length === 0 ? (
        <EmptyState title={`Nothing matches “${query.trim()}”`} hint="Check the spelling or search for a parent location." />
      ) : (
        <ul className="tree list-card" aria-label="Location tree" key={searching ? "search" : openMode}>
          {visible.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              openMode={searching ? "all" : openMode}
              highlight={query.trim()}
              onAddChild={isAdmin ? startCreate : undefined}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function initiallyOpen(mode: OpenMode, depth: number): boolean {
  if (mode === "all") return true;
  if (mode === "none") return false;
  return depth < 2;
}

function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const index = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + highlight.length)}</mark>
      {text.slice(index + highlight.length)}
    </>
  );
}

function TreeNode({
  node,
  depth,
  openMode,
  highlight,
  onAddChild,
}: {
  node: LocationNode;
  depth: number;
  openMode: OpenMode;
  highlight: string;
  onAddChild?: (draft: LocationDraft) => void;
}) {
  const [expanded, setExpanded] = useState(() => initiallyOpen(openMode, depth));
  const hasChildren = node.children.length > 0;
  const nested = countDescendants(node);
  const canHaveChildren = node.level !== "room";

  return (
    <li className={`tree-node level-${node.level}`}>
      <div className="tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
            onClick={() => setExpanded((v) => !v)}
          >
            <Icon name={expanded ? "chevronDown" : "chevronRight"} size={13} />
          </button>
        ) : (
          <span className="tree-toggle-placeholder" aria-hidden="true" />
        )}
        <span className="tree-name">
          <Highlighted text={node.name} highlight={highlight} />
        </span>
        <LevelBadge level={node.level} />
        {nested > 0 && <span className="tree-count">{nested} inside</span>}
        {onAddChild && canHaveChildren && (
          <button
            type="button"
            className="icon-button tree-add"
            aria-label={`Add location inside ${node.name}`}
            title={`Add inside ${node.name}`}
            onClick={() => onAddChild(childDraft(node))}
          >
            <Icon name="plus" size={14} />
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              openMode={openMode}
              highlight={highlight}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function LocationForm({
  initial,
  onCreated,
  onCancel,
}: {
  initial: LocationDraft;
  onCreated: (location: LocationResponse) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState<Country>(initial.country);
  const [level, setLevel] = useState<LocationLevel>(initial.level);
  const [parentId, setParentId] = useState(initial.parentId);
  const parents = useLocations(country);
  const create = useCreateLocation();
  const levelDepth = LOCATION_LEVELS.indexOf(level);
  const parentOptions = sortedByFullName(parents.data ?? []).filter(
    (location) => LOCATION_LEVELS.indexOf(location.level) < levelDepth,
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({ name, country, level, parent_id: parentId || undefined }, { onSuccess: onCreated });
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-body">
        {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
        <Field label="Name">
          <input className="input" value={name} minLength={2} maxLength={255} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Country">
          <Select
            value={country}
            options={optionList(COUNTRIES, COUNTRY_NAMES)}
            onChange={(value) => {
              setCountry(value);
              setParentId("");
            }}
          />
        </Field>
        <Field label="Level">
          <Select
            value={level}
            options={optionList(LOCATION_LEVELS, LEVEL_LABELS)}
            onChange={(value) => {
              setLevel(value);
              setParentId("");
            }}
          />
        </Field>
        <Field label="Parent location" hint="Only locations of a higher level in the same country are listed.">
          <Select
            value={parentId}
            options={withEmpty(
              "No parent",
              parentOptions.map((location) => ({ value: location.id, label: location.full_name })),
            )}
            onChange={setParentId}
          />
        </Field>
      </div>
      <div className="drawer-footer">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create location"}
        </button>
      </div>
    </form>
  );
}
