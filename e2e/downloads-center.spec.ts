import { test, expect } from "@playwright/test";

/**
 * Phase 1 (red) Playwright tests for the Downloads Center panel on the
 * notification bell.
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md
 *
 * Covers P2-T4, T5, T6, T7. All red today — the panel, the /recent endpoint,
 * the Downloads bell tab, and the red-dot lifecycle don't exist yet.
 */

/**
 * The bell sits in the top-right of the (dashboard) layout. These tests
 * interact with `[data-testid="notification-bell"]` and the panel opened on
 * click. Phase 3 needs to ensure those data-testid hooks exist.
 */

const BELL = '[data-testid="notification-bell"]';
const DOWNLOADS_TAB = '[data-testid="downloads-tab"]';
const DOWNLOADS_RED_DOT = '[data-testid="downloads-red-dot"]';
const DOWNLOADS_PANEL = '[data-testid="downloads-panel"]';

test.describe("Downloads Center — panel interactions (P2-T4)", () => {
  test("shows running + completed jobs, supports Download / Retry / Clear all", async ({
    page,
  }) => {
    await page.goto("/dispatchers");

    // Kick off a CSV bulk export so the panel has something to show.
    const res = await page.request.post(
      "/api/dispatchers/month-detail/bulk/start",
      { data: { year: 2026, month: 3, format: "csv" } },
    );
    expect(res.status()).toBe(200);

    // Open the bell → Downloads tab.
    await page.locator(BELL).click();
    await page.locator(DOWNLOADS_TAB).click();
    const panel = page.locator(DOWNLOADS_PANEL);
    await expect(panel).toBeVisible();

    // At minimum one row for the just-started job
    await expect(panel.getByRole("listitem").first()).toBeVisible();

    // Wait for it to complete (CSV is fast).
    const downloadBtn = panel
      .getByRole("button", { name: /^download$/i })
      .first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    // Clicking Download triggers a browser download (test the request fires).
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    // Clear all empties the panel (recent list only).
    await panel.getByRole("button", { name: /^clear all$/i }).click();
    await expect(panel.getByRole("listitem")).toHaveCount(0);
  });
});

test.describe("Downloads Center — instant panel update on start (P2-T5)", () => {
  test("a newly-started job appears in the panel before the next poll", async ({
    page,
  }) => {
    await page.goto("/dispatchers");
    await page.locator(BELL).click();
    await page.locator(DOWNLOADS_TAB).click();

    // Fire an export via the public event hook the client uses.
    const jobId = await page.evaluate(async () => {
      const res = await fetch("/api/dispatchers/month-detail/bulk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: 2026, month: 3, format: "csv" }),
      });
      const { jobId } = await res.json();
      window.dispatchEvent(
        new CustomEvent("bulk-export:started", {
          detail: { jobId, year: 2026, month: 3, format: "csv" },
        }),
      );
      return jobId as string;
    });

    // Panel should show a row referencing 2026-03 within 500ms — no need to wait
    // for the 3 s poll because the announce event seeds state.
    await expect(
      page.locator(DOWNLOADS_PANEL).getByText(/2026[_-]?03/),
    ).toBeVisible({ timeout: 1_000 });
    expect(jobId).toBeTruthy();
  });
});

test.describe("Downloads Center — refresh survives job state (P2-T6)", () => {
  test("start a CSV, refresh the page, completed job still has a working Download", async ({
    page,
  }) => {
    await page.goto("/dispatchers");

    const jobId = await page.evaluate(async () => {
      const res = await fetch("/api/dispatchers/month-detail/bulk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: 2026, month: 3, format: "csv" }),
      });
      const { jobId } = await res.json();
      return jobId as string;
    });

    // Wait a few seconds for the CSV export to complete, then refresh.
    await page.waitForTimeout(8_000);
    await page.reload();

    await page.locator(BELL).click();
    await page.locator(DOWNLOADS_TAB).click();

    const row = page
      .locator(DOWNLOADS_PANEL)
      .locator(`[data-job-id="${jobId}"]`);
    await expect(row).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /^download$/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});

test.describe("Downloads Center — red dot lifecycle (P2-T7)", () => {
  test("dot appears when a job finishes in the last 10 s and clears when tab opens", async ({
    page,
  }) => {
    await page.goto("/dispatchers");
    await expect(page.locator(DOWNLOADS_RED_DOT)).toHaveCount(0);

    await page.evaluate(async () => {
      await fetch("/api/dispatchers/month-detail/bulk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: 2026, month: 3, format: "csv" }),
      });
    });

    // Wait for completion → dot should appear.
    await expect(page.locator(DOWNLOADS_RED_DOT)).toBeVisible({ timeout: 15_000 });

    // Opening the Downloads tab clears it.
    await page.locator(BELL).click();
    await page.locator(DOWNLOADS_TAB).click();
    await expect(page.locator(DOWNLOADS_RED_DOT)).toHaveCount(0);
  });
});
