import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Playwright E2E config for EasyStaff.
 *
 * Tests live in `e2e/`. Login happens once in the `setup` project, which
 * writes an authenticated browser state to `e2e/.auth/user.json`; all other
 * tests reuse it via `storageState`. Credentials come from env vars so nothing
 * sensitive lives in the repo.
 */
export default defineConfig({
  testDir: "./e2e",
  // Run tests serially by default — the app shares a single Neon branch in dev
  // and many scenarios mutate state. Individual specs can opt into parallel.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
