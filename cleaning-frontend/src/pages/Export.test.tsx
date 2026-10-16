import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { daysAgo, today } from "../dates";
import { MANAGER, makePage, makeTask } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

describe("Export page", () => {
  it("shows how many tasks the chosen period contains", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("date_from")) requests.push(params);
        return HttpResponse.json(makePage([makeTask()], { total: 12 }));
      }),
    );
    const { user } = renderApp("/export", MANAGER);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download 12 tasks" })).toBeEnabled();
    expect(requests.at(-1)?.get("date_from")).toBe(daysAgo(30));
    expect(requests.at(-1)?.get("date_to")).toBe(today());

    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    await waitFor(() => expect(requests.at(-1)?.get("date_from")).toBe(daysAgo(7)));
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables the download when the period is empty", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([], { total: 0 }))));
    renderApp("/export", MANAGER);

    expect(await screen.findByText("No tasks were created in this period.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });
});
