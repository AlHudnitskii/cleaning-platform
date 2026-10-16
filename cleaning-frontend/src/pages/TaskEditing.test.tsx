import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { daysAgo } from "../dates";
import { CLEANER, MANAGER, makePage, makeTask } from "../test/fixtures";
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

describe("Task editing", () => {
  it("sends only the fields that changed and shows the saved task", async () => {
    let sent: unknown = null;
    const task = makeTask({ description: "Front hall" });
    server.use(
      ...detailHandlers(task),
      http.patch(`*/api/tasks/${TASK_ID}`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...task, title: "Clean the lobby", priority: "high" });
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const panel = screen.getByRole("dialog", { name: "Edit task" });
    expect(within(panel).getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(within(panel).getByRole("combobox", { name: "Country" })).toBeDisabled();

    const title = within(panel).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Clean the lobby");
    await user.click(within(panel).getByRole("combobox", { name: "Priority" }));
    await user.click(await screen.findByRole("option", { name: "High" }));
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(sent).toEqual({ title: "Clean the lobby", priority: "high" }));
    expect(await screen.findByText("“Clean the lobby” saved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes the task after confirmation and returns to the list", async () => {
    let deleted = false;
    server.use(
      ...detailHandlers(),
      http.delete(`*/api/tasks/${TASK_ID}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.click(await screen.findByRole("button", { name: "Delete Clean lobby" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Clean lobby”?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Delete task" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/tasks$/));
    expect(deleted).toBe(true);
    expect(await screen.findByText("“Clean lobby” deleted")).toBeInTheDocument();
  });

  it("keeps the task when the deletion is cancelled with Escape", async () => {
    let deleted = false;
    server.use(
      ...detailHandlers(),
      http.delete(`*/api/tasks/${TASK_ID}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp(`/tasks/${TASK_ID}`, MANAGER);

    await user.click(await screen.findByRole("button", { name: "Delete Clean lobby" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleted).toBe(false);
  });

  it("does not offer editing or deletion to cleaners", async () => {
    server.use(...detailHandlers(makeTask({ assigned_to: CLEANER.id })));
    renderApp(`/tasks/${TASK_ID}`, CLEANER);

    expect(await screen.findByRole("heading", { name: "Clean lobby" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("shows how long an open task is overdue", async () => {
    server.use(...detailHandlers(makeTask({ due_date: daysAgo(2) })));
    renderApp(`/tasks/${TASK_ID}`, MANAGER);

    expect((await screen.findAllByText("Overdue by 2 days")).length).toBeGreaterThan(0);
  });

  it("filters the list to overdue tasks", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("limit") !== "1") requests.push(params);
        return HttpResponse.json(makePage([makeTask()]));
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("checkbox", { name: "Overdue only" }));

    await waitFor(() => expect(requests.at(-1)?.get("overdue")).toBe("true"));
    expect(screen.getByRole("button", { name: "Remove Due filter" })).toBeInTheDocument();
  });
});
