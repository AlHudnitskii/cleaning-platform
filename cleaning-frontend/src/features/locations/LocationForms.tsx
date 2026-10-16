import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import { COUNTRIES, LOCATION_LEVELS, type Country, type LocationLevel, type LocationResponse } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { optionList, withEmpty } from "../../components/options";
import { Select } from "../../components/Select";
import {
  sortedByFullName,
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useRenameLocation,
  type LocationNode,
} from "./api";
import { countryNames } from "../../labels";
import { t } from "../../i18n/locale";
import { type LocationDraft } from "./LocationTree";

export function LocationForm({
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

export function RenameForm({
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

export function DeleteLocationDialog({
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
