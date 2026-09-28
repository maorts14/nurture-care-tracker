import { expect, test } from "@playwright/test";
import { resetTestDatabase } from "../support/database.js";

test.beforeEach(async () => resetTestDatabase({ seed: false }));

test("a new family registers and creates its first child profile", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Need an account? Register" }).click();
  await page.getByLabel("Name").fill("New Parent");
  await page.getByLabel("Email").fill("new-parent@test.local");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Create child" })).toBeVisible();

  await page.getByRole("button", { name: "Create child" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a child" });
  await dialog.getByLabel("Child’s name").fill("Nora");
  await dialog.getByLabel("Birth date (optional)").fill("2026-05-05");
  await dialog.getByRole("button", { name: "Create child" }).click();
  await expect(page.getByRole("heading", { name: /Nora.?s timeline/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log care" })).toBeVisible();
});
