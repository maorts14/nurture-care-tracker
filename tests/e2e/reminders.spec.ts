import { expect, test } from "@playwright/test";
import { resetTestDatabase } from "../support/database.js";

async function signInAsAlex(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("alex@nurture.local");
  await page.getByLabel("Password").fill("nurture-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Leo.?s timeline/ })).toBeVisible();
}

test.beforeEach(async () => resetTestDatabase());

test("a caregiver manages activity-owned reminders", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Activities & reminders" }).first().click();
  await expect(page.getByRole("heading", { name: "Activities & reminders" })).toBeVisible();
  const feeding = page.locator(".activity-schedule-row").filter({ hasText: "Feeding" });
  await expect(feeding.getByText("Recurring")).toBeVisible();
  await expect(feeding.getByRole("button", { name: "Edit reminder" })).toBeVisible();

  await page.getByRole("button", { name: "Add activity" }).click();
  const activityDialog = page.getByRole("dialog", { name: "Add activity" });
  await activityDialog.getByLabel("Name").fill("Vitamin");
  await activityDialog.getByRole("button", { name: "Create activity" }).click();
  const vitamin = page.locator(".activity-schedule-row").filter({ hasText: "Vitamin" });
  await expect(vitamin).toBeVisible();
  await vitamin.getByRole("button", { name: "Add reminder" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Reminder Vitamin" });
  await scheduleDialog.getByLabel("Interval hours").fill("8");
  await scheduleDialog.getByRole("button", { name: "Save reminder" }).click();
  await expect(vitamin.getByText("Every 8 hours after activity")).toBeVisible();
  await page.getByRole("button", { name: "Timeline" }).first().click();
  await expect(page.locator(".due-item", { hasText: "Vitamin" })).toContainText(
    "Record the first care to set the next expected time.",
  );
});

test("recurring reminders log care while one-time reminders open a populated care form", async ({ page }) => {
  await signInAsAlex(page);

  await expect(page.locator(".due-item", { hasText: "Feeding" }).locator(".due-log")).toBeVisible();
  await expect(page.locator(".due-item", { hasText: "Feeding" })).toContainText("Next expected:");
  await expect(page.getByRole("button", { name: "Mark complete Feeding" })).toHaveCount(0);
  await expect(page.locator(".due-item", { hasText: "Doctor" }).locator(".check")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log care Doctor" })).toHaveCount(0);
  await page.locator(".due-item", { hasText: "Feeding" }).getByRole("button", { name: "Log care Feeding" }).first().click();
  const recurringDialog = page.getByRole("dialog", { name: "What happened?" });
  await expect(recurringDialog.getByRole("button", { name: "Feeding" })).toBeVisible();
  await expect(recurringDialog.getByRole("button", { name: "Diaper change" })).toHaveCount(0);
  await expect(recurringDialog.getByRole("button", { name: "Doctor" })).toHaveCount(0);
  await recurringDialog.getByRole("button", { name: "Close" }).click();
  await page.locator(".due-item", { hasText: "Doctor" }).getByRole("button", { name: "Mark complete Doctor" }).first().click();
  const dialog = page.getByRole("dialog", { name: "What happened?" });
  await expect(dialog.getByRole("button", { name: "Doctor" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Feeding" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Diaper change" })).toHaveCount(0);
  await expect(dialog.getByLabel("Provider")).toBeVisible();
  await expect(dialog.getByLabel("Reason")).toBeVisible();
  await dialog.getByLabel("Provider").fill("Dr. Cohen");
  await dialog.getByLabel("Reason").fill("Checkup");
  await dialog.getByLabel("Note").fill("Everything looked good.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Mark complete Doctor" })).toHaveCount(0);
  await expect(page.locator(".timeline-list .event").first().getByText("Doctor", { exact: true })).toBeVisible();
});
