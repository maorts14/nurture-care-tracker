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

test("an owner builds a custom activity with only type-relevant field settings", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Activities & reminders" }).first().click();
  await page.getByRole("button", { name: "Add activity" }).click();
  const activityDialog = page.getByRole("dialog", { name: "Add activity" });
  await activityDialog.getByLabel("Name").fill("Bath");
  await activityDialog.getByRole("button", { name: "Add field" }).click();
  await activityDialog.getByRole("button", { name: "Add field" }).click();
  const fields = activityDialog.locator(".activity-field-editor");
  await fields.nth(0).getByLabel("Field name").fill("Temperature");
  await fields.nth(0).getByLabel("Field type").selectOption("number");
  await fields.nth(0).getByLabel("Unit (optional)").fill("°C");
  await fields.nth(1).getByLabel("Field name").fill("Bath type");
  await fields.nth(1).getByLabel("Field type").selectOption("select");
  await fields.nth(1).getByLabel("Choices").fill("Quick, Long");
  await activityDialog.getByRole("button", { name: "Create activity" }).click();
  const bath = page.locator(".activity-schedule-row").filter({ hasText: "Bath" });
  await expect(bath).toContainText("2 fields");
  await bath.locator("button.more:not(.danger)").click();
  const editor = page.getByRole("dialog", { name: "Bath" });
  const temperatureField = editor.locator('.activity-field-editor:has(input[value="Temperature"])');
  const bathTypeField = editor.locator('.activity-field-editor:has(input[value="Bath type"])');
  await expect(temperatureField.getByLabel("Unit (optional)")).toBeVisible();
  await expect(temperatureField.getByLabel("Choices")).toHaveCount(0);
  await expect(bathTypeField.getByLabel("Choices")).toHaveValue("Quick, Long");
});
