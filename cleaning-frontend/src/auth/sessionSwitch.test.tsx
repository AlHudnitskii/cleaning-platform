import { act, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { CLEANER, MANAGER, makePage, makeSession } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";
import { PROFILE_KEY, saveProfile } from "./session";

function otherTabWrites(profile: typeof MANAGER | null) {
  saveProfile(profile);
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: PROFILE_KEY }));
  });
}

describe("switching accounts in the same browser", () => {
  beforeEach(() => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([]))));
  });

  it("follows another tab that signed in as someone else instead of acting as them silently", async () => {
    renderApp("/my-tasks", CLEANER);
    expect(await screen.findByRole("heading", { name: "My tasks" })).toBeInTheDocument();
    server.use(http.post("*/api/auth/refresh", () => HttpResponse.json(makeSession(MANAGER))));

    otherTabWrites(MANAGER);

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
    expect(
      screen.getByText("You are now signed in as manager.de@cleaning.com — the session changed in another tab."),
    ).toBeInTheDocument();
  });

  it("shows the real account when a silent token refresh returns a different user", async () => {
    const { queryClient } = renderApp("/my-tasks", CLEANER);
    expect(await screen.findByRole("heading", { name: "My tasks" })).toBeInTheDocument();
    server.use(
      http.get("*/api/tasks", ({ request }) =>
        request.headers.get("Authorization") === `Bearer token-${CLEANER.role}`
          ? HttpResponse.json({ error: "Token has expired" }, { status: 401 })
          : HttpResponse.json(makePage([])),
      ),
      http.post("*/api/auth/refresh", () => HttpResponse.json(makeSession(MANAGER))),
    );

    await act(() => queryClient.invalidateQueries());

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My tasks" })).not.toBeInTheDocument();
  });

  it("signs out when another tab signs out", async () => {
    renderApp("/my-tasks", CLEANER);
    await screen.findByRole("heading", { name: "My tasks" });

    otherTabWrites(null);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("opens the app when another tab signs in while this one shows the sign-in page", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });
    server.use(http.post("*/api/auth/refresh", () => HttpResponse.json(makeSession(MANAGER))));

    otherTabWrites(MANAGER);

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
  });
});
