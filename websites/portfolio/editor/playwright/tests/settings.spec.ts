import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";

/*
 * The settings area.
 *
 * Portfolio had no settings module at all — no Settings type, no store, and a
 * `/settings` route that rendered a bare <h1>. The posture picker is the part
 * that changes what the site *is*: `SITE_LAYOUT` was read-only, so the three
 * postures could only be switched by editing the environment and rebuilding,
 * which made the central "one template, three audiences" decision inaccessible
 * to the person the template is for.
 */
test.describe("Settings", () => {
  test("needs authorization", async ({ page, resetData }) => {
    await resetData();
    await page.goto("/settings");
    await expect(
      page.getByRole("button", {
        name: "Sign in with Credentials",
        exact: true,
      }),
    ).toBeVisible();
  });

  test.describe("when authenticated", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("projects");
      await page.goto("/settings");
      await fillSignInForm(page);
    });

    test("the sidebar marks exactly the current area", async ({ page }) => {
      // The nav this replaced tested `href.startsWith(pathname)`, which has the
      // operands backwards: on "/" every item matched, and on a nested route
      // none did.
      const nav = page.getByRole("navigation").first();
      await expect(
        nav.getByRole("link", { name: "Site details" }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        nav.getByRole("link", { name: "Appearance" }),
      ).not.toHaveAttribute("aria-current", "page");

      await nav.getByRole("link", { name: "Appearance" }).click();
      await expect(
        nav.getByRole("link", { name: "Appearance" }),
      ).toHaveAttribute("aria-current", "page");
      // "/settings" must not stay lit on "/settings/theme".
      await expect(
        nav.getByRole("link", { name: "Site details" }),
      ).not.toHaveAttribute("aria-current", "page");
    });

    test("changing the posture changes the rendered homepage", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator("main")).toHaveAttribute(
        "data-posture",
        "index",
      );

      await page.goto("/settings");
      // Exact: the hint is `aria-describedby`, so the radio's accessible name
      // is just the posture's label. That is the point — a hint folded into the
      // name made this option collide with the Statement field.
      await page.getByRole("radio", { name: "Studio", exact: true }).check();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Settings saved.")).toBeVisible();

      await page.goto("/");
      await expect(page.locator("main")).toHaveAttribute(
        "data-posture",
        "studio",
      );
      // Still the same site: same corpus, same filter.
      await expect(page.getByLabel("Filter works")).toBeVisible();
    });

    test("site details reach the rendered site", async ({ page }) => {
      await page.getByLabel("Title").fill("Roger Parent");
      await page.getByLabel("Statement").fill("Builds content systems.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Settings saved.")).toBeVisible();

      await page.goto("/");
      await expect(page.getByText("Builds content systems.")).toBeVisible();
    });

    test("the appearance editor saves a theme", async ({ page }) => {
      await page.goto("/settings/theme");
      // By role, not getByLabel: "Preset" also substring-matches the
      // "New preset name" input beside it.
      await page.getByRole("combobox", { name: "Preset" }).click();
      // Portfolio's own presets, not the engine's — this option only exists
      // because `builtInPresets` is overridden.
      await page.getByRole("option", { name: "Stamp" }).click();
      await page
        .getByRole("button", { name: "Save as site default", exact: true })
        .click();
      await expect(page.getByText("Settings saved.")).toBeVisible();
    });

    test("the export page offers Build and Deploy", async ({ page }) => {
      // Both buttons used to post to /build and /deploy — route handlers that
      // PR 02 deleted, so the form submitted to a 404. They are server actions
      // now; this asserts they are present and wired, not that a build runs.
      await page.goto("/export");
      await expect(
        page.getByRole("button", { name: "Build", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Deploy", exact: true }),
      ).toBeVisible();
    });
  });
});
