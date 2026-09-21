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

test("a signed-out visitor can change language from the landing page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Language" }).click();
  const languagePicker = page.getByRole("dialog", { name: "Language" });
  await languagePicker.getByRole("button", { name: "עברית" }).click();
  await expect(page.getByRole("button", { name: "שפה" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("an owner can open caregiver management and change a caregiver's role", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Caregivers" }).click();
  await expect(page.getByRole("heading", { name: "Caregivers" })).toBeVisible();
  await expect(page.getByText("Maya Cohen")).toBeVisible();
  const mayaRow = page.locator(".member-list article", { hasText: "Maya Cohen" });
  await mayaRow.getByLabel("Role").selectOption("viewer");
  await expect(mayaRow.locator("small")).toContainText("viewer");
});
