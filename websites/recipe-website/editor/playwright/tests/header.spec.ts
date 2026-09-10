import { test, expect } from "../support/test";
import { snapshotLocator } from "../support/visual";

test.describe("Masthead", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("is a single sticky row with the wordmark on the left", async ({
    page,
  }) => {
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible();

    // Wordmark is the first link and returns home.
    const wordmark = banner.getByRole("link").first();
    await expect(wordmark).toHaveAttribute("href", "/");

    // Sticky positioning is what keeps the masthead in reach while scrolling.
    await expect(banner).toHaveCSS("position", "sticky");

    await snapshotLocator(banner, "masthead-signed-out.png");
  });

  test("Appearance popover exposes the theme + preset controls", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Appearance" }).click();

    // The color-mode segmented control (labelled "Color mode") and the preset
    // select both live inside the one popover now, replacing the two loose
    // controls that used to clutter the bar.
    await expect(page.getByRole("group", { name: "Color mode" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "System" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Theme preset" }),
    ).toBeVisible();

    // The reader's sticky-header control shares the panel (site-specific knob
    // threaded in via `extraControls`). Behaviour lives in sticky-chrome.spec.ts;
    // its presence belongs here, with the rest of the popover contract.
    await expect(
      page.getByRole("group", { name: "Sticky headers" }),
    ).toBeVisible();
  });

  test("switching to Dark mode from the popover takes effect", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Appearance" }).click();
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("Masthead @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("hamburger sheet still lists nav + appearance controls", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Bookmarks" })).toBeVisible();
    await expect(
      dialog.getByRole("group", { name: "Color mode" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("combobox", { name: "Theme preset" }),
    ).toBeVisible();
  });
});
