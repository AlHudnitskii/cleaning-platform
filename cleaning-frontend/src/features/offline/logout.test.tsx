import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { CLEANER, makePage, makeTask } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { loadCachedTasks, pendingChanges, queueStatusChange, saveCachedTasks } from "./offlineStore";

function leaveOfflineWork() {
  queueStatusChange(CLEANER.id, { task_id: makeTask().id, status: "in_progress" });
  saveCachedTasks(CLEANER.id, makePage([makeTask()]));
}

describe("logging out with offline work", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([]))),
      http.post("*/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
  });

  it("sends the queued changes first and leaves nothing on the device", async () => {
    let sent: unknown = null;
    server.use(
      http.post("*/api/sync/batch", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ synced: 1, errors: [] });
      }),
    );
    leaveOfflineWork();
    const { user } = renderApp("/my-tasks", CLEANER);
    await screen.findByRole("heading", { name: "My tasks" });
    await waitFor(() => expect(sent).not.toBeNull());
    leaveOfflineWork();
    sent = null;

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(sent).toMatchObject({ changes: [{ status: "in_progress" }] });
    expect(pendingChanges(CLEANER.id)).toEqual([]);
    expect(loadCachedTasks(CLEANER.id)).toBeNull();
  });

  it("asks before dropping changes that could not be sent", async () => {
    server.use(http.post("*/api/sync/batch", () => HttpResponse.error()));
    leaveOfflineWork();
    const { user } = renderApp("/my-tasks", CLEANER);
    await screen.findByRole("heading", { name: "My tasks" });

    await user.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = await screen.findByRole("alertdialog", { name: "1 change not sent yet" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "My tasks" })).toBeInTheDocument();
    expect(pendingChanges(CLEANER.id)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Log out" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Log out anyway" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(pendingChanges(CLEANER.id)).toEqual([]);
    expect(loadCachedTasks(CLEANER.id)).toBeNull();
  });
});
