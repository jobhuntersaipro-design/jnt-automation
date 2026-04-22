import { test, expect } from "@playwright/test";

/**
 * Smoke test that asserts the e2e scaffold is working end-to-end:
 *   1. global auth setup wrote a valid storageState
 *   2. the authed session lands on the Dispatchers page without a redirect
 *   3. the page renders the expected H1
 *
 * If this fails, every other e2e test will also fail — fix the scaffold first.
 */
test("scaffold: authenticated user can load /dispatchers", async ({ page }) => {
  await page.goto("/dispatchers");
  await expect(page).toHaveURL(/\/dispatchers(\?|$)/);
  await expect(page.getByRole("heading", { name: "Dispatchers", level: 1 })).toBeVisible();
});
