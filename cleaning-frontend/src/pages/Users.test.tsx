import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, MANAGER } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

describe("Users page", () => {
  it("deactivates a user from the row and confirms with a toast", async () => {
    let toggled: string | null = null;
    server.use(
      http.get("*/api/users", () => HttpResponse.json([ADMIN, MANAGER])),
      http.patch("*/api/users/:id/toggle-active", ({ params }) => {
        toggled = String(params.id);
        return HttpResponse.json({ ...MANAGER, is_active: false });
      }),
    );
    const { user } = renderApp("/users", ADMIN);

    const row = await screen.findByRole("row", { name: /manager\.de@cleaning\.com/ });
    expect(within(screen.getByRole("row", { name: /admin@cleaning\.com/ })).getByText("You")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Deactivate manager.de@cleaning.com" }));

    expect(await screen.findByText("manager.de@cleaning.com deactivated")).toBeInTheDocument();
    expect(toggled).toBe(MANAGER.id);
  });

  it("reports a failed toggle instead of silently ignoring it", async () => {
    server.use(
      http.get("*/api/users", () => HttpResponse.json([ADMIN, MANAGER])),
      http.patch("*/api/users/:id/toggle-active", () => HttpResponse.json({ error: "User not found" }, { status: 404 })),
    );
    const { user } = renderApp("/users", ADMIN);

    const row = await screen.findByRole("row", { name: /manager\.de@cleaning\.com/ });
    await user.click(within(row).getByRole("button", { name: /Deactivate/ }));

    expect(await screen.findByText("User not found")).toBeInTheDocument();
  });

  it("sorts rows by the clicked column", async () => {
    const cleaner = { ...MANAGER, id: "99999999-9999-4999-8999-999999999999", email: "cleaner@cleaning.com", role: "cleaner" as const };
    server.use(http.get("*/api/users", () => HttpResponse.json([MANAGER, ADMIN, cleaner])));
    const { user } = renderApp("/users", ADMIN);
    await screen.findByRole("table");
    const emails = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[1]?.textContent);

    await user.click(screen.getByRole("button", { name: "Role" }));
    expect(emails()).toEqual([
      expect.stringContaining("admin@"),
      expect.stringContaining("manager.de@"),
      expect.stringContaining("cleaner@"),
    ]);

    await user.click(screen.getByRole("button", { name: "Role" }));
    expect(emails()[0]).toContain("cleaner@");
    expect(screen.getByRole("columnheader", { name: /Role/ })).toHaveAttribute("aria-sort", "descending");
  });
});
