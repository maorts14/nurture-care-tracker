import { expect, test } from "@playwright/test";
import { resetTestDatabase } from "../support/database.js";

test.beforeEach(async () => resetTestDatabase());

test("a signed-in user can reach account data controls and must confirm deletion with their email", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("alex@nurture.local");
  await page.getByLabel("Password").fill("nurture-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Alex Morgan" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Your account, your data." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download data" })).toBeVisible();

  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your Feedme account?" });
  const deleteButton = dialog.getByRole("button", { name: "Permanently delete account" });
  await expect(deleteButton).toBeDisabled();
  await dialog.getByLabel("Account email").fill("alex@nurture.local");
  await expect(deleteButton).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});
