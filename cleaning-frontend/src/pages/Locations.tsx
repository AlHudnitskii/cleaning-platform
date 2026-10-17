import { useState } from "react";

import { COUNTRIES, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { Drawer } from "../components/Drawer";
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import { FilterControl } from "../components/Field";
import { optionList, withEmpty } from "../components/options";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { Select } from "../components/Select";
import { showToast } from "../components/toast";
import { buildTree, filterTree, useLocations, type LocationNode } from "../features/locations/api";
import { countryNames } from "../labels";
import { t } from "../i18n/locale";
import { useShortcut } from "../shortcuts";
import { readEnum, useUrlState } from "../urlState";
import {
  type LocationDraft,
  LocationTreeNode,
  type OpenMode,
  type TreeActions,
} from "../features/locations/LocationTree";
import { DeleteLocationDialog, LocationForm, RenameForm } from "../features/locations/LocationForms";

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
            <LocationTreeNode
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
