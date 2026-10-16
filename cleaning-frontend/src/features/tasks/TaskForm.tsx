import { useId, useState, type SubmitEvent } from "react";

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
import { Icon } from "../../components/Icon";
import { optionList, withEmpty } from "../../components/options";
import { Select } from "../../components/Select";
import { today } from "../../dates";
import { COUNTRY_NAMES, PRIORITY_LABELS, RRULE_PRESETS } from "../../labels";
import { sortedByFullName, useLocations } from "../locations/api";
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
  const canChooseCountry = !task && user.role === "admin";
  const changes = task ? changesFrom(initial, form) : null;
  const unchanged = changes !== null && Object.keys(changes).length === 0;

  const assigneeOptions = (assignees.data ?? []).map((cleaner) => ({ value: cleaner.id, label: cleaner.email }));
  if (task?.assigned_to && task.assigned_to_email && !assigneeOptions.some((option) => option.value === task.assigned_to)) {
    assigneeOptions.unshift({ value: task.assigned_to, label: `${task.assigned_to_email} (inactive)` });
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
        <Field label="Title">
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
          label="Country"
          hint={
            task
              ? "The country of an existing task cannot be changed."
              : canChooseCountry
                ? undefined
                : "Managers create tasks in their own country."
          }
        >
          <Select
            value={form.country}
            disabled={!canChooseCountry}
            options={optionList(COUNTRIES, COUNTRY_NAMES)}
            onChange={(country) => setForm((prev) => ({ ...prev, country, locationId: "", assigneeId: "" }))}
          />
        </Field>
        <Field label="Location">
          <Select
            value={form.locationId}
            options={withEmpty(
              "No location",
              sortedByFullName(locations.data ?? []).map((location) => ({ value: location.id, label: location.full_name })),
            )}
            onChange={(locationId) => set("locationId", locationId)}
          />
        </Field>
        <Field label="Assignee">
          <Select
            value={form.assigneeId}
            options={withEmpty("Unassigned", assigneeOptions)}
            onChange={(assigneeId) => set("assigneeId", assigneeId)}
          />
        </Field>
        <div className="form-row">
          <Field label="Priority">
            <Select
              value={form.priority}
              options={optionList(TASK_PRIORITIES, PRIORITY_LABELS)}
              onChange={(priority) => set("priority", priority)}
            />
          </Field>
          <Field label="Due date">
            <DatePicker
              value={form.dueDate}
              placeholder="No due date"
              min={task ? undefined : today()}
              onChange={(dueDate) => set("dueDate", dueDate)}
            />
          </Field>
        </div>
        <Field label="Repeats">
          <Select
            value={form.rrule}
            options={withEmpty<string>("Does not repeat", [...RRULE_PRESETS])}
            onChange={(rrule) => set("rrule", rrule)}
          />
        </Field>
        {!task && (
          <ChecklistEditor items={form.checklist} onChange={(checklist) => set("checklist", checklist)} />
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
            Require a photo of the result
          </label>
          <p className="field-hint" id={photoHintId}>
            The cleaner cannot send the task for review without a photo.
          </p>
        </div>
        <Field label="Description">
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
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving.isPending || unchanged}>
          {saving.isPending ? "Saving…" : task ? "Save changes" : "Create task"}
        </button>
      </div>
    </form>
  );
}

const MAX_ITEMS = 50;

function ChecklistEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const value = draft.trim();
    if (!value || items.length >= MAX_ITEMS) return;
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <fieldset className="checklist-editor">
      <legend className="field-label">Checklist</legend>
      {items.length > 0 && (
        <ol className="checklist-editor-items">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <span>{item}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove “${item}”`}
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="checklist-add">
        <input
          className="input"
          value={draft}
          maxLength={255}
          placeholder="Add a step and press Enter"
          aria-label="New checklist step"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
        />
        <button type="button" className="btn btn-secondary" disabled={!draft.trim()} onClick={addDraft}>
          Add
        </button>
      </div>
    </fieldset>
  );
}
