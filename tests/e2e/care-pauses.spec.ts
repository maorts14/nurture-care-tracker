import { expect, test } from "@playwright/test";
import { resetTestDatabase } from "../support/database.js";

async function signInAsAlex(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("alex@nurture.local");
  await page.getByLabel("Password").fill("nurture-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Leo.?s timeline/ })).toBeVisible();
}

test.beforeEach(async () => {
  await resetTestDatabase();
});

test("caregiver creates and edits a care pause from the dedicated page", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Care pauses" }).click();
  await expect(page.getByRole("heading", { name: "Care pauses" })).toBeVisible();
  await expect(page.getByText("No care pauses yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add care pause" }).click();
  const dialog = page.getByRole("dialog", { name: "Add care pause" });
  await dialog.getByLabel("Start").fill("2026-10-03T10:00");
  await dialog.getByLabel("End").fill("2026-10-03T19:00");
  await dialog.getByLabel("Reason").fill("Family trip");
  await expect(dialog.getByLabel("Include affected days in Insights averages")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Add care pause" }).click();

  await expect(page.getByText("Family trip")).toBeVisible();
  await expect(page.getByText("Excluded from averages")).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit care pause" });
  await editDialog.getByLabel("Include affected days in Insights averages").check();
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Included in averages")).toBeVisible();
});
