import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ADMIN, CLEANER, type Account } from "./accounts";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(page: Page): Promise<string[]> {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("admin pages meet WCAG AA", async ({ page }) => {
      await page.goto("/login");
      expect(await violations(page)).toEqual([]);
      await signIn(page, ADMIN);
      for (const path of ["/tasks", "/dashboard", "/reports", "/locations", "/import", "/export", "/users", "/profile"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("[aria-busy='true'], .skeleton-line")).toHaveCount(0);
        expect(await violations(page), path).toEqual([]);
      }
      await page.goto("/tasks");
      await page.getByRole("button", { name: "Create task" }).click();
      await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
      expect(await violations(page), "task form").toEqual([]);
    });

    test("the cleaner's task list meets WCAG AA", async ({ page }) => {
      await signIn(page, CLEANER);
      await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test("a dialog hides the page behind it and gives focus back when closed", async ({ page }) => {
  await signIn(page, ADMIN);
  const create = page.getByRole("button", { name: "Create task" });
  await create.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("[role='dialog']") !== null)).toBe(true);

  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await expect(create).toBeFocused();
});
