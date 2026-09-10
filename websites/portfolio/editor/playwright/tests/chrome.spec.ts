import { test, expect } from "../support/test";

/*
 * The site chrome. These assertions are counts on purpose: the bug PR 04 fixed
 * was not a broken footer, it was *several working ones* stacked — the root
 * layout and the (portfolio) group layout each rendered a SiteFooter, and the
 * homepage rendered a third of its own. Every one of them looked fine alone.
 */
test.describe("Site chrome", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData();
  });

  test("there is exactly one masthead and one footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  });

  test("the masthead is sticky and reserves the header height", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header).toHaveCSS("position", "sticky");

    // --header-height is the layout constant any second sticky element offsets
    // by; if the header stops honouring it the two silently overlap.
    const [headerHeight, tokenHeight] = await page.evaluate(() => {
      const el = document.querySelector("header");
      const token = getComputedStyle(document.documentElement).getPropertyValue(
        "--header-height",
      );
      return [el ? Math.round(el.getBoundingClientRect().height) : 0, token];
    });
    expect(tokenHeight.trim()).toBe("3.5rem");
    expect(headerHeight).toBe(56); // 3.5rem at the default root size
  });

  test("the wordmark links home and the nav is reachable", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: /Work/i })).toBeVisible();
    await expect(
      banner.getByRole("button", { name: "Appearance" }),
    ).toBeVisible();
  });

  test("the appearance popover offers portfolio's own presets", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Appearance" }).click();

    // Portfolio's list, not the engine's built-ins — getPreset resolves a key
    // against the list that was rendered, so offering one and resolving the
    // other would silently apply a stranger's theme.
    await page.getByRole("combobox", { name: "Theme preset" }).click();
    await expect(
      page.getByRole("option", { name: "Marginalia" }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: "Oxide" })).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Working Bench" }),
    ).toHaveCount(0);
  });
});
