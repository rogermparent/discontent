import { defineConfig, devices } from "@playwright/test";

const PORT = 3011;
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
     * `pnpm build` first in BUILD mode, not just `pnpm start:test`.
     *
     * `next start` serves whatever `.next` happens to be on disk and nothing
     * here ever ran `next build`, so `PLAYWRIGHT_BUILD=1` was testing an
     * arbitrarily old build: two runs at two different commits failed
     * *identically* because the checked-out commit was irrelevant to what the
     * server was serving. The build belongs here rather than in the `e2e-start`
     * script because this is where the server mode is decided, so every entry
     * point — `e2e-start`, `e2e-start:headed`, a bare `PLAYWRIGHT_BUILD=1
     * playwright test` — inherits it.
     *
     * `build` sets no `CONTENT_DIRECTORY`, so it compiles against an absent
     * `content/`. That is harmless only because every route in `app/` is
     * `force-dynamic`, so nothing is prerendered and no content is read at
     * build time. Add `CONTENT_DIRECTORY=test-content` here if that changes.
     */
    command: BUILD ? "pnpm build && pnpm start:test" : "pnpm dev:test",
    url: `http://localhost:${PORT}`,
    /* BUILD now covers a webpack build as well as a boot. */
    timeout: BUILD ? 300_000 : 120_000,
    /*
     * Never reuse when a production build was asked for. Adopting a server
     * someone left on this port throws the build away and reports dev results
     * as a production run — the same lie the build fix above exists to remove,
     * arriving by a different door.
     */
    reuseExistingServer: !process.env.CI && !BUILD,
  },
});
