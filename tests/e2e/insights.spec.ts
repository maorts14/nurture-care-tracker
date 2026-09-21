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

test("caregiver chooses Insights activities and configures a history export", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: /Leo.?s care patterns/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Feeding" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Doctor" })).not.toBeVisible();

  await page.getByRole("button", { name: "Insights settings" }).click();
  const settings = page.getByRole("dialog", { name: "Insights settings" });
  await expect(settings.getByLabel("Feeding")).toBeChecked();
  await expect(settings.getByLabel("Doctor")).not.toBeChecked();
  await settings.getByLabel("Doctor").check();
  await settings.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Doctor" })).toBeVisible();

  await page.getByRole("button", { name: "Export PDF" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export insights" });
  await exportDialog.getByLabel("Include history").check();
  await expect(exportDialog.getByLabel("From", { exact: true })).toBeVisible();
  await expect(exportDialog.getByLabel("To", { exact: true })).toBeVisible();
  await exportDialog.getByRole("button", { name: "Close" }).click();
});
