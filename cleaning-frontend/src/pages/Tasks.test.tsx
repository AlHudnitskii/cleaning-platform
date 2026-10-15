import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, MANAGER, makePage, makeTask } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

describe("Tasks page", () => {
  it("lists tasks with human-readable assignee and location", async () => {
    server.use(
      http.get("*/api/tasks", () =>
        HttpResponse.json(makePage([makeTask({ location_name: "Room 101", assigned_to_email: "cleaner1@cleaning.com" })])),
      ),
    );
    renderApp("/tasks", MANAGER);

    const card = await screen.findByRole("article");
    expect(within(card).getByRole("link", { name: "Clean lobby" })).toHaveAttribute(
      "href",
      "/tasks/44444444-4444-4444-8444-444444444444",
    );
    expect(within(card).getByText("cleaner1@cleaning.com")).toBeInTheDocument();
    expect(within(card).getByText("Room 101")).toBeInTheDocument();
    expect(within(card).queryByText(/33333333/)).not.toBeInTheDocument();
  });

  it("sends filters to the server, stores them in the URL and resets the page", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(makePage([makeTask()], { page: 2, pages: 3, total: 30 }));
      }),
    );
    const { user } = renderApp("/tasks?page=2", MANAGER);
    await screen.findByRole("article");

    await user.selectOptions(screen.getByLabelText("Status"), "on_review");

    await waitFor(() => expect(requests.at(-1)?.get("status")).toBe("on_review"));
    expect(requests.at(-1)?.get("page")).toBe("1");
    expect(requests[0]?.get("page")).toBe("2");
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?status=on_review");
  });

  it("requests the chosen page", async () => {
    const pages: (string | null)[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        const page = new URL(request.url).searchParams.get("page");
        pages.push(page);
        return HttpResponse.json(makePage([makeTask()], { page: Number(page), pages: 3, total: 30 }));
      }),
    );
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByRole("article");

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    await waitFor(() => expect(pages.at(-1)).toBe("3"));
  });

  it("shows the country filter only to administrators", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([makeTask()]))));

    const manager = renderApp("/tasks", MANAGER);
    await screen.findByRole("article");
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    manager.unmount();

    renderApp("/tasks", ADMIN);
    await screen.findByRole("article");
    expect(screen.getByLabelText("Country")).toBeInTheDocument();
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
    expect(await screen.findByRole("article")).toBeInTheDocument();
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
    await user.type(screen.getByLabelText("Title"), "Wash windows");
    await screen.findByRole("option", { name: "cleaner2@cleaning.com" });
    await user.selectOptions(screen.getByLabelText("Assignee"), "cleaner2@cleaning.com");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(created).toEqual({
        title: "Wash windows",
        country: "DE",
        priority: "normal",
        assigned_to: "55555555-5555-4555-8555-555555555555",
      }),
    );
  });
});
