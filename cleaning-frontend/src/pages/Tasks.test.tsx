import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, MANAGER, makePage, makeTask } from "../test/fixtures";
import { chooseOption, renderApp } from "../test/render";
import { server } from "../test/server";

function isCounter(request: Request): boolean {
  return new URL(request.url).searchParams.get("limit") === "1";
}

describe("Tasks page", () => {
  it("lists tasks with human-readable assignee and location", async () => {
    server.use(
      http.get("*/api/tasks", () =>
        HttpResponse.json(makePage([makeTask({ location_name: "Room 101", assigned_to_email: "cleaner1@cleaning.com" })])),
      ),
    );
    renderApp("/tasks", MANAGER);

    const row = await screen.findByRole("row", { name: /Clean lobby/ });
    expect(within(row).getByRole("link", { name: "Clean lobby" })).toHaveAttribute(
      "href",
      "/tasks/44444444-4444-4444-8444-444444444444",
    );
    expect(within(row).getByText("cleaner1@cleaning.com")).toBeInTheDocument();
    expect(within(row).getByText("Room 101")).toBeInTheDocument();
    expect(within(row).queryByText(/33333333/)).not.toBeInTheDocument();
  });

  it("sends filters to the server, stores them in the URL and resets the page", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        if (isCounter(request)) return HttpResponse.json(makePage([]));
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(makePage([makeTask()], { page: 2, pages: 3, total: 30 }));
      }),
    );
    const { user } = renderApp("/tasks?page=2", MANAGER);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await chooseOption(user, "Status", "On review");

    await waitFor(() => expect(requests.at(-1)?.get("status")).toBe("on_review"));
    expect(requests.at(-1)?.get("page")).toBe("1");
    expect(requests[0]?.get("page")).toBe("2");
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?status=on_review");
  });

  it("requests the next page and disables going back from the first one", async () => {
    const pages: (string | null)[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        if (isCounter(request)) return HttpResponse.json(makePage([]));
        const page = new URL(request.url).searchParams.get("page");
        pages.push(page);
        return HttpResponse.json(makePage([makeTask()], { page: Number(page), limit: 25, pages: 3, total: 60 }));
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByRole("table");

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(pages.at(-1)).toBe("2"));
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?page=2");
  });

  it("changes the page size and returns to the first page", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        if (isCounter(request)) return HttpResponse.json(makePage([]));
        const params = new URL(request.url).searchParams;
        requests.push(params);
        return HttpResponse.json(
          makePage([makeTask()], { page: Number(params.get("page")), limit: Number(params.get("limit")), pages: 3, total: 60 }),
        );
      }),
    );
    const { user } = renderApp("/tasks?page=2", MANAGER);
    await screen.findByRole("table");
    expect(requests[0]?.get("limit")).toBe("25");

    await user.click(screen.getByRole("button", { name: "50" }));

    await waitFor(() => expect(requests.at(-1)?.get("limit")).toBe("50"));
    expect(requests.at(-1)?.get("page")).toBe("1");
    expect(await screen.findByRole("button", { name: "50" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the country filter only to administrators", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([makeTask()]))));

    const manager = renderApp("/tasks", MANAGER);
    await screen.findByRole("table");
    await manager.user.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    manager.unmount();

    const admin = renderApp("/tasks", ADMIN);
    await screen.findByRole("table");
    await admin.user.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByLabelText("Country")).toBeInTheDocument();
  });

  it("sorts by a column on header click and reverses on the second click", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        if (isCounter(request)) return HttpResponse.json(makePage([]));
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(makePage([makeTask()], { page: 1, pages: 3, total: 60 }));
      }),
    );
    const { user } = renderApp("/tasks?page=2", MANAGER);
    await screen.findByRole("table");
    const created = screen.getByRole("columnheader", { name: /Created/ });
    expect(created).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: "Task" }));
    await waitFor(() => expect(requests.at(-1)?.get("sort")).toBe("title"));
    expect(requests.at(-1)?.get("order")).toBeNull();
    expect(requests.at(-1)?.get("page")).toBe("1");
    expect(screen.getByRole("columnheader", { name: /Task/ })).toHaveAttribute("aria-sort", "ascending");
    expect(created).not.toHaveAttribute("aria-sort");

    await user.click(screen.getByRole("button", { name: "Task" }));
    await waitFor(() => expect(requests.at(-1)?.get("order")).toBe("desc"));
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?sort=title&order=desc");

    await user.click(screen.getByRole("button", { name: "Created" }));
    await waitFor(() => expect(requests.at(-1)?.get("sort")).toBeNull());
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/tasks$/);
  });

  it("moves a task to its next status from the row", async () => {
    let sent: unknown = null;
    const reviewTask = makeTask({
      id: "66666666-6666-4666-8666-666666666666",
      title: "Mop hall",
      status: "on_review",
      allowed_statuses: ["completed", "in_progress"],
    });
    const closedTask = makeTask({ status: "completed", allowed_statuses: [] });
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([reviewTask, closedTask]))),
      http.patch(`*/api/tasks/${reviewTask.id}/status`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...reviewTask, status: "completed", allowed_statuses: [] });
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);

    const row = await screen.findByRole("row", { name: /Mop hall/ });
    expect(within(screen.getByRole("row", { name: /Clean lobby/ })).queryByRole("button")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Approve: Mop hall" }));

    await waitFor(() => expect(sent).toEqual({ status: "completed" }));
    expect(await screen.findByText("“Mop hall” moved to Completed")).toBeInTheDocument();
  });

  it("changes the status of selected tasks and skips the ones that cannot move", async () => {
    const patched: string[] = [];
    const first = makeTask({ id: "a1111111-1111-4111-8111-111111111111", title: "Mop hall", allowed_statuses: ["in_progress"] });
    const second = makeTask({ id: "a2222222-2222-4222-8222-222222222222", title: "Dust desks", allowed_statuses: ["in_progress"] });
    const locked = makeTask({ id: "a3333333-3333-4333-8333-333333333333", title: "Wash floor", status: "completed", allowed_statuses: [] });
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([first, second, locked]))),
      http.patch("*/api/tasks/:id/status", ({ params }) => {
        patched.push(String(params.id));
        return HttpResponse.json(makeTask({ id: String(params.id), status: "in_progress" }));
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByRole("table");

    await user.click(screen.getByRole("checkbox", { name: "Select all tasks on this page" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("3 selected")).toBeInTheDocument();

    await user.click(within(bar).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "In progress (2 of 3)" }));

    expect(await screen.findByText("2 moved to In progress · 1 skipped")).toBeInTheDocument();
    expect(patched.sort()).toEqual([first.id, second.id]);
    expect(screen.queryByRole("region", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("marks the header checkbox as partially selected", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([makeTask(), makeTask({ id: "b1111111-1111-4111-8111-111111111111", title: "Other" })]))));
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByRole("table");

    await user.click(screen.getByRole("checkbox", { name: "Select Clean lobby" }));

    expect(screen.getByRole("checkbox", { name: "Select all tasks on this page" })).toHaveProperty("indeterminate", true);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("shows a designed empty state", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([]))));
    renderApp("/tasks", MANAGER);

    expect(await screen.findByText("No tasks yet")).toBeInTheDocument();
  });

  it("shows an error with retry instead of an empty list", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/tasks", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: "Internal server error" }, { status: 500 })
          : HttpResponse.json(makePage([makeTask()]));
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);

    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("explains a failed cleaner list and loads it again on request", async () => {
    let failing = true;
    server.use(
      http.get("*/api/users/assignees", () =>
        failing
          ? HttpResponse.json({ error: "boom" }, { status: 500 })
          : HttpResponse.json([{ id: "55555555-5555-4555-8555-555555555555", email: "cleaner2@cleaning.com", country: "DE" }]),
      ),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    const panel = screen.getByRole("dialog", { name: "New task" });

    expect(
      await within(panel).findByText("Could not load the list: The server failed to process the request. Try again later."),
    ).toBeInTheDocument();
    failing = false;
    await user.click(within(panel).getByRole("button", { name: "Try again" }));

    await chooseOption(user, "Assignee", "cleaner2@cleaning.com", panel);
    expect(within(panel).queryByText(/Could not load the list/)).not.toBeInTheDocument();
  });

  it("says when the country has no active cleaners to assign", async () => {
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.click(screen.getByRole("button", { name: "Create task" }));
    const panel = screen.getByRole("dialog", { name: "New task" });

    expect(
      await within(panel).findByText("No active cleaners in Germany yet. Add one on the Users page."),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("combobox", { name: "Assignee" })).toHaveAccessibleDescription(
      "No active cleaners in Germany yet. Add one on the Users page.",
    );
  });

  it("creates a task with an assignee chosen from the list", async () => {
    let created: unknown = null;
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([]))),
      http.get("*/api/users/assignees", () =>
        HttpResponse.json([{ id: "55555555-5555-4555-8555-555555555555", email: "cleaner2@cleaning.com", country: "DE" }]),
      ),
      http.post("*/api/tasks", async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(makeTask(), { status: 201 });
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.click(screen.getByRole("button", { name: "Create task" }));
    const panel = screen.getByRole("dialog", { name: "New task" });
    expect(within(panel).getByLabelText("Title")).toHaveFocus();
    await user.type(within(panel).getByLabelText("Title"), "Wash windows");
    await chooseOption(user, "Assignee", "cleaner2@cleaning.com", panel);
    await user.click(within(panel).getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(created).toEqual({
        title: "Wash windows",
        country: "DE",
        priority: "normal",
        assigned_to: "55555555-5555-4555-8555-555555555555",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Task “Clean lobby” created")).toBeInTheDocument();
  });

  it("closes the creation panel with Escape and returns focus to the trigger", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([]))));
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");
    const trigger = screen.getByRole("button", { name: "Create task" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("searches by title after the user stops typing", async () => {
    const searches: (string | null)[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        if (isCounter(request)) return HttpResponse.json(makePage([]));
        searches.push(new URL(request.url).searchParams.get("search"));
        return HttpResponse.json(makePage([makeTask()]));
      }),
    );
    const { user } = renderApp("/tasks?page=3", MANAGER);
    await screen.findByRole("table");

    await user.type(screen.getByRole("searchbox", { name: "Search tasks" }), "lobby");

    await waitFor(() => expect(searches.at(-1)).toBe("lobby"));
    expect(searches.filter((value) => value !== null)).toEqual(["lobby"]);
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?search=lobby");
  });

  it("shows active filters as chips that remove the filter", async () => {
    const statuses: (string | null)[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        if (isCounter(request)) return HttpResponse.json(makePage([]));
        statuses.push(new URL(request.url).searchParams.get("status"));
        return HttpResponse.json(makePage([makeTask()]));
      }),
    );
    const { user } = renderApp("/tasks?status=on_hold&priority=high", MANAGER);
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: /Filter/ })).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "Remove Status filter" }));

    await waitFor(() => expect(statuses.at(-1)).toBeNull());
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?priority=high");
    expect(screen.queryByRole("button", { name: "Remove Status filter" })).not.toBeInTheDocument();
  });
});
