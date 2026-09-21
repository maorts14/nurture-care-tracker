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

test("an owner creates a custom activity and a shared note from care management", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Manage care" }).click();
  const activityDialog = page.getByRole("dialog", { name: "Manage care" });
  await activityDialog.getByLabel("Name").first().fill("Bath");
  await activityDialog.getByLabel("First field (optional)").fill("Temperature");
  await activityDialog.getByRole("button", { name: "Create activity" }).click();
  await expect(page.getByRole("radio", { name: "Bath" })).toBeVisible();

  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await page.getByLabel("New note").fill("Remember bath time.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Remember bath time.")).toBeVisible();
});
