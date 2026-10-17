import { defineConfig, devices } from "@playwright/test";

const PORT = 3010;
const BUILD = !!process.env.PLAYWRIGHT_BUILD;

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "e2e",
      testDir: "./playwright/tests",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "generators",
      testDir: "./playwright/fixture-generators",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    /*
     * `pnpm build` first in BUILD mode, as portfolio's and the cms demo's
     * configs do: `next start` alone serves whatever `.next` is on disk, so
     * `e2e-start` failed on a clean checkout (CI) or quietly tested a stale
     * build.
     */
    command: BUILD ? "pnpm build && pnpm start:test" : "pnpm dev:test",
    url: `http://localhost:${PORT}`,
    /* BUILD covers a build as well as a boot. */
    timeout: BUILD ? 300_000 : 120_000,
    /* Never adopt a leftover server when a production build was asked for. */
    reuseExistingServer: !process.env.CI && !BUILD,
  },
});
