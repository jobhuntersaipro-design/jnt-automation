import { test as setup, expect } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/user.json";

const EMAIL = process.env.PLAYWRIGHT_USER_EMAIL;
const PASSWORD = process.env.PLAYWRIGHT_USER_PASSWORD;

setup("authenticate", async ({ page }) => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "Set PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD env vars (approved, non-superadmin-optional agent account) before running e2e tests.",
    );
  }

  await page.goto("/auth/login");
  // Labels on the login form aren't linked to inputs via htmlFor, so target
  // inputs by placeholder / type directly.
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Successful login lands on /dashboard; wait for the nav to be visible.
  await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: /overview/i })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
