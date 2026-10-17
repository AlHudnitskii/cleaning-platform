import { expect, test } from "@playwright/test";

import { API_URL, CLEANER, MANAGER } from "./accounts";
import { apiAs, signIn } from "./session";

const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let taskId: string | null = null;

test.afterAll(async () => {
  if (!taskId) return;
  const api = await apiAs(MANAGER);
  await api.delete(`${API_URL}/tasks/${taskId}`);
  await api.dispose();
});

test("a task goes from creation through the cleaner's work to an approved review", async ({ browser }) => {
  const title = `E2E clean ${String(Date.now())}`;

  const manager = await signIn(browser, MANAGER);
  await manager.getByRole("button", { name: "Create task" }).click();
  const form = manager.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  await form.getByRole("combobox", { name: "Assignee" }).click();
  await manager.getByRole("option", { name: CLEANER.email }).click();
  const step = form.getByRole("textbox", { name: "New checklist step" });
  await step.fill("Empty the bins");
  await step.press("Enter");
  await step.fill("Mop the floor");
  await step.press("Enter");
  await form.getByLabel("Require a photo of the result").check();
  await form.getByRole("button", { name: "Create task" }).click();
  await expect(form).toBeHidden();

  await manager.getByRole("link", { name: title }).click();
  await manager.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  taskId = manager.url().split("/").pop() ?? null;

  const cleaner = await signIn(browser, CLEANER);
  await cleaner.goto(`/tasks/${taskId ?? ""}`);
  await cleaner.getByRole("button", { name: "Start work" }).click();
  await expect(cleaner.getByText("In progress", { exact: true }).first()).toBeVisible();
  const sendToReview = cleaner.getByRole("button", { name: "Send to review" });
  await expect(sendToReview).toBeDisabled();
  await expect(sendToReview).toHaveAttribute(
    "title",
    "To send for review, upload a photo of the result and finish the checklist (0 of 2 done).",
  );

  for (const step of ["Empty the bins", "Mop the floor"]) {
    const checkbox = cleaner.getByRole("checkbox", { name: step });
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  }
  await expect(cleaner.getByText("2 of 2 done")).toBeVisible();
  await expect(sendToReview).toBeDisabled();

  await cleaner.locator('input[type="file"]').setInputFiles({ name: "result.png", mimeType: "image/png", buffer: PHOTO });
  await expect(cleaner.getByText("Photo uploaded.")).toBeVisible();
  await expect(sendToReview).toBeEnabled();
  await sendToReview.click();
  await expect(cleaner.getByText("On review", { exact: true }).first()).toBeVisible();

  await manager.reload();
  await manager.getByRole("button", { name: "Approve" }).click();
  await expect(manager.getByText("Completed", { exact: true }).first()).toBeVisible();
  await manager.getByRole("group", { name: "Score" }).locator("label", { hasText: "4 stars" }).click();
  await expect(manager.getByRole("radio", { name: "4 stars" })).toBeChecked();
  await manager.getByRole("button", { name: "Save review" }).click();
  await expect(manager.getByText("Review saved.")).toBeVisible();

  await cleaner.reload();
  await expect(cleaner.getByRole("img", { name: "4.0 out of 5" })).toBeVisible();
  await expect(cleaner.getByRole("checkbox", { name: "Mop the floor" })).toBeDisabled();
});
