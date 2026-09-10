import { test, expect } from "../support/test";

/*
 * The harness's own test. Everything after PR 03 is verified through this
 * machinery, so it needs one spec that fails loudly if the machinery itself
 * breaks — a fixture that no longer resets content, or a design system that has
 * gone inert again, would otherwise show up as a confusing failure somewhere
 * else entirely.
 */
test.describe("Harness", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData();
  });

  test("the homepage renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("the design system is actually applied", async ({ page }) => {
    await page.goto("/");

    // The regression this guards is specific and was live until PR 02: the
    // shared theme.css was never imported and the @source globs pointed at
    // directories that do not exist, so every token utility resolved to
    // nothing and the page was painted by a single hardcoded slate colour.
    // A build passes either way, so assert on computed style.
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        background: root.getPropertyValue("--background").trim(),
        foreground: root.getPropertyValue("--foreground").trim(),
        headerHeight: root.getPropertyValue("--header-height").trim(),
        display: root.getPropertyValue("--ff-display").trim(),
      };
    });

    // Match a colour *function*, not the literal "oklch": Chrome normalises an
    // authored oklch() custom property to lab() in the computed value. What
    // matters is that the property resolves to a colour at all — before PR 02
    // these came back as the empty string.
    const COLOR = /^(oklch|lab|rgb|color)\(/;
    expect(tokens.background).toMatch(COLOR);
    expect(tokens.foreground).toMatch(COLOR);
    expect(tokens.headerHeight).toBe("3.5rem");
    // Portfolio's own typeface, not recipe's and not a system fallback.
    //
    // This assertion earned its keep: theme.css binds the font roles to the
    // "bench" pairing, which is *recipe's*. Portfolio never registers that key,
    // so until globals.css declared its own default binding every heading
    // silently resolved to ui-sans-serif via the --ff-*-fallback chain — a
    // green build, a rendered page, and the wrong font.
    //
    // The computed value is the resolved family ("Fraunces", "Fraunces
    // Fallback"), not the var() name, which is the stronger thing to assert.
    expect(tokens.display).toContain("Fraunces");

    // And the body actually takes the token, rather than a stray slate.
    const bodyColor = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the test-mode cache route answers @mobile", async ({ request }) => {
    // Also the fingerprint global-setup relies on; if this regresses, every
    // run fails at setup with a confusing "wrong server" error.
    const response = await request.get("/settings/test-invalidate-cache");
    expect(response.ok()).toBe(true);
  });
});
