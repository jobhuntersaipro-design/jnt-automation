import { test, expect } from "@playwright/test";

/**
 * Phase 1 (red) Playwright API tests for the 3 new PDF endpoints that
 * replace the deleted /export/sheets routes.
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md
 *
 * Covers P1-T3, T4, T5, T6. All red today (stubs return 501).
 *
 * The tests use the authenticated browser context's storageState so cookies
 * carry through to `request` calls — same session the user has in the UI.
 */

/**
 * Helper — grabs the first /dispatchers/payroll/[uploadId] link's uploadId
 * from the Payroll History table. Used to hit per-upload endpoints without
 * hardcoding a DB id.
 */
async function firstUploadId(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/dispatchers?tab=payroll");
  const href = await page
    .locator('a[href^="/dispatchers/payroll/"]')
    .first()
    .getAttribute("href");
  if (!href) return null;
  return href.replace("/dispatchers/payroll/", "");
}

async function firstDispatcherId(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/dispatchers");
  // Dispatcher rows expose the id in a data attribute or in href targets.
  // Rows currently have a "Salary history" button — inspect the parent row's
  // id by grabbing any element carrying a cuid-looking data-dispatcher-id
  // attribute OR falling back to the drawer's href.
  const id = await page.evaluate(() => {
    const row = document.querySelector(
      "[data-dispatcher-id], [data-id], a[href*='/dispatchers/history/']",
    );
    if (row instanceof HTMLElement && row.dataset.dispatcherId) {
      return row.dataset.dispatcherId;
    }
    // Derive from the first history link if present
    const link = document.querySelector(
      'a[href*="/api/staff/"]',
    ) as HTMLAnchorElement | null;
    if (link) {
      const m = link.href.match(/\/api\/staff\/([^/]+)/);
      return m?.[1] ?? null;
    }
    return null;
  });
  return id;
}

test.describe("Payroll upload export/pdf (P1-T3, T4)", () => {
  test("GET /api/payroll/upload/:id/export/pdf returns a valid PDF for the authed agent (P1-T3)", async ({
    page,
    request,
  }) => {
    const uploadId = await firstUploadId(page);
    test.skip(!uploadId, "No payroll uploads seeded — cannot exercise route");

    const res = await request.get(`/api/payroll/upload/${uploadId}/export/pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers()["content-disposition"]).toMatch(
      /attachment;\s*filename=".*\.pdf"/,
    );
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(200);
    // PDF magic bytes: %PDF-
    expect(body.slice(0, 5).toString("utf8")).toBe("%PDF-");
  });

  test("GET /api/payroll/upload/:id/export/pdf returns 404 for an unknown uploadId (P1-T4)", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/payroll/upload/not-a-real-upload-id/export/pdf",
    );
    expect(res.status()).toBe(404);
  });
});

test.describe("Staff export/pdf (P1-T5)", () => {
  test("GET /api/staff/:id/export/pdf returns a valid PDF for the authed agent", async ({
    page,
    request,
  }) => {
    const dispatcherId = await firstDispatcherId(page);
    test.skip(
      !dispatcherId,
      "No dispatchers seeded — cannot exercise route",
    );

    const res = await request.get(`/api/staff/${dispatcherId}/export/pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/application\/pdf/);
    const body = await res.body();
    expect(body.slice(0, 5).toString("utf8")).toBe("%PDF-");
  });

  test("GET /api/staff/:id/export/pdf returns 404 for an unknown dispatcherId", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/staff/not-a-real-dispatcher/export/pdf",
    );
    expect(res.status()).toBe(404);
  });
});

test.describe("Overview export/pdf (P1-T6)", () => {
  test("GET /api/overview/export/pdf honours filters and returns a valid PDF", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/overview/export/pdf?from=2026-01-01&to=2026-04-30",
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/application\/pdf/);
    const body = await res.body();
    expect(body.slice(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
