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
    command: BUILD ? "pnpm start:test" : "pnpm dev:test",
    url: `http://localhost:${PORT}`,
    timeout: BUILD ? 180_000 : 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
