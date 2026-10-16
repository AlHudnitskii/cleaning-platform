import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import {
  COUNTRIES,
  TASK_PRIORITIES,
  type Country,
  type TaskPriority,
  type TaskResponse,
  type UserResponse,
} from "../../api/types";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { optionList, withEmpty } from "../../components/options";
import { Select } from "../../components/Select";
import { COUNTRY_NAMES, PRIORITY_LABELS, RRULE_PRESETS } from "../../labels";
import { sortedByFullName, useLocations } from "../locations/api";
import { useAssignees } from "../users/api";
import { useCreateTask } from "./api";

interface FormState {
  title: string;
  country: Country;
  description: string;
  locationId: string;
  assigneeId: string;
  priority: TaskPriority;
  rrule: string;
}

function initialState(user: UserResponse): FormState {
  return {
    title: "",
    country: user.country ?? "DE",
    description: "",
    locationId: "",
    assigneeId: "",
    priority: "normal",
    rrule: "",
  };
}

export function TaskCreateForm({
  user,
  onCreated,
  onCancel,
}: {
  user: UserResponse;
  onCreated: (task: TaskResponse) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(user));
  const createTask = useCreateTask();
  const locations = useLocations(form.country);
  const assignees = useAssignees(form.country);
  const canChooseCountry = user.role === "admin";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    createTask.mutate(
      {
        title: form.title,
        country: form.country,
        priority: form.priority,
        description: form.description || undefined,
        location_id: form.locationId || undefined,
        assigned_to: form.assigneeId || undefined,
        rrule: form.rrule || undefined,
      },
      {
        onSuccess: (task) => {
          setForm(initialState(user));
          onCreated(task);
        },
      },
    );
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-body">
        {createTask.isError && <Notice tone="error">{errorMessage(createTask.error)}</Notice>}
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
        <Field label="Country" hint={canChooseCountry ? undefined : "Managers create tasks in their own country."}>
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
            options={withEmpty(
              "Unassigned",
              (assignees.data ?? []).map((cleaner) => ({ value: cleaner.id, label: cleaner.email })),
            )}
            onChange={(assigneeId) => set("assigneeId", assigneeId)}
          />
        </Field>
        <Field label="Priority">
          <Select
            value={form.priority}
            options={optionList(TASK_PRIORITIES, PRIORITY_LABELS)}
            onChange={(priority) => set("priority", priority)}
          />
        </Field>
        <Field label="Repeats">
          <Select
            value={form.rrule}
            options={withEmpty<string>("Does not repeat", [...RRULE_PRESETS])}
            onChange={(rrule) => set("rrule", rrule)}
          />
        </Field>
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
        <button className="btn btn-primary" type="submit" disabled={createTask.isPending}>
          {createTask.isPending ? "Creating…" : "Create task"}
        </button>
      </div>
    </form>
  );
}
