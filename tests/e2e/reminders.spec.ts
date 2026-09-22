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

test("a caregiver creates an interval reminder and sees it in upcoming care", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Manage reminders" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage care" });
  await dialog.getByLabel("Title").fill("Vitamin reminder");
  await dialog.getByLabel("Interval hours").fill("8");
  await dialog.getByRole("button", { name: "Save reminder" }).click();
  await expect(page.getByText("Vitamin reminder")).toBeVisible();
  await expect(page.getByText("Every 8 hours after activity")).toBeVisible();
});

test("recurring reminders log care while one-time reminders can be completed", async ({ page }) => {
  await signInAsAlex(page);

  await expect(page.getByRole("button", { name: "Log care Feeding window" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete Feeding window" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark complete Doctor appointment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log care Doctor appointment" })).toHaveCount(0);
});
