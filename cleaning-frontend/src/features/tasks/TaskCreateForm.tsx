import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import { COUNTRIES, TASK_PRIORITIES, type Country, type TaskPriority, type UserResponse } from "../../api/types";
import { Notice } from "../../components/Feedback";
import { Field, Options } from "../../components/Field";
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

export function TaskCreateForm({ user, onCreated }: { user: UserResponse; onCreated: () => void }) {
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
        onSuccess: () => {
          setForm(initialState(user));
          onCreated();
        },
      },
    );
  };

  return (
    <section className="card" aria-labelledby="new-task-title">
      <h2 id="new-task-title" className="section-title">
        New task
      </h2>
      {createTask.isError && <Notice tone="error">{errorMessage(createTask.error)}</Notice>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
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
            <select
              className="input"
              value={form.country}
              disabled={!canChooseCountry}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, country: e.target.value as Country, locationId: "", assigneeId: "" }))
              }
            >
              <Options values={COUNTRIES} labels={COUNTRY_NAMES} />
            </select>
          </Field>
          <Field label="Location">
            <select className="input" value={form.locationId} onChange={(e) => set("locationId", e.target.value)}>
              <option value="">No location</option>
              {sortedByFullName(locations.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select className="input" value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
              <option value="">Unassigned</option>
              {(assignees.data ?? []).map((cleaner) => (
                <option key={cleaner.id} value={cleaner.id}>
                  {cleaner.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
              <Options values={TASK_PRIORITIES} labels={PRIORITY_LABELS} />
            </select>
          </Field>
          <Field label="Repeats">
            <select className="input" value={form.rrule} onChange={(e) => set("rrule", e.target.value)}>
              <option value="">Does not repeat</option>
              {RRULE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid-wide">
            <Field label="Description">
              <textarea
                className="input"
                rows={2}
                maxLength={5000}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={createTask.isPending}>
          {createTask.isPending ? "Creating…" : "Create task"}
        </button>
      </form>
    </section>
  );
}
