import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import type { CalendarResponse, CalendarTask } from "../api/types";
import { CLEANER, MANAGER, makeTask } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

function entry(overrides: Partial<CalendarTask> = {}): CalendarTask {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Clean lobby",
    status: "pending",
    priority: "normal",
    country: "DE",
    due_date: "2026-10-15",
    assigned_to: CLEANER.id,
    assigned_to_email: CLEANER.email,
    assigned_to_name: null,
    location_name: null,
    is_recurring: false,
    parent_task_id: null,
    ...overrides,
  };
}

function calendarHandler(tasks: CalendarTask[], requests: URLSearchParams[] = [], extra: Partial<CalendarResponse> = {}) {
  return http.get("*/api/calendar/tasks", ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    return HttpResponse.json<CalendarResponse>({
      date_from: params.get("date_from") ?? "",
      date_to: params.get("date_to") ?? "",
      data: tasks,
      truncated: false,
      ...extra,
    });
  });
}

function dataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
    effectAllowed: "all",
    dropEffect: "move",
  };
}

describe("Calendar", () => {
  it("shows the month grid with each task on its due day", async () => {
    const requests: URLSearchParams[] = [];
    server.use(calendarHandler([entry(), entry({ id: "t2", title: "Mop hall", due_date: "2026-10-02" })], requests));
    renderApp("/calendar?date=2026-10-15", MANAGER);

    const day = await screen.findByRole("listitem", { name: /15 October, 1 task/ });
    expect(within(day).getByRole("link", { name: /Clean lobby/ })).toHaveAttribute(
      "href",
      "/tasks/44444444-4444-4444-8444-444444444444",
    );
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Calendar");
    expect([requests[0]?.get("date_from"), requests[0]?.get("date_to")]).toEqual(["2026-09-28", "2026-11-08"]);
  });

  it("asks for one week in the week view and moves to the next week", async () => {
    const requests: URLSearchParams[] = [];
    server.use(calendarHandler([], requests));
    const { user } = renderApp("/calendar?view=week&date=2026-10-15", MANAGER);

    expect(await screen.findByText("No tasks are due in this period.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next week" }));

    await waitFor(() => expect(requests.at(-1)?.get("date_from")).toBe("2026-10-19"));
    expect(requests.at(-1)?.get("date_to")).toBe("2026-10-25");
    expect(requests[0]?.get("date_from")).toBe("2026-10-12");
  });

  it("moves a task to the day it is dropped on", async () => {
    let sent: unknown = null;
    server.use(
      calendarHandler([entry()]),
      http.patch("*/api/tasks/44444444-4444-4444-8444-444444444444", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(makeTask({ due_date: "2026-10-20" }));
      }),
    );
    renderApp("/calendar?date=2026-10-15", MANAGER);

    const chip = await screen.findByRole("link", { name: /Clean lobby/ });
    const transfer = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: transfer });
    const target = screen.getByRole("listitem", { name: /20 October/ });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    await waitFor(() => expect(sent).toEqual({ due_date: "2026-10-20" }));
    expect(await screen.findByText("“Clean lobby” moved to 20 Oct 2026")).toBeInTheDocument();
  });

  it("collapses a busy day in the month view and opens it as a week", async () => {
    const busy = ["A", "B", "C", "D", "E"].map((name) => entry({ id: `t-${name}`, title: `Room ${name}` }));
    const requests: URLSearchParams[] = [];
    server.use(calendarHandler(busy, requests));
    const { user } = renderApp("/calendar?date=2026-10-15", MANAGER);

    await user.click(await screen.findByRole("button", { name: "2 more" }));

    await waitFor(() => expect(requests.at(-1)?.get("date_from")).toBe("2026-10-12"));
    expect(await screen.findByRole("link", { name: /Room E/ })).toBeInTheDocument();
  });

  it("warns when the period holds more tasks than it shows", async () => {
    server.use(calendarHandler([entry()], [], { truncated: true }));
    renderApp("/calendar?date=2026-10-15", MANAGER);

    expect(await screen.findByText(/more than 500 tasks/)).toBeInTheDocument();
  });

  it("offers a retry when the calendar fails to load", async () => {
    server.use(http.get("*/api/calendar/tasks", () => HttpResponse.json({ error: "Internal server error" }, { status: 500 })));
    renderApp("/calendar?date=2026-10-15", MANAGER);

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows cleaners their tasks without filters or moving", async () => {
    server.use(calendarHandler([entry()]));
    renderApp("/calendar?date=2026-10-15", CLEANER);

    const chip = await screen.findByRole("link", { name: /Clean lobby/ });
    expect(chip).toHaveAttribute("draggable", "false");
    expect(screen.queryByText(/Drag a task/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assignee")).not.toBeInTheDocument();
  });
});
