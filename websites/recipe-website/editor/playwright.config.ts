import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

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
      /*
       * 42b: an absolute pixel budget, not a ratio. `maxDiffPixelRatio: 0.02`
       * passed all 50 baselines that no longer matched their pages (41d2,
       * Tp1): 2 % of a 1280×3300 page is 84 000 px, and a redrawn input
       * border is ~500. Measured in CI's image against the committed
       * baselines, 3× in build and 3× in dev mode, every capture is within
       * 1 px at threshold 0 except the edit form's resampled preview image
       * (its own allowance in visual.spec.ts). 100 px still fails 48 of
       * those 50; the two it passes moved only text antialiasing.
       * `threshold` is pixelmatch's default, spelled out. Never set a
       * `maxDiffPixelRatio` beside these, here or per call: Playwright then
       * takes the smaller of the two budgets.
       */
      threshold: 0.2,
      maxDiffPixels: 100,
      scale: "css",
      /* 42b: hides `next dev`'s badge; see the file. */
      stylePath: "./playwright/support/screenshot.css",
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
    /*
     * No local model in the suite (epic 36, T18), even in a checkout whose
     * `editor/.env` sets one: Playwright spawns with `{...process.env,
     * ...env}`, and `@next/env` never overrides a variable already set, `""`
     * included — so the form's toggle, the Tools card, the visual baselines
     * and the fixtures' auto-mode imports all see "not configured". A dev
     * server reused from outside (`reuseExistingServer`) keeps its own env.
     */
    env: {
      RECIPE_LLM_URL: "",
      /* 38g: nor the Claude API — `anthropic` turns on with a key alone,
       * and would send a stand-in Claude's request shape. */
      RECIPE_LLM_API: "",
      RECIPE_LLM_API_KEY: "",
      /* 38e: nor a vision model — `photo-import.spec` turns one on through
       * `/settings/test-llm?vision=`, read by its loopback stand-in. */
      RECIPE_LLM_VISION_MODEL: "",
      /*
       * Epic 37: the server's import jobs go to `test-jobs`, beside
       * `test-content` — never `editor/jobs/`, even when `editor/.env`
       * names a jobs directory.
       */
      RECIPE_JOBS_DIR: resolve(__dirname, "test-jobs"),
      /*
       * 37b: and its queue inside it — never the machine's
       * (`~/.cache/discontent/queue`), even when `editor/.env` names one —
       * with no GPU hooks, so an e2e import never waits behind a real one or
       * pauses a real GPU program.
       */
      RECIPE_QUEUE_DIR: resolve(__dirname, "test-jobs", "queue"),
      RECIPE_GPU_ACQUIRE_CMD: "",
      RECIPE_GPU_RELEASE_CMD: "",
      /*
       * 38b: the form's Save downloads an imported recipe's image on the
       * site's queue, the polite gap after the last request there. A few
       * `new-recipe` fixtures name a real host's image (kingarthurbaking.com),
       * saved test after test, which would wait 15 s each — so the gap is 0
       * here, as it is under vitest (`test/setupTests.js`). Loopback, which
       * every other fixture uses, is never paced.
       */
      RECIPE_POLITE_GAP_MS: "0",
      /*
       * 44d: nor a search service — the curator's head says whether web
       * search is on, and its baselines must not depend on `editor/.env`;
       * no spec ever reaches a real SearXNG.
       */
      RECIPE_SEARCH_URL: "",
    },
  },
});
