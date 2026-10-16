import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, LOCATION_LEVELS, type Country, type LocationLevel, type LocationResponse } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { LevelBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  useDeleteLocation,
  useLocations,
  useRenameLocation,
  type LocationNode,
} from "../features/locations/api";
import { countryNames } from "../labels";
import { t } from "../i18n/locale";
import { useShortcut } from "../shortcuts";
import { readEnum, useUrlState } from "../urlState";

type OpenMode = "default" | "all" | "none";

interface TreeActions {
  add: (draft: LocationDraft) => void;
  rename: (node: LocationNode) => void;
  remove: (node: LocationNode) => void;
}

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
  const [renaming, setRenaming] = useState<LocationNode | null>(null);
  const [removing, setRemoving] = useState<LocationNode | null>(null);
  const [query, setQuery] = useState("");
  const [openMode, setOpenMode] = useState<OpenMode>("default");
  const tree = locations.data ? buildTree(locations.data) : [];
  const visible = filterTree(tree, query);
  const searching = query.trim() !== "";

  const startCreate = (initial: LocationDraft) => setDraft(initial);
  const startRoot = () => startCreate({ country: country ?? "DE", level: "country", parentId: "" });
  useShortcut("n", startRoot, isAdmin);
  const actions: TreeActions | undefined = isAdmin
    ? { add: startCreate, rename: setRenaming, remove: setRemoving }
    : undefined;

  return (
    <>
      <PageHeader
        title={t().locations.title}
        description={t().locations.description}
        actions={
          isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              aria-keyshortcuts="n"
              onClick={startRoot}
            >
              <Icon name="plus" size={15} />
              {t().locations.create}
            </button>
          )
        }
      />
      {isAdmin && draft && (
        <Drawer title={t().locations.newLocation} onClose={() => setDraft(null)}>
          <LocationForm
            initial={draft}
            onCancel={() => setDraft(null)}
            onCreated={(location) => {
              setDraft(null);
              showToast(t().locations.created(location.name));
            }}
          />
        </Drawer>
      )}

      {renaming && (
        <Drawer title={t().locations.renameTitle} description={renaming.full_name} onClose={() => setRenaming(null)}>
          <RenameForm
            location={renaming}
            onCancel={() => setRenaming(null)}
            onRenamed={(location) => {
              setRenaming(null);
              showToast(t().locations.renamed(location.name));
            }}
          />
        </Drawer>
      )}
      {removing && (
        <DeleteLocationDialog
          location={removing}
          onClose={() => setRemoving(null)}
          onDeleted={() => {
            setRemoving(null);
            showToast(t().locations.removed(removing.name));
          }}
        />
      )}

      <div className="toolbar toolbar-plain" role="group" aria-label={t().common.filters}>
        <SearchField value={query} onChange={setQuery} label={t().locations.search} shortcut="/" />
        {isAdmin && (
          <FilterControl label={t().locations.country}>
            <Select
              variant="inline"
              value={country ?? ""}
              options={withEmpty(t().common.all, optionList(COUNTRIES, countryNames()))}
              onChange={(value) => update({ country: value })}
            />
          </FilterControl>
        )}
        <span className="toolbar-spacer" />
        {locations.data && <span className="toolbar-count">{t().locations.count(locations.data.length)}</span>}
        <div className="pager-group" role="group" aria-label={t().locations.treeView}>
          <button type="button" className="pager-size" disabled={searching} onClick={() => setOpenMode("all")}>
            {t().locations.expandAll}
          </button>
          <button type="button" className="pager-size" disabled={searching} onClick={() => setOpenMode("none")}>
            {t().locations.collapseAll}
          </button>
        </div>
      </div>

      {locations.isPending ? (
        <ListSkeleton label={t().locations.loading} columns={3} />
      ) : locations.isError ? (
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      ) : locations.data.length === 0 ? (
        <EmptyState title={t().locations.none} hint={isAdmin ? t().locations.noneHint : undefined} />
      ) : visible.length === 0 ? (
        <EmptyState title={t().locations.noMatch(query.trim())} hint={t().locations.noMatchHint} />
      ) : (
        <ul className="tree list-card" aria-label={t().locations.tree} key={searching ? "search" : openMode}>
          {visible.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              openMode={searching ? "all" : openMode}
              highlight={query.trim()}
              actions={actions}
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
  actions,
}: {
  node: LocationNode;
  depth: number;
  openMode: OpenMode;
  highlight: string;
  actions?: TreeActions;
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
            aria-label={expanded ? t().locations.collapse(node.name) : t().locations.expand(node.name)}
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
        {nested > 0 && <span className="tree-count">{t().locations.inside(nested)}</span>}
        {actions && (
          <span className="tree-actions">
            {canHaveChildren && (
              <button
                type="button"
                className="icon-button tree-add"
                aria-label={t().locations.addInside(node.name)}
                title={t().locations.addInsideShort(node.name)}
                onClick={() => actions.add(childDraft(node))}
              >
                <Icon name="plus" size={14} />
              </button>
            )}
            <button
              type="button"
              className="icon-button tree-add"
              aria-label={t().locations.rename(node.name)}
              title={t().locations.rename(node.name)}
              onClick={() => actions.rename(node)}
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              type="button"
              className="icon-button tree-add"
              aria-label={t().locations.remove(node.name)}
              title={t().locations.remove(node.name)}
              onClick={() => actions.remove(node)}
            >
              <Icon name="trash" size={14} />
            </button>
          </span>
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
              actions={actions}
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
        <Field label={t().locations.name}>
          <input className="input" value={name} minLength={2} maxLength={255} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t().locations.country}>
          <Select
            value={country}
            options={optionList(COUNTRIES, countryNames())}
            onChange={(value) => {
              setCountry(value);
              setParentId("");
            }}
          />
        </Field>
        <Field label={t().locations.level}>
          <Select
            value={level}
            options={optionList(LOCATION_LEVELS, t().level)}
            onChange={(value) => {
              setLevel(value);
              setParentId("");
            }}
          />
        </Field>
        <Field label={t().locations.parent} hint={t().locations.parentHint}>
          <Select
            value={parentId}
            options={withEmpty(
              t().locations.noParent,
              parentOptions.map((location) => ({ value: location.id, label: location.full_name })),
            )}
            onChange={setParentId}
          />
        </Field>
      </div>
      <div className="drawer-footer">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          {t().common.cancel}
        </button>
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? t().common.creating : t().locations.create}
        </button>
      </div>
    </form>
  );
}

function RenameForm({
  location,
  onRenamed,
  onCancel,
}: {
  location: LocationNode;
  onRenamed: (location: LocationResponse) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(location.name);
  const rename = useRenameLocation(location.id);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    rename.mutate(name, { onSuccess: onRenamed });
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-body">
        {rename.isError && <Notice tone="error">{errorMessage(rename.error)}</Notice>}
        <Field label={t().locations.name}>
          <input
            className="input"
            value={name}
            minLength={2}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="drawer-footer">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          {t().common.cancel}
        </button>
        <button className="btn btn-primary" type="submit" disabled={rename.isPending}>
          {t().locations.save}
        </button>
      </div>
    </form>
  );
}

function DeleteLocationDialog({
  location,
  onDeleted,
  onClose,
}: {
  location: LocationNode;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const remove = useDeleteLocation(location.id);
  return (
    <ConfirmDialog
      title={t().locations.removeQuestion(location.name)}
      confirmLabel={t().locations.removeConfirm}
      busy={remove.isPending}
      error={remove.isError ? errorMessage(remove.error) : null}
      onConfirm={() => remove.mutate(undefined, { onSuccess: onDeleted })}
      onCancel={onClose}
    >
      <p>{location.full_name}</p>
      <p>{t().locations.removeHint}</p>
    </ConfirmDialog>
  );
}
