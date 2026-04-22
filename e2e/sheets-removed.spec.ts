import { test, expect } from "@playwright/test";

/**
 * Phase 1 (red) Playwright tests for Google Sheets removal.
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md
 *
 * Covers:
 *   - P1-T2: the 6 deleted OAuth + export routes all return 404.
 *   - P1-T7: /settings page has no "Google Sheets" text / connect affordance.
 *   - P1-T8: Payroll History row → Summary dropdown shows CSV + PDF only.
 *
 * Red today: the routes still return 200/401/redirect, and the UI still
 * reads "Google Sheets". Turns green after Phase 2.
 */

test.describe("Sheets removal — deleted routes 404 (P1-T2)", () => {
  const deleted = [
    "/api/auth/google-sheets/connect",
    "/api/auth/google-sheets/callback",
    "/api/auth/google-sheets/disconnect",
    "/api/payroll/upload/any-upload-id/export/sheets",
    "/api/staff/any-dispatcher-id/export/sheets",
    "/api/overview/export/sheets",
  ];

  for (const path of deleted) {
    test(`GET ${path} returns 404`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `expected ${path} to 404, got ${res.status()}`).toBe(404);
    });
  }

  test("POST /api/payroll/upload/any/export/sheets returns 404", async ({ request }) => {
    const res = await request.post("/api/payroll/upload/any/export/sheets");
    expect(res.status()).toBe(404);
  });

  test("POST /api/staff/any/export/sheets returns 404", async ({ request }) => {
    const res = await request.post("/api/staff/any/export/sheets");
    expect(res.status()).toBe(404);
  });

  test("POST /api/overview/export/sheets returns 404", async ({ request }) => {
    const res = await request.post("/api/overview/export/sheets");
    expect(res.status()).toBe(404);
  });
});

test.describe("Sheets removal — UI absence", () => {
  test("Settings page has no 'Google Sheets' text or connect button (P1-T7)", async ({
    page,
  }) => {
    await page.goto("/settings");
    // No copy referencing Sheets anywhere on the page.
    await expect(page.getByText(/google sheets/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /connect.*google sheets|google sheets/i }),
    ).toHaveCount(0);
  });

  test("Payroll History row Summary dropdown shows CSV + PDF only (P1-T8)", async ({
    page,
  }) => {
    await page.goto("/dispatchers?tab=payroll");
    // Open the first row's Summary dropdown.
    const summaryButtons = page.getByRole("button", {
      name: /download monthly summary|^summary$/i,
    });
    await summaryButtons.first().click();
    // Expected options after Phase 2
    await expect(page.getByRole("button", { name: /^csv$/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^pdf$/i }).first()).toBeVisible();
    // No Google Sheets option
    await expect(page.getByRole("button", { name: /google sheets/i })).toHaveCount(0);
  });
});
