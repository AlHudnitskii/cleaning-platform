import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import type { SyncStatusChange } from "../api/types";
import { CLEANER, makePage, makeTask } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const QUEUE_KEY = `offline_changes:${CLEANER.id}`;

function queued(): SyncStatusChange[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as SyncStatusChange[];
}

describe("My tasks", () => {
  it("asks the server for sorting and filtering", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(makePage([makeTask()]));
      }),
    );
    const { user } = renderApp("/my-tasks", CLEANER);
    await screen.findByRole("article");

    expect(requests[0]?.get("sort")).toBe("priority");
    expect(requests[0]?.get("limit")).toBe("20");

    await user.selectOptions(screen.getByLabelText("Status"), "in_progress");
    await waitFor(() => expect(requests.at(-1)?.get("status")).toBe("in_progress"));
  });

  it("queues a status change when the network is down and syncs it later", async () => {
    let online = false;
    let batch: unknown = null;
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([makeTask()]))),
      http.patch("*/api/tasks/:id/status", () => (online ? HttpResponse.json(makeTask()) : HttpResponse.error())),
      http.post("*/api/sync/batch", async ({ request }) => {
        batch = await request.json();
        return HttpResponse.json({ synced: 1, errors: [] });
      }),
    );
    const { user } = renderApp("/my-tasks", CLEANER);
    const card = await screen.findByRole("article");

    await user.click(within(card).getByRole("button", { name: "Start work" }));

    expect(await within(card).findByText("Waiting to sync")).toBeInTheDocument();
    expect(queued()).toMatchObject([{ type: "status_change", task_id: makeTask().id, status: "in_progress" }]);

    online = true;
    await user.click(await screen.findByRole("button", { name: "Sync now" }));

    await waitFor(() => expect(queued()).toEqual([]));
    expect(batch).toMatchObject({ changes: [{ task_id: makeTask().id, status: "in_progress" }] });
  });

  it("reports offline changes the server rejected", async () => {
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        { type: "status_change", task_id: makeTask().id, status: "on_review", timestamp: "2026-10-01T10:00:00Z" },
      ]),
    );
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([makeTask()]))),
      http.post("*/api/sync/batch", () =>
        HttpResponse.json({
          synced: 0,
          errors: [{ task_id: makeTask().id, error: "Task was changed on the server after this offline change" }],
        }),
      ),
    );

    renderApp("/my-tasks", CLEANER);

    expect(await screen.findByText("Task was changed on the server after this offline change")).toBeInTheDocument();
    expect(queued()).toEqual([]);
  });

  it("falls back to the last saved list when offline", async () => {
    localStorage.setItem(`cached_tasks:${CLEANER.id}`, JSON.stringify(makePage([makeTask({ title: "Cached task" })])));
    server.use(http.get("*/api/tasks", () => HttpResponse.error()));

    renderApp("/my-tasks", CLEANER);

    expect(await screen.findByRole("link", { name: "Cached task" })).toBeInTheDocument();
    expect(screen.getByText("Showing the last saved copy of your tasks.")).toBeInTheDocument();
  });
});
