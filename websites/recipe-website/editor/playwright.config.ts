import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3019;
const BUILD = !!process.env.PLAYWRIGHT_BUILD;

export default defineConfig({
  testDir: "./playwright",
  globalSetup: "./playwright/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  },
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}{-projectName}{ext}",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The app's default colour mode is "System"; Playwright already emulates
    // light, but pin it explicitly so visual baselines can't drift light/dark.
    colorScheme: "light",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "setup",
      testDir: "./playwright/tests",
      testMatch: /\.auth\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "e2e",
      testDir: "./playwright/tests",
      grepInvert: /@mobile/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testDir: "./playwright/tests",
      grep: /@mobile/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "generators",
      testDir: "./playwright/fixture-generators",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    /*
     * `pnpm build` first in BUILD mode. All three configs in this repo — this
     * one, portfolio's and the cms demo's — carried the identical defect:
     * `PLAYWRIGHT_BUILD=1` switched to `next start`, which serves whatever
     * `.next` is on disk, and nothing ever ran `next build`. So `e2e-start`
     * either failed outright on a clean checkout or, worse, silently tested a
     * stale build — which in the demo produced two runs at two different
     * commits failing identically. Fixed in all three at once: leaving two of
     * three is how it comes back.
     */
    command: BUILD ? "pnpm build && pnpm start:test" : "pnpm dev:test",
    url: `http://localhost:${PORT}`,
    /* BUILD now covers a build as well as a boot. */
    timeout: BUILD ? 300_000 : 120_000,
    /*
     * Never reuse when a production build was asked for: adopting a server left
     * on this port would throw the build away and report dev results as a
     * production run. See the demo's config for the incident.
     */
    reuseExistingServer: !process.env.CI && !BUILD,
  },
});
