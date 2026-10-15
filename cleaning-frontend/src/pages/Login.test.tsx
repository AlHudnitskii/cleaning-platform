import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { CLEANER, MANAGER, makeSession, makePage } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server, sessionHandlers } from "../test/server";

describe("Login", () => {
  it("signs a manager in and opens the task list", async () => {
    let body: unknown = null;
    server.use(
      ...sessionHandlers(MANAGER),
      http.post("*/api/auth/login", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeSession(MANAGER));
      }),
      http.get("*/api/tasks", () => HttpResponse.json(makePage([]))),
    );
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText("Email"), MANAGER.email);
    await user.type(screen.getByLabelText("Password"), "manager123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
    expect(body).toEqual({ email: MANAGER.email, password: "manager123" });
    expect(localStorage.getItem("profile")).not.toContain("token");
  });

  it("sends a cleaner to their own tasks", async () => {
    server.use(
      ...sessionHandlers(CLEANER),
      http.post("*/api/auth/login", () => HttpResponse.json(makeSession(CLEANER))),
      http.get("*/api/tasks", () => HttpResponse.json(makePage([]))),
    );
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText("Email"), CLEANER.email);
    await user.type(screen.getByLabelText("Password"), "cleaner123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "My tasks" })).toBeInTheDocument();
  });

  it("shows the server message for wrong credentials and stays on the page", async () => {
    server.use(
      http.post("*/api/auth/login", () => HttpResponse.json({ error: "Invalid email or password" }, { status: 401 })),
    );
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(localStorage.getItem("profile")).toBeNull();
  });
});

describe("Session restore", () => {
  it("sends the user to login when the refresh cookie is no longer valid", async () => {
    localStorage.setItem("profile", JSON.stringify(MANAGER));
    server.use(http.post("*/api/auth/refresh", () => HttpResponse.json({ error: "Session is no longer valid" }, { status: 401 })));

    renderApp("/tasks");

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("profile")).toBeNull();
  });

  it("keeps a cached session while the server is unreachable", async () => {
    localStorage.setItem("profile", JSON.stringify(CLEANER));
    server.use(
      http.post("*/api/auth/refresh", () => HttpResponse.error()),
      http.get("*/api/tasks", () => HttpResponse.error()),
    );

    renderApp("/my-tasks");

    expect(await screen.findByText("Offline")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My tasks" })).toBeInTheDocument();
  });

  it("shows a not found page for unknown routes", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json(makePage([]))));
    renderApp("/no-such-page", MANAGER);

    expect(await screen.findByText("This page does not exist")).toBeInTheDocument();
  });
});
