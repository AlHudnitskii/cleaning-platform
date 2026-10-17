import { useId, useState, type ReactNode, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import {
  COUNTRIES,
  TASK_PRIORITIES,
  type Country,
  type TaskPriority,
  type TaskResponse,
  type TaskUpdate,
  type UserResponse,
} from "../../api/types";
import { DatePicker } from "../../components/DatePicker";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { optionList, withEmpty } from "../../components/options";
import { Select } from "../../components/Select";
import { MAX_STEPS, StepsEditor } from "../../components/StepsEditor";
import { showToast } from "../../components/toast";
import { today } from "../../dates";
import { countryNames, personLabel, rruleOptions } from "../../labels";
import { t } from "../../i18n/locale";
import { sortedByFullName, useLocations } from "../locations/api";
import { useChecklistTemplates } from "../checklists/api";
import { useAssignees } from "../users/api";
import { useCreateTask, useUpdateTask } from "./api";

interface FormState {
  title: string;
  country: Country;
  description: string;
  locationId: string;
  assigneeId: string;
  priority: TaskPriority;
  rrule: string;
  dueDate: string;
  photoRequired: boolean;
  checklist: string[];
}

function initialState(user: UserResponse, task?: TaskResponse): FormState {
  if (task) {
    return {
      title: task.title,
      country: task.country,
      description: task.description ?? "",
      locationId: task.location_id ?? "",
      assigneeId: task.assigned_to ?? "",
      priority: task.priority,
      rrule: task.rrule ?? "",
      dueDate: task.due_date ?? "",
      photoRequired: task.photo_required,
      checklist: [],
    };
  }
  return {
    title: "",
    country: user.country ?? "DE",
    description: "",
    locationId: "",
    assigneeId: "",
    priority: "normal",
    rrule: "",
    dueDate: "",
    photoRequired: false,
    checklist: [],
  };
}

function changesFrom(initial: FormState, form: FormState): TaskUpdate {
  const changes: TaskUpdate = {};
  if (form.title.trim() !== initial.title) changes.title = form.title.trim();
  if (form.description.trim() !== initial.description) changes.description = form.description.trim() || null;
  if (form.locationId !== initial.locationId) changes.location_id = form.locationId || null;
  if (form.assigneeId !== initial.assigneeId) changes.assigned_to = form.assigneeId || null;
  if (form.priority !== initial.priority) changes.priority = form.priority;
  if (form.rrule !== initial.rrule) changes.rrule = form.rrule || null;
  if (form.dueDate !== initial.dueDate) changes.due_date = form.dueDate || null;
  if (form.photoRequired !== initial.photoRequired) changes.photo_required = form.photoRequired;
  return changes;
}

export function TaskForm({
  user,
  task,
  onSaved,
  onCancel,
}: {
  user: UserResponse;
  task?: TaskResponse;
  onSaved: (task: TaskResponse) => void;
  onCancel: () => void;
}) {
  const [initial] = useState<FormState>(() => initialState(user, task));
  const photoHintId = useId();
  const [form, setForm] = useState<FormState>(initial);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(task?.id ?? "");
  const saving = task ? updateTask : createTask;
  const locations = useLocations(form.country);
  const assignees = useAssignees(form.country);
  const templates = useChecklistTemplates(form.country, !task);
  const canChooseCountry = !task && user.role === "admin";
  const changes = task ? changesFrom(initial, form) : null;
  const unchanged = changes !== null && Object.keys(changes).length === 0;

  const assigneeOptions = (assignees.data ?? []).map((cleaner) => ({
    value: cleaner.id,
    label: personLabel(cleaner.email, cleaner.full_name),
  }));
  if (task?.assigned_to && task.assigned_to_email && !assigneeOptions.some((option) => option.value === task.assigned_to)) {
    assigneeOptions.unshift({ value: task.assigned_to, label: t().taskForm.inactive(task.assigned_to_email) });
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (changes) {
      if (!unchanged) updateTask.mutate(changes, { onSuccess: onSaved });
      return;
    }
    createTask.mutate(
      {
        title: form.title,
        country: form.country,
        priority: form.priority,
        description: form.description || undefined,
        location_id: form.locationId || undefined,
        assigned_to: form.assigneeId || undefined,
        rrule: form.rrule || undefined,
        due_date: form.dueDate || undefined,
        photo_required: form.photoRequired || undefined,
        checklist: form.checklist.length > 0 ? form.checklist : undefined,
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-body">
        {saving.isError && <Notice tone="error">{errorMessage(saving.error)}</Notice>}
        <Field label={t().taskForm.title}>
          <input
            className="input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            minLength={3}
            maxLength={255}
            required
          />
        </Field>
        <Field
          label={t().taskForm.country}
          hint={
            task
              ? t().taskForm.countryLocked
              : canChooseCountry
                ? undefined
                : t().taskForm.countryOwn
          }
        >
          <Select
            value={form.country}
            disabled={!canChooseCountry}
            options={optionList(COUNTRIES, countryNames())}
            onChange={(country) => setForm((prev) => ({ ...prev, country, locationId: "", assigneeId: "" }))}
          />
        </Field>
        <Field
          label={t().taskForm.location}
          hint={listHint(locations, t().taskForm.noLocations(countryNames()[form.country]))}
        >
          <Select
            value={form.locationId}
            options={withEmpty(
              t().taskForm.noLocation,
              sortedByFullName(locations.data ?? []).map((location) => ({ value: location.id, label: location.full_name })),
            )}
            onChange={(locationId) => set("locationId", locationId)}
          />
        </Field>
        <Field
          label={t().taskForm.assignee}
          hint={listHint(assignees, t().taskForm.noCleaners(countryNames()[form.country]))}
        >
          <Select
            value={form.assigneeId}
            options={withEmpty(t().common.unassigned, assigneeOptions)}
            onChange={(assigneeId) => set("assigneeId", assigneeId)}
          />
        </Field>
        <div className="form-row">
          <Field label={t().taskForm.priority}>
            <Select
              value={form.priority}
              options={optionList(TASK_PRIORITIES, t().priority)}
              onChange={(priority) => set("priority", priority)}
            />
          </Field>
          <Field label={t().taskForm.dueDate}>
            <DatePicker
              value={form.dueDate}
              placeholder={t().taskForm.noDueDate}
              min={task ? undefined : today()}
              onChange={(dueDate) => set("dueDate", dueDate)}
            />
          </Field>
        </div>
        <Field label={t().taskForm.repeats}>
          <Select
            value={form.rrule}
            options={withEmpty<string>(t().taskForm.noRepeat, rruleOptions())}
            onChange={(rrule) => set("rrule", rrule)}
          />
        </Field>
        {!task && (
          <>
            <Field
              label={t().templates.apply}
              hint={listHint(templates, t().templates.noTemplates)}
            >
              <Select
                value=""
                disabled={!templates.data?.length}
                options={withEmpty(
                  t().templates.choose,
                  (templates.data ?? []).map((template) => ({ value: template.id, label: template.name })),
                )}
                onChange={(templateId) => {
                  const template = templates.data?.find((candidate) => candidate.id === templateId);
                  if (!template) return;
                  set("checklist", withSteps(form.checklist, template.items));
                  showToast(t().templates.applied(template.name));
                }}
              />
            </Field>
            <StepsEditor
              legend={t().taskForm.checklist}
              items={form.checklist}
              onChange={(checklist) => set("checklist", checklist)}
            />
          </>
        )}
        <div className="check-field">
          <label className="check-field-label">
            <input
              type="checkbox"
              className="checkbox"
              checked={form.photoRequired}
              aria-describedby={photoHintId}
              onChange={(e) => set("photoRequired", e.target.checked)}
            />
            {t().taskForm.requirePhoto}
          </label>
          <p className="field-hint" id={photoHintId}>
            {t().taskForm.requirePhotoHint}
          </p>
        </div>
        <Field label={t().taskForm.description}>
          <textarea
            className="input"
            rows={3}
            maxLength={5000}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </div>
      <div className="drawer-footer">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          {t().common.cancel}
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving.isPending || unchanged}>
          {saving.isPending ? t().common.saving : task ? t().taskForm.saveChanges : t().taskForm.create}
        </button>
      </div>
    </form>
  );
}

function withSteps(current: string[], added: string[]): string[] {
  const merged = [...current];
  for (const step of added) {
    if (merged.length >= MAX_STEPS) break;
    if (!merged.includes(step)) merged.push(step);
  }
  return merged;
}

interface ListQuery {
  data?: readonly unknown[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

function listHint(query: ListQuery, emptyText: string): ReactNode {
  if (query.isPending) return t().common.loading;
  if (query.isError) {
    return (
      <>
        {t().taskForm.listFailed(errorMessage(query.error))}{" "}
        <button type="button" className="link-button" onClick={() => void query.refetch()}>
          {t().common.tryAgain}
        </button>
      </>
    );
  }
  return query.data?.length === 0 ? emptyText : undefined;
}
