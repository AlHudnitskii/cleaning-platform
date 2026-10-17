import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import { COUNTRIES, type ChecklistTemplate, type Country } from "../../api/types";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { optionList } from "../../components/options";
import { Select } from "../../components/Select";
import { StepsEditor } from "../../components/StepsEditor";
import { countryNames } from "../../labels";
import { t } from "../../i18n/locale";
import { useCreateTemplate, useUpdateTemplate } from "./api";

export function TemplateForm({
  existing,
  defaultCountry,
  chooseCountry,
  onSaved,
  onCancel,
}: {
  existing?: ChecklistTemplate;
  defaultCountry: Country;
  chooseCountry: boolean;
  onSaved: (template: ChecklistTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [country, setCountry] = useState<Country>(existing?.country ?? defaultCountry);
  const [items, setItems] = useState<string[]>(existing?.items ?? []);
  const create = useCreateTemplate();
  const update = useUpdateTemplate(existing?.id ?? "");
  const save = existing ? update : create;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (existing) {
      update.mutate({ name, items }, { onSuccess: onSaved });
      return;
    }
    create.mutate({ name, items, country: chooseCountry ? country : undefined }, { onSuccess: onSaved });
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-body">
        {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        <Field label={t().templates.name}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={100}
            required
          />
        </Field>
        {chooseCountry && !existing && (
          <Field label={t().templates.country}>
            <Select value={country} options={optionList(COUNTRIES, countryNames())} onChange={setCountry} />
          </Field>
        )}
        <StepsEditor legend={t().templates.steps} items={items} onChange={setItems} />
        {items.length === 0 && <p className="field-hint">{t().templates.stepsHint}</p>}
      </div>
      <div className="drawer-footer">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          {t().common.cancel}
        </button>
        <button className="btn btn-primary" type="submit" disabled={save.isPending || items.length === 0}>
          {save.isPending ? t().common.saving : existing ? t().templates.save : t().templates.create}
        </button>
      </div>
    </form>
  );
}
