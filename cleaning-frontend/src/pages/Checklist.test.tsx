import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import type { ChecklistItem } from "../api/types";
import { CLEANER, MANAGER, makePage, makeTask, makeTemplate } from "../test/fixtures";
import { chooseOption, renderApp } from "../test/render";
import { server } from "../test/server";

const TASK_ID = "44444444-4444-4444-8444-444444444444";

function item(overrides: Partial<ChecklistItem>): ChecklistItem {
  return {
    id: "c1111111-1111-4111-8111-111111111111",
    task_id: TASK_ID,
    position: 0,
    text: "Wipe desks",
    done: false,
    done_by: null,
    done_at: null,
    ...overrides,
  };
}

function detailHandlers(task = makeTask(), items: ChecklistItem[] = []) {
  return [
    http.get(`*/api/tasks/${TASK_ID}`, () => HttpResponse.json(task)),
    http.get(`*/api/tasks/${TASK_ID}/checklist`, () => HttpResponse.json(items)),
    http.get(`*/api/tasks/${TASK_ID}/comments`, () => HttpResponse.json([])),
    http.get(`*/api/tasks/${TASK_ID}/history`, () => HttpResponse.json([])),
    http.get(`*/api/tasks/${TASK_ID}/photos`, () => HttpResponse.json([])),
  ];
}

describe("Checklist", () => {
  it("lets the assigned cleaner tick a step", async () => {
    let sent: unknown = null;
    const steps = [item({}), item({ id: "c2222222-2222-4222-8222-222222222222", position: 1, text: "Empty bins", done: true })];
    server.use(
      ...detailHandlers(makeTask({ status: "in_progress", assigned_to: CLEANER.id }), steps),
      http.patch(`*/api/tasks/${TASK_ID}/checklist/:itemId`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...steps[0], done: true });
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, CLEANER);

    expect(await screen.findByText("1 of 2 done")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New checklist item" })).not.toBeInTheDocument();
    const step = screen.getByRole("checkbox", { name: "Wipe desks" });
    await user.click(step);

    expect(step).toBeChecked();
    await waitFor(() => expect(sent).toEqual({ done: true }));
  });

  it("reverts a tick the server rejects", async () => {
    server.use(
      ...detailHandlers(makeTask({ status: "in_progress" }), [item({})]),
      http.patch(`*/api/tasks/${TASK_ID}/checklist/:itemId`, () =>
        HttpResponse.json({ error: "You cannot tick items of this task" }, { status: 403 }),
      ),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    const step = await screen.findByRole("checkbox", { name: "Wipe desks" });
    await user.click(step);

    expect(await screen.findByText("You cannot tick items of this task")).toBeInTheDocument();
    await waitFor(() => expect(step).not.toBeChecked());
  });

  it("lets managers add a step", async () => {
    let added: unknown = null;
    server.use(
      ...detailHandlers(makeTask({ status: "in_progress" })),
      http.post(`*/api/tasks/${TASK_ID}/checklist`, async ({ request }) => {
        added = await request.json();
        return HttpResponse.json(item({ text: "Restock soap" }), { status: 201 });
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.type(await screen.findByRole("textbox", { name: "New checklist item" }), "Restock soap{Enter}");

    await waitFor(() => expect(added).toEqual({ text: "Restock soap" }));
  });

  it("blocks sending for review and explains what is missing", async () => {
    server.use(
      ...detailHandlers(
        makeTask({
          status: "in_progress",
          allowed_statuses: ["on_review", "on_hold"],
          photo_required: true,
          checklist_done: 1,
          checklist_total: 3,
          review_blockers: ["photo", "checklist"],
        }),
      ),
    );
    renderApp(`/tasks/${TASK_ID}`, CLEANER);

    const button = await screen.findByRole("button", { name: "Send to review" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(
        "To send for review, upload a photo of the result and finish the checklist (1 of 3 done).",
      ),
    ).toBeInTheDocument();
  });

  it("hides the quick review action for tasks that are not ready", async () => {
    server.use(
      http.get("*/api/tasks", () =>
        HttpResponse.json(
          makePage([
            makeTask({
              status: "in_progress",
              allowed_statuses: ["on_review"],
              checklist_done: 0,
              checklist_total: 2,
              review_blockers: ["checklist"],
            }),
          ]),
        ),
      ),
    );
    renderApp("/tasks", MANAGER);

    const row = await screen.findByRole("row", { name: /Clean lobby/ });
    expect(within(row).getByText(/Checklist 0\/2/)).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Send to review/ })).not.toBeInTheDocument();
  });

  it("creates a task with checklist steps and a photo requirement", async () => {
    let created: unknown = null;
    server.use(
      http.post("*/api/tasks", async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(makeTask(), { status: 201 });
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.click(screen.getByRole("button", { name: "Create task" }));
    const panel = screen.getByRole("dialog", { name: "New task" });
    await user.type(within(panel).getByLabelText("Title"), "Clean kitchen");
    await chooseOption(user, "Priority", "High", panel);
    await user.type(within(panel).getByRole("textbox", { name: "New checklist step" }), "Wipe counters{Enter}");
    await user.type(within(panel).getByRole("textbox", { name: "New checklist step" }), "Empty bins{Enter}");
    await user.click(within(panel).getByRole("checkbox", { name: "Require a photo of the result" }));
    await user.click(within(panel).getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(created).toEqual({
        title: "Clean kitchen",
        country: "DE",
        priority: "high",
        photo_required: true,
        checklist: ["Wipe counters", "Empty bins"],
      }),
    );
  });

  it("adds the steps of a template to the new task without repeating a step", async () => {
    let created: { checklist?: string[] } | null = null;
    server.use(
      http.get("*/api/checklist-templates", () => HttpResponse.json([makeTemplate()])),
      http.post("*/api/tasks", async ({ request }) => {
        created = (await request.json()) as { checklist?: string[] };
        return HttpResponse.json(makeTask(), { status: 201 });
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.click(screen.getByRole("button", { name: "Create task" }));
    const panel = screen.getByRole("dialog", { name: "New task" });
    await user.type(within(panel).getByLabelText("Title"), "Clean bathroom");
    await user.type(within(panel).getByRole("textbox", { name: "New checklist step" }), "Mop the floor{Enter}");
    await waitFor(() => expect(within(panel).getByLabelText("Add steps from a template")).toBeEnabled());
    await chooseOption(user, "Add steps from a template", "Bathroom", panel);

    expect(await screen.findByText("Steps from “Bathroom” added")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(created?.checklist).toEqual(["Mop the floor", "Clean the sink"]));
  });

  it("keeps the task page usable when the checklist cannot be loaded", async () => {
    server.use(
      http.get(`*/api/tasks/${TASK_ID}/checklist`, () => HttpResponse.json({ error: "Not found" }, { status: 404 })),
      ...detailHandlers(),
    );
    renderApp(`/tasks/${TASK_ID}`, MANAGER);

    expect(await screen.findByText(/Could not load the checklist/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clean lobby" })).toBeInTheDocument();
    expect(screen.queryByText("This page does not exist")).not.toBeInTheDocument();
  });
});
