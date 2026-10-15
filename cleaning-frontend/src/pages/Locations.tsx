import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, LOCATION_LEVELS, type Country, type LocationLevel, type UserResponse } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { LevelBadge } from "../components/Badges";
import { EmptyState, ErrorState, Loading, Notice } from "../components/Feedback";
import { Field, Options } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { buildTree, sortedByFullName, useCreateLocation, useLocations, type LocationNode } from "../features/locations/api";
import { COUNTRY_NAMES, LEVEL_LABELS, countryName } from "../labels";
import { readEnum, useUrlState } from "../urlState";

export function Locations() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update } = useUrlState();
  const country = isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined;
  const locations = useLocations(country);
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <PageHeader
        title="Locations"
        description="Countries, cities, buildings, floors and rooms where tasks are performed."
        actions={
          isAdmin && (
            <button type="button" className="btn btn-primary" aria-expanded={showForm} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Close form" : "Create location"}
            </button>
          )
        }
      />
      {isAdmin && showForm && <LocationForm user={user} onCreated={() => setShowForm(false)} />}

      {isAdmin && (
        <section className="filters" aria-label="Filters">
          <Field label="Country">
            <select className="input" value={country ?? ""} onChange={(e) => update({ country: e.target.value })}>
              <Options values={COUNTRIES} labels={COUNTRY_NAMES} empty="All countries" />
            </select>
          </Field>
        </section>
      )}

      {locations.isPending ? (
        <Loading label="Loading locations" />
      ) : locations.isError ? (
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      ) : locations.data.length === 0 ? (
        <EmptyState title="No locations yet" hint={isAdmin ? "Start by creating a country." : undefined} />
      ) : (
        <ul className="tree card" aria-label="Location tree">
          {buildTree(locations.data).map((node) => (
            <TreeNode key={node.id} node={node} depth={0} />
          ))}
        </ul>
      )}
    </>
  );
}

function TreeNode({ node, depth }: { node: LocationNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
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
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
        ) : (
          <span className="tree-toggle-placeholder" aria-hidden="true" />
        )}
        <span className="tree-name">{node.name}</span>
        <LevelBadge level={node.level} />
        <span className="muted">{countryName(node.country)}</span>
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LocationForm({ user, onCreated }: { user: UserResponse; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState<Country>(user.country ?? "DE");
  const [level, setLevel] = useState<LocationLevel>("country");
  const [parentId, setParentId] = useState("");
  const parents = useLocations(country);
  const create = useCreateLocation();
  const levelDepth = LOCATION_LEVELS.indexOf(level);
  const parentOptions = sortedByFullName(parents.data ?? []).filter(
    (location) => LOCATION_LEVELS.indexOf(location.level) < levelDepth,
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(
      { name, country, level, parent_id: parentId || undefined },
      {
        onSuccess: () => {
          setName("");
          setParentId("");
          onCreated();
        },
      },
    );
  };

  return (
    <section className="card" aria-labelledby="new-location-title">
      <h2 id="new-location-title" className="section-title">
        New location
      </h2>
      {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Name">
            <input className="input" value={name} minLength={2} maxLength={255} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Country">
            <select
              className="input"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value as Country);
                setParentId("");
              }}
            >
              <Options values={COUNTRIES} labels={COUNTRY_NAMES} />
            </select>
          </Field>
          <Field label="Level">
            <select
              className="input"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value as LocationLevel);
                setParentId("");
              }}
            >
              <Options values={LOCATION_LEVELS} labels={LEVEL_LABELS} />
            </select>
          </Field>
          <Field label="Parent location" hint="Only locations of a higher level in the same country are listed.">
            <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">No parent</option>
              {parentOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.full_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create location"}
        </button>
      </form>
    </section>
  );
}
