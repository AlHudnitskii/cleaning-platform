import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { MANAGER, makePage } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

class FakeEventSource {
  static opened: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

describe("live task events", () => {
  beforeEach(() => {
    FakeEventSource.opened = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the stream with a one-time ticket instead of the access token and fetches a new one to reconnect", async () => {
    let issued = 0;
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(makePage([]))),
      http.post("*/api/events/ticket", () => {
        issued += 1;
        return HttpResponse.json({ ticket: `ticket-${String(issued)}`, expires_in: 30 }, { status: 201 });
      }),
    );
    renderApp("/tasks", MANAGER);
    await screen.findByRole("heading", { name: "Tasks" });

    await waitFor(() => expect(FakeEventSource.opened).toHaveLength(1));
    const first = FakeEventSource.opened[0];
    expect(first?.url).toBe("/events/stream?ticket=ticket-1");
    expect(first?.url).not.toContain("token");

    first?.onerror?.();

    await waitFor(() => expect(FakeEventSource.opened).toHaveLength(2));
    expect(first?.closed).toBe(true);
    expect(FakeEventSource.opened[1]?.url).toBe("/events/stream?ticket=ticket-2");
  });
});
