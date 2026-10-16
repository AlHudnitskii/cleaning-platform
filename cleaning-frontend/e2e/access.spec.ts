import { expect, test } from "@playwright/test";

import { API_URL, CLEANER } from "./accounts";
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
