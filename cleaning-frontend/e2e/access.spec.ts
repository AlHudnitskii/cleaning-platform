import { expect, test } from "@playwright/test";

import { API_URL, CLEANER, MANAGER } from "./accounts";
import { apiAs, signIn } from "./session";

test("a cleaner is kept out of the admin pages and the server refuses the data", async ({ browser }) => {
  const cleaner = await signIn(browser, CLEANER);
  await expect(cleaner).toHaveURL(/\/my-tasks$/);

  await cleaner.goto("/users");

  await expect(cleaner).toHaveURL(/\/my-tasks$/);
  await expect(cleaner.getByRole("link", { name: /^Users/ })).toHaveCount(0);

  const api = await apiAs(CLEANER);
  expect((await api.get(`${API_URL}/users`)).status()).toBe(403);
  await api.dispose();
});

test("the chosen language survives a reload", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("radio", { name: "Русский" }).click();
  await page.reload();

  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("another tab of the same browser never keeps acting under the previous account", async ({ context }) => {
  const first = await context.newPage();
  await first.goto("/login");
  await first.getByLabel("Email").fill(CLEANER.email);
  await first.getByLabel("Password").fill(CLEANER.password);
  await first.getByRole("button", { name: "Sign in" }).click();
  await expect(first).toHaveURL(/\/my-tasks$/);

  const second = await context.newPage();
  await second.goto("/my-tasks");
  await second.getByRole("button", { name: "Log out" }).click();
  await expect(first).toHaveURL(/\/login$/);

  await second.getByLabel("Email").fill(MANAGER.email);
  await second.getByLabel("Password").fill(MANAGER.password);
  await second.getByRole("button", { name: "Sign in" }).click();

  await expect(first).toHaveURL(/\/tasks$/);
  await expect(first.getByText(MANAGER.email)).toBeVisible();
});
