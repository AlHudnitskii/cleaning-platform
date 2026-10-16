import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import type { ImportResult } from "../api/types";
import { MANAGER } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const PREVIEW: ImportResult = {
  imported: 0,
  valid_rows: 1,
  total_rows: 2,
  errors: ["Row 3: title is required"],
  preview: [
    {
      row: 2,
      title: "Clean lobby",
      country: "DE",
      priority: "high",
      location_name: "Room 101",
      assignee_email: "cleaner1@cleaning.com",
      rrule: null,
    },
  ],
  dry_run: true,
};

describe("Import page", () => {
  it("previews the file before importing and imports only after confirmation", async () => {
    const calls: (string | null)[] = [];
    server.use(
      http.post("*/api/import/tasks", ({ request }) => {
        const dryRun = new URL(request.url).searchParams.get("dry_run");
        calls.push(dryRun);
        return HttpResponse.json<ImportResult>(
          dryRun ? PREVIEW : { ...PREVIEW, imported: 1, dry_run: false },
        );
      }),
    );
    const { user } = renderApp("/import", MANAGER);
    const file = new File(["title,country\nClean lobby,DE\n"], "tasks.csv", { type: "text/csv" });

    await user.upload(await screen.findByLabelText(/Drop a file here/), file);

    expect(await screen.findByText("ready to import")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Clean lobby" })).toBeInTheDocument();
    expect(screen.getByText("1 row will be skipped")).toBeInTheDocument();
    expect(calls).toEqual(["true"]);

    await user.click(screen.getByRole("button", { name: "Import 1 task" }));

    expect(await screen.findByRole("heading", { name: "1 task imported" })).toBeInTheDocument();
    expect(calls).toEqual(["true", null]);
    expect(screen.getByRole("link", { name: "View tasks" })).toHaveAttribute("href", "/tasks");
  });

  it("rejects unsupported files without uploading them", async () => {
    let uploaded = false;
    server.use(
      http.post("*/api/import/tasks", () => {
        uploaded = true;
        return HttpResponse.json(PREVIEW);
      }),
    );
    renderApp("/import", MANAGER);
    const user = userEvent.setup({ applyAccept: false });
    const file = new File(["%PDF"], "tasks.pdf", { type: "application/pdf" });

    await user.upload(await screen.findByLabelText(/Drop a file here/), file);

    expect(await screen.findByText("Choose a .xlsx or .csv file.")).toBeInTheDocument();
    await waitFor(() => expect(uploaded).toBe(false));
  });

  it("does not offer to import when every row has errors", async () => {
    server.use(
      http.post("*/api/import/tasks", () =>
        HttpResponse.json<ImportResult>({ ...PREVIEW, valid_rows: 0, preview: [], errors: ["Row 2: bad"] }),
      ),
    );
    const { user } = renderApp("/import", MANAGER);

    await user.upload(await screen.findByLabelText(/Drop a file here/), new File(["x"], "tasks.csv"));

    expect(await screen.findByRole("button", { name: "Nothing to import" })).toBeDisabled();
  });
});
