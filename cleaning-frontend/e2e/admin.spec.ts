import { expect, test } from "@playwright/test";

import { ADMIN, API_URL } from "./accounts";
import { apiAs, signIn } from "./session";

test("sign-in is locked for a while after repeated wrong passwords", async ({ page }) => {
  const email = `nobody-${String(Date.now())}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  const password = page.getByLabel("Password");
  const submit = page.getByRole("button", { name: "Sign in" });

  for (let attempt = 0; attempt < 5; attempt++) {
    await password.fill(`wrong-${String(attempt)}`);
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
  }
  await password.fill("wrong-again");
  await submit.click();

  await expect(page.getByRole("alert")).toHaveText("Too many failed sign-in attempts. Try again in 15 minutes.");
});

test("an admin renames and deletes a location", async ({ browser }) => {
  const name = `E2E room ${String(Date.now())}`;
  const api = await apiAs(ADMIN);
  const created = await api.post(`${API_URL}/locations`, { data: { name, country: "NL", level: "country" } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  try {
    const admin = await signIn(browser, ADMIN);
    await admin.goto("/locations?country=NL");
    const tree = admin.getByRole("list", { name: "Location tree" });
    await admin.getByRole("button", { name: `Rename ${name}` }).click();
    const panel = admin.getByRole("dialog", { name: "Rename location" });
    await panel.getByLabel("Name").fill(`${name} renamed`);
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(tree.getByText(`${name} renamed`, { exact: true })).toBeVisible();

    await admin.getByRole("button", { name: `Delete ${name} renamed` }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

    await expect(admin.getByText(`${name} renamed deleted`)).toBeVisible();
    await expect(tree.getByText(`${name} renamed`, { exact: true })).toHaveCount(0);
  } finally {
    await api.delete(`${API_URL}/locations/${id}`);
    await api.dispose();
  }
});
