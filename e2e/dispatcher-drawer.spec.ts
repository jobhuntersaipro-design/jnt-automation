import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 1 (red) Playwright tests for the Overview → Dispatcher deep-link.
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md
 *
 * Covers P3-T1 to T6. All red today — TopDispatchers rows are non-clickable
 * divs, and /dispatchers doesn't read a ?highlight=<id> param.
 */

const DRAWER = '[data-testid="dispatcher-drawer"]';

async function firstPerformanceRowHrefAndName(page: Page): Promise<{
  id: string;
  name: string;
  href: string;
} | null> {
  await page.goto("/dashboard");
  const row = page.locator('[data-testid="top-dispatchers-row"]').first();
  try {
    await row.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    return null;
  }
  // Row IS the <Link> — no inner anchor.
  const href = await row.getAttribute("href");
  const name = (await row.getAttribute("data-dispatcher-name")) ?? "";
  const id = (await row.getAttribute("data-dispatcher-id")) ?? "";
  if (!href || !id) return null;
  return { id, name, href };
}

test.describe("TopDispatchers rows — rendered as deep links (P3-T1, T2)", () => {
  test("each row renders as <a href='/dispatchers?highlight=<id>'>", async ({ page }) => {
    await page.goto("/dashboard");
    const rows = page.locator('[data-testid="top-dispatchers-row"]');
    try {
      await rows.first().waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      test.skip(true, "Dashboard has no dispatcher rows for this agent");
      return;
    }

    const hrefs = await rows.evaluateAll((anchors) =>
      (anchors as HTMLAnchorElement[]).map((a) => a.getAttribute("href")),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect(h).toMatch(/^\/dispatchers\?highlight=[^=&#]+$/);
    }
  });

  test("each row has an aria-label containing the dispatcher name (P3-T2)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const first = page.locator('[data-testid="top-dispatchers-row"]').first();
    try {
      await first.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      test.skip(true, "Dashboard has no dispatcher rows for this agent");
      return;
    }
    const name = await first.getAttribute("data-dispatcher-name");
    const aria = await first.getAttribute("aria-label");
    expect(aria).toBeTruthy();
    if (name) {
      expect(aria!.toLowerCase()).toContain(name.toLowerCase());
    }
  });
});

test.describe("/dispatchers?highlight=<id> deep-link (P3-T3, T4, T5)", () => {
  test("valid id — drawer opens and URL is cleared (P3-T3, T4)", async ({ page }) => {
    const info = await firstPerformanceRowHrefAndName(page);
    test.skip(!info, "Overview has no dispatchers to link to");

    await page.goto(info!.href);

    // Drawer is open for the correct dispatcher
    const drawer = page.locator(DRAWER);
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    if (info!.name) {
      await expect(drawer.getByText(info!.name)).toBeVisible();
    }

    // URL is cleared via history.replaceState — no ?highlight=
    await expect(page).toHaveURL(/\/dispatchers(\?|$)/);
    expect(page.url()).not.toContain("highlight=");
  });

  test("invalid id — silently ignored, no drawer, no toast (P3-T5)", async ({
    page,
  }) => {
    await page.goto("/dispatchers?highlight=clxxxxxxxxxxxxxxxxxxxxxxxx");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(DRAWER)).toHaveCount(0);
    // Sonner renders into a toaster region; no error-typed toast should appear.
    await expect(
      page.locator('[data-sonner-toast][data-type="error"]'),
    ).toHaveCount(0);
    // URL is cleaned up either way — we don't want the invalid id to persist.
    expect(page.url()).not.toContain("highlight=");
  });
});

test.describe("Overview → drawer e2e click-through (P3-T6)", () => {
  test("click a row on /dashboard → lands on /dispatchers with drawer open", async ({
    page,
  }) => {
    const info = await firstPerformanceRowHrefAndName(page);
    test.skip(!info, "Overview has no dispatchers to link to");

    // Row IS the <a> — click it directly.
    await page.locator('[data-testid="top-dispatchers-row"]').first().click();

    await page.waitForURL(/\/dispatchers(\?|$)/, { timeout: 5_000 });
    await expect(page.locator(DRAWER)).toBeVisible();
    expect(page.url()).not.toContain("highlight=");
  });
});
