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

test("timeline puts upcoming reminders first and shows record totals for the selected history", async ({ page }) => {
  await signInAsAlex(page);

  const upcoming = page.locator(".upcoming-list");
  await expect(upcoming).toBeVisible();
  await expect(upcoming.locator(".due-item").first()).toBeVisible();
  await expect(page.locator(".summary-strip")).toHaveCount(0);
  await expect(page.locator(".timeline-filter-tab").first()).toContainText(/\d+ records/);
  await expect(page.locator(".timeline-date-divider").first()).toContainText(/\d+ records/);

  await page.locator(".timeline-filter-tab", { hasText: "Feeding" }).click();
  await expect(page.locator(".timeline-filter-tab.active")).toContainText("Feeding");
  await expect(page.locator(".timeline-date-divider").first()).toContainText(/\d+ records/);
});

test("caregiver creates a multi-portion feeding, opens its editor, and adds a comment", async ({ page }) => {
  await signInAsAlex(page);
  await page.getByRole("button", { name: "Log care", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "What happened?" });
  await dialog.getByRole("button", { name: "Feeding", exact: true }).click();
  await dialog.getByLabel("Amount in ml").fill("65");
  await dialog.getByRole("button", { name: "Add portion" }).click();
  await dialog.getByLabel("Amount in ml").nth(1).fill("25");
  await dialog.getByLabel("Note").fill("Two small portions");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("Two small portions")).toBeVisible();
  await expect(page.getByText("· 90 ml")).toBeVisible();

  const newestEvent = page.locator(".timeline-list .event").first();
  await newestEvent.click();
  const editDialog = page.getByRole("dialog", { name: "Edit care record" });
  await expect(editDialog.getByText("Alex Morgan")).toBeVisible();
  await expect(editDialog.getByLabel("Amount in ml").first()).toHaveValue("65");
  await editDialog.getByLabel("Close").click();

  await newestEvent.getByRole("button", { name: /Comment Feeding/ }).click();
  await page.getByLabel("Comment").fill("Settled well afterward.");
  await page.getByRole("button", { name: "Save comment" }).click();
  await expect(page.getByText("Settled well afterward.")).toBeVisible();
});
