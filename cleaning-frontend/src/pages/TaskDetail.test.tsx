import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { MANAGER, makeTask } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const TASK_ID = "44444444-4444-4444-8444-444444444444";

function detailHandlers(task = makeTask()) {
  return [
    http.get(`*/api/tasks/${TASK_ID}`, () => HttpResponse.json(task)),
    http.get(`*/api/tasks/${TASK_ID}/comments`, () => HttpResponse.json([])),
    http.get(`*/api/tasks/${TASK_ID}/history`, () => HttpResponse.json([])),
    http.get(`*/api/tasks/${TASK_ID}/photos`, () => HttpResponse.json([])),
  ];
}

describe("Task detail", () => {
  it("offers only the transitions the server allows", async () => {
    server.use(...detailHandlers(makeTask({ status: "on_review", allowed_statuses: ["completed", "in_progress"] })));
    renderApp(`/tasks/${TASK_ID}`, MANAGER);

    const group = await screen.findByRole("group", { name: "Change status of Clean lobby" });
    const buttons = Array.from(group.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(["Approve", "Return for rework"]);
  });

  it("sends the status change and shows the updated task", async () => {
    let sent: unknown = null;
    server.use(
      ...detailHandlers(),
      http.patch(`*/api/tasks/${TASK_ID}/status`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(makeTask({ status: "in_progress", allowed_statuses: ["on_review"] }));
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.click(await screen.findByRole("button", { name: "Start work" }));

    await waitFor(() => expect(sent).toEqual({ status: "in_progress" }));
    expect(await screen.findByRole("button", { name: "Send to review" })).toBeInTheDocument();
  });

  it("shows the server reason when a transition is rejected", async () => {
    server.use(
      ...detailHandlers(),
      http.patch(`*/api/tasks/${TASK_ID}/status`, () =>
        HttpResponse.json({ error: "Cannot change status from pending to in_progress" }, { status: 409 }),
      ),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.click(await screen.findByRole("button", { name: "Start work" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot change status from pending to in_progress");
  });

  it("shows not found for a task outside the user's scope", async () => {
    server.use(http.get(`*/api/tasks/${TASK_ID}`, () => HttpResponse.json({ error: "Task not found" }, { status: 404 })));
    renderApp(`/tasks/${TASK_ID}`, MANAGER);

    expect(await screen.findByText("This page does not exist")).toBeInTheDocument();
  });

  it("links a scheduled task to the first task of its series", async () => {
    const parentId = "55555555-5555-4555-8555-555555555555";
    server.use(...detailHandlers(makeTask({ parent_task_id: parentId })));
    renderApp(`/tasks/${TASK_ID}`, MANAGER);

    expect(await screen.findByRole("link", { name: "Open the first task" })).toHaveAttribute(
      "href",
      `/tasks/${parentId}`,
    );
  });

  it("does not call the API for a malformed task id", async () => {
    renderApp("/tasks/not-a-uuid", MANAGER);

    expect(await screen.findByText("This task does not exist")).toBeInTheDocument();
  });

  it("lets a manager review a completed task", async () => {
    let review: unknown = null;
    server.use(
      ...detailHandlers(makeTask({ status: "completed", allowed_statuses: ["in_progress"] })),
      http.post(`*/api/tasks/${TASK_ID}/quality`, async ({ request }) => {
        review = await request.json();
        return HttpResponse.json(makeTask({ status: "completed", quality_score: 4 }));
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.click(await screen.findByRole("radio", { name: "4 stars" }));
    await user.type(screen.getByLabelText("Comment (optional)"), "Good");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    await waitFor(() => expect(review).toEqual({ score: 4, comment: "Good" }));
    expect(await screen.findByText("Review saved.")).toBeInTheDocument();
  });
});
