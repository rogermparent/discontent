import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { snapshotPage, snapshotLocator } from "../support/visual";

/*
 * Portfolio's first visual baselines.
 *
 * `support/visual.ts` has existed since the harness landed — already customized
 * to mask `[data-testid='project-date']` so a baseline does not expire with the
 * calendar — and was never called by anything. These are the specs it was
 * written for.
 *
 * Baselines must be generated **inside the container**
 * (`docker compose -f docker-compose.test.yml run --rm portfolio`), never on the
 * host: font rasterization differs, so host-made baselines fail in CI and
 * nowhere else. Note also that `--update-snapshots` will not rewrite a
 * *sub-tolerance* diff — if a baseline is stale but within `maxDiffPixelRatio`,
 * delete the file instead.
 */
test.describe("Visual baselines @visual", () => {
  test("the index", async ({ page, resetData }) => {
    await resetData("projects");
    await page.goto("/");
    await snapshotPage(page, "index.png");
  });

  test("the index, filtered", async ({ page, resetData }) => {
    // The signature interaction: rows filter in place, matches take the accent.
    await resetData("projects");
    await page.goto("/");
    await page.getByLabel("Filter works").fill("engine");
    await expect(page.getByText(/^1 work/)).toBeVisible();
    await snapshotPage(page, "index-filtered.png");
  });

  test("the empty index", async ({ page, resetData }) => {
    await resetData();
    await page.goto("/");
    await snapshotPage(page, "index-empty.png");
  });

  test("a case study", async ({ page, resetData }) => {
    await resetData("projects");
    await page.goto("/project/content-engine");
    await snapshotPage(page, "case-study.png");
  });

  test("the masthead", async ({ page, resetData }) => {
    await resetData("projects");
    await page.goto("/");
    await snapshotLocator(page.getByRole("banner"), "masthead.png");
  });

  test("the command palette", async ({ page, resetData }) => {
    await resetData("projects");
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The corpus arrives over `/search/all`, so "dialog is visible" is not
    // "dialog is settled" — without this the baseline races the loading row.
    await expect(dialog.getByText("Loading works…")).toHaveCount(0);
    await expect(
      dialog.getByRole("option", { name: /Recipe Website/ }),
    ).toBeVisible();
    await snapshotLocator(dialog, "command-palette.png");
  });

  test("the project form", async ({ page, resetData }) => {
    await resetData();
    await page.goto("/projects");
    await fillSignInForm(page);
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await markdownEditorReady(page, "content");
    await expect(page.getByLabel("Name")).toBeVisible();
    await snapshotPage(page, "project-form.png");
  });

  test("the settings sidebar", async ({ page, resetData }) => {
    await resetData();
    await page.goto("/settings");
    await fillSignInForm(page);
    await expect(page.getByLabel("Title")).toBeVisible();
    await snapshotPage(page, "settings.png");
  });
});

test.describe("Visual baselines — postures @visual", () => {
  for (const posture of ["index", "studio", "resume"] as const) {
    test(`the ${posture} posture`, async ({
      page,
      resetData,
      writeSettings,
    }) => {
      await resetData("projects");
      await writeSettings({ posture });
      await page.goto("/");
      await expect(page.locator("main")).toHaveAttribute(
        "data-posture",
        posture,
      );
      await snapshotPage(page, `posture-${posture}.png`);
    });
  }
});
