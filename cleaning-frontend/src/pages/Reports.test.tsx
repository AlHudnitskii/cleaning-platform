import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import type { ReportStats, WorkTimeStats } from "../api/types";
import { MANAGER } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

function makeReport(work: Partial<WorkTimeStats> = {}): ReportStats {
  return {
    period: { date_from: "2026-09-17", date_to: "2026-10-17" },
    total_tasks: 3,
    status_stats: { pending: 0, in_progress: 0, on_review: 0, completed: 3, on_hold: 0, cancelled: 0 },
    priority_stats: { low: 0, normal: 3, high: 0, urgent: 0 },
    country_stats: [{ country: "DE", count: 3 }],
    daily_stats: [],
    weekly_stats: [],
    quality_stats: { avg: null, min: null, max: null, reviewed_count: 0 },
    top_cleaners: [],
    work_time: { avg_seconds: null, task_count: 0, by_cleaner: [], by_location: [], ...work },
  };
}

describe("Reports", () => {
  it("shows the average work time per cleaner and per location", async () => {
    server.use(
      http.get("*/api/stats/reports", () =>
        HttpResponse.json(
          makeReport({
            avg_seconds: 5400,
            task_count: 3,
            by_cleaner: [{ email: "anna@example.com", task_count: 2, avg_seconds: 2700 }],
            by_location: [{ id: "l1", name: "Lobby", task_count: 3, avg_seconds: 3600 }],
          }),
        ),
      ),
    );
    renderApp("/reports", MANAGER);

    const section = (await screen.findByRole("heading", { name: "Work time" })).closest("section") as HTMLElement;
    expect(within(section).getByText("1 h 30 min")).toBeInTheDocument();
    expect(within(section).getByText("3 completed tasks measured")).toBeInTheDocument();
    const cleaners = within(section).getByRole("table", { name: "By cleaner" });
    expect(within(cleaners).getByText("45 min")).toBeInTheDocument();
    const locations = within(section).getByRole("table", { name: "By location" });
    expect(within(locations).getByRole("row", { name: /Lobby/ })).toHaveTextContent("1 h");
  });

  it("explains a period without measured work", async () => {
    server.use(http.get("*/api/stats/reports", () => HttpResponse.json(makeReport())));
    renderApp("/reports", MANAGER);

    expect(await screen.findByText("No completed task of this period has a recorded start yet.")).toBeInTheDocument();
  });
});
