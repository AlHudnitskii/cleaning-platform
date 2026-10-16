import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, CLEANER, MANAGER, makePage } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

describe("App shell", () => {
  it("shows how many tasks wait for review next to Tasks", async () => {
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(makePage([], { total: status === "on_review" ? 8 : 0 }));
      }),
    );
    renderApp("/tasks", MANAGER);

    expect(await screen.findByRole("link", { name: "Tasks, 8 waiting for review" })).toHaveAttribute("href", "/tasks");
  });

  it("counts not started tasks for cleaners", async () => {
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(makePage([], { total: status === "pending" ? 3 : 0 }));
      }),
    );
    renderApp("/my-tasks", CLEANER);

    expect(await screen.findByRole("link", { name: "My tasks, 3 not started" })).toBeInTheDocument();
  });

  it("opens the creation panel with N and focuses search with slash", async () => {
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.keyboard("/");
    expect(screen.getByRole("searchbox", { name: "Search tasks" })).toHaveFocus();

    await user.keyboard("n");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(document.body);
    await user.keyboard("n");
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
  });

  it("navigates with G sequences only to pages the role can open", async () => {
    const { user } = renderApp("/tasks", ADMIN);
    await screen.findByText("No tasks yet");

    await user.keyboard("gu");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/users"));
  });

  it("ignores G sequences to pages the role cannot open", async () => {
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.keyboard("gu");

    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
  });

  it("lists shortcuts with the question mark", async () => {
    const { user } = renderApp("/tasks", MANAGER);
    await screen.findByText("No tasks yet");

    await user.keyboard("?");

    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("renders a designed not-found page with a way back", async () => {
    renderApp("/no-such-page", MANAGER);

    expect(await screen.findByRole("heading", { name: "This page does not exist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to start page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });
});
