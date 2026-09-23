import { expect, test } from "@playwright/test";
import { ApiClient } from "../support/api.js";
import { resetTestDatabase } from "../support/database.js";

const leoId = "33333333-3333-3333-3333-333333333333";

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
  await expect(page.locator("#root")).toHaveAttribute("dir", "rtl");
});

test("landing carousel changes slides when either half of a screenshot is clicked", async ({ page }) => {
  await page.goto("/");
  const track = page.locator(".marketing-carousel-track");
  const bounds = await track.boundingBox();
  if (!bounds) throw new Error("Carousel track is not visible");

  await track.click({ position: { x: bounds.width * 0.7, y: bounds.height / 2 } });
  await expect(page.locator(".marketing-carousel-dots button.active")).toHaveAttribute(
    "aria-label",
    /Screenshot 2 of 5/,
  );

  await track.click({ position: { x: bounds.width * 0.3, y: bounds.height / 2 } });
  await expect(page.locator(".marketing-carousel-dots button.active")).toHaveAttribute(
    "aria-label",
    /Screenshot 1 of 5/,
  );
});

test("a link invitation survives the landing page and lets a new caregiver join", async ({ page }) => {
  const owner = new ApiClient();
  await owner.signIn("alex@nurture.local", "nurture-demo");
  const invitationResponse = await owner.request(`/api/children/${leoId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ role: "caregiver" }),
  });
  expect(invitationResponse.status).toBe(201);
  const invitation = (await invitationResponse.json()) as { token: string };

  await page.goto(`/?invite=${invitation.token}`);
  await page.getByRole("button", { name: "Enter your care space" }).click();
  await expect(page.getByText("You’re invited to join the care space for Leo.")).toBeVisible();
  await page.getByRole("button", { name: "Need an account? Register" }).click();
  await page.getByLabel("Name").fill("Invited Caregiver");
  await page.getByLabel("Email").fill("invited-caregiver@test.local");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Create account" }).click();

  const dialog = page.getByRole("dialog", { name: "Join a child's care space" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Join care space" }).click();
  await expect(page.getByRole("heading", { name: /Leo.?s timeline/ })).toBeVisible();
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
