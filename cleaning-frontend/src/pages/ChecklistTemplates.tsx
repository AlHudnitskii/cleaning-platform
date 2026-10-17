import { useState } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, type ChecklistTemplate, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Drawer } from "../components/Drawer";
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import { FilterControl } from "../components/Field";
import { Icon } from "../components/Icon";
import { optionList, withEmpty } from "../components/options";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { showToast } from "../components/toast";
import { useChecklistTemplates, useDeleteTemplate } from "../features/checklists/api";
import { TemplateForm } from "../features/checklists/TemplateForm";
import { countryName, countryNames } from "../labels";
import { t } from "../i18n/locale";
import { useShortcut } from "../shortcuts";
import { readEnum, useUrlState } from "../urlState";

export function ChecklistTemplates() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update } = useUrlState();
  const country = isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined;
  const templates = useChecklistTemplates(country);
  const deleteTemplate = useDeleteTemplate();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChecklistTemplate | null>(null);
  const [removing, setRemoving] = useState<ChecklistTemplate | null>(null);
  useShortcut("n", () => setCreating(true));

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <>
      <PageHeader
        title={t().templates.title}
        description={t().templates.description}
        actions={
          <button type="button" className="btn btn-primary" aria-keyshortcuts="n" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} />
            {t().templates.newTemplate}
          </button>
        }
      />
      {(creating || editing) && (
        <Drawer title={editing ? t().templates.editTitle : t().templates.newTemplate} onClose={closeForm}>
          <TemplateForm
            existing={editing ?? undefined}
            defaultCountry={country ?? user.country ?? "DE"}
            chooseCountry={isAdmin}
            onCancel={closeForm}
            onSaved={(template) => {
              closeForm();
              showToast(editing ? t().templates.saved(template.name) : t().templates.created(template.name));
            }}
          />
        </Drawer>
      )}
      {removing && (
        <ConfirmDialog
          title={t().templates.deleteQuestion(removing.name)}
          confirmLabel={t().templates.delete}
          busy={deleteTemplate.isPending}
          error={deleteTemplate.isError ? errorMessage(deleteTemplate.error) : null}
          onCancel={() => {
            deleteTemplate.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            deleteTemplate.mutate(removing.id, {
              onSuccess: () => {
                showToast(t().templates.deleted(removing.name));
                setRemoving(null);
              },
            })
          }
        >
          <p>{t().templates.deleteHint}</p>
        </ConfirmDialog>
      )}

      {isAdmin && (
        <div className="toolbar toolbar-plain" role="group" aria-label={t().common.filters}>
          <FilterControl label={t().templates.country}>
            <Select
              variant="inline"
              value={country ?? ""}
              options={withEmpty(t().common.all, optionList(COUNTRIES, countryNames()))}
              onChange={(value) => update({ country: value })}
            />
          </FilterControl>
        </div>
      )}

      {templates.isPending ? (
        <ListSkeleton label={t().templates.loading} columns={2} rows={3} />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : templates.data.length === 0 ? (
        <EmptyState title={t().templates.none} hint={t().templates.noneHint} />
      ) : (
        <ul className="template-grid">
          {templates.data.map((template) => (
            <li key={template.id} className="card template-card">
              <div className="template-card-header">
                <div>
                  <h2 className="subsection-title">{template.name}</h2>
                  <p className="muted">
                    {t().templates.stepCount(template.items.length)}
                    {isAdmin && ` · ${countryName(template.country)}`}
                  </p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t().templates.editNamed(template.name)}
                    onClick={() => setEditing(template)}
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button-danger"
                    aria-label={t().templates.deleteNamed(template.name)}
                    onClick={() => setRemoving(template)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
              <ol className="template-steps">
                {template.items.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
