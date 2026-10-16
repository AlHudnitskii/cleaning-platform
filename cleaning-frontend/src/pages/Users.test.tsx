import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, MANAGER } from "../test/fixtures";
import { chooseOption, renderApp } from "../test/render";
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

  it("edits a user's role and country and sends the exact changes", async () => {
    let body: unknown = null;
    server.use(
      http.get("*/api/users", () => HttpResponse.json([ADMIN, MANAGER])),
      http.patch("*/api/users/:id", async ({ request, params }) => {
        body = await request.json();
        return HttpResponse.json({ ...MANAGER, id: String(params.id), role: "cleaner", country: "NL" });
      }),
    );
    const { user } = renderApp("/users", ADMIN);

    await user.click(await screen.findByRole("button", { name: "Edit manager.de@cleaning.com" }));
    const panel = screen.getByRole("dialog", { name: "Edit user" });
    expect(within(panel).getByLabelText("Email")).toHaveValue("manager.de@cleaning.com");
    expect(within(panel).queryByLabelText("Password")).not.toBeInTheDocument();
    await chooseOption(user, "Role", "Cleaner", panel);
    await chooseOption(user, "Country", "Netherlands", panel);
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("manager.de@cleaning.com saved")).toBeInTheDocument();
    expect(body).toEqual({ email: "manager.de@cleaning.com", role: "cleaner", country: "NL" });
    expect(screen.queryByRole("dialog", { name: "Edit user" })).not.toBeInTheDocument();
  });

  it("keeps the panel open with the server's reason when an edit is refused", async () => {
    server.use(
      http.get("*/api/users", () => HttpResponse.json([ADMIN, MANAGER])),
      http.patch("*/api/users/:id", () =>
        HttpResponse.json({ error: "Reassign this cleaner's open tasks first (2)" }, { status: 409 }),
      ),
    );
    const { user } = renderApp("/users", ADMIN);

    await user.click(await screen.findByRole("button", { name: "Edit manager.de@cleaning.com" }));
    const panel = screen.getByRole("dialog", { name: "Edit user" });
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));

    expect(await within(panel).findByText("Reassign this cleaner's open tasks first (2)")).toBeInTheDocument();
  });

  it("locks the role and country of the admin's own account and hides the password reset", async () => {
    server.use(http.get("*/api/users", () => HttpResponse.json([ADMIN, MANAGER])));
    const { user } = renderApp("/users", ADMIN);

    await user.click(await screen.findByRole("button", { name: "Edit admin@cleaning.com" }));
    const panel = screen.getByRole("dialog", { name: "Edit user" });

    expect(within(panel).getByRole("combobox", { name: "Role" })).toBeDisabled();
    expect(within(panel).getByRole("combobox", { name: "Country" })).toBeDisabled();
    expect(within(panel).getAllByText("You cannot change your own role or country.")).toHaveLength(2);
    expect(within(panel).queryByRole("button", { name: "Reset password…" })).not.toBeInTheDocument();
  });

  it("resets another user's password from the edit panel", async () => {
    let body: unknown = null;
    server.use(
      http.get("*/api/users", () => HttpResponse.json([ADMIN, MANAGER])),
      http.post("*/api/users/:id/password", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp("/users", ADMIN);
    await user.click(await screen.findByRole("button", { name: "Edit manager.de@cleaning.com" }));
    await user.click(screen.getByRole("button", { name: "Reset password…" }));

    const dialog = screen.getByRole("alertdialog", { name: "Set a new password for manager.de@cleaning.com" });
    const confirm = within(dialog).getByRole("button", { name: "Set password" });
    expect(within(dialog).getByLabelText("New password")).toHaveFocus();
    expect(screen.getByRole("dialog", { name: "Edit user" }).closest("[inert]")).not.toBeNull();
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("New password"), "temporary1{Enter}");

    expect(await screen.findByText("Password for manager.de@cleaning.com changed")).toBeInTheDocument();
    expect(body).toEqual({ new_password: "temporary1" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit user" }).closest("[inert]")).toBeNull();
  });
});
