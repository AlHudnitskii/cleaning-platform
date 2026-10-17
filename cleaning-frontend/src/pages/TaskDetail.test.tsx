import { screen, waitFor, within } from "@testing-library/react";
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

  it("shows how long the cleaner worked on the task", async () => {
    server.use(
      ...detailHandlers(makeTask({ status: "completed", started_at: "2026-10-01T10:00:00+00:00", work_seconds: 2700 })),
    );
    renderApp(`/tasks/${TASK_ID}`, MANAGER);

    const properties = await screen.findByRole("complementary", { name: "Task properties" });
    expect(within(properties).getByText("45 min")).toBeInTheDocument();
    expect(within(properties).getByText("Started")).toBeInTheDocument();
  });

  it("shows before and after photos side by side and uploads into the chosen column", async () => {
    let uploaded = false;
    // Node's fetch cannot serialise jsdom's FormData, so the test reads the fields the client appends.
    const append = vi.spyOn(FormData.prototype, "append");
    const photo = (kind: "before" | "after", id: string) => ({
      id,
      task_id: TASK_ID,
      url: `https://blob.example/${id}.jpg`,
      filename: `${id}.jpg`,
      kind,
      uploaded_at: "2026-10-01T10:00:00+00:00",
    });
    server.use(
      http.get(`*/api/tasks/${TASK_ID}/photos`, () => HttpResponse.json([photo("before", "dusty")])),
      ...detailHandlers(),
      http.post(`*/api/tasks/${TASK_ID}/photos`, () => {
        uploaded = true;
        return HttpResponse.json(photo("after", "clean"), { status: 201 });
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    const column = (heading: HTMLElement) => heading.closest("section") as HTMLElement;
    const before = column(await screen.findByRole("heading", { name: "Before · 1" }));
    const after = column(screen.getByRole("heading", { name: "After · 0" }));
    expect(within(before).getByRole("img", { name: "Before: dusty.jpg" })).toBeInTheDocument();
    expect(within(after).getByText("No photos of the result yet.")).toBeInTheDocument();

    await user.upload(within(after).getByLabelText("Add a result photo"), new File(["x"], "clean.jpg", { type: "image/jpeg" }));

    await waitFor(() => expect(uploaded).toBe(true));
    expect(append).toHaveBeenCalledWith("kind", "after");
    append.mockRestore();
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
