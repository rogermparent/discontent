import type { Locator } from "@playwright/test";
import { test, expect } from "../support/test";

/*
 * ⌘K.
 *
 * The corpus is fetched from `/search/all` on first open, not server-rendered
 * into the page — so an assertion on a *work* row has to outlast a network
 * round trip. That is what `expectWorksLoaded` is for. Note that asserting on
 * `getByRole("option")` alone proves nothing: the nav and appearance rows are
 * options too, and they are present before the fetch resolves.
 */

/** Wait for the fetched corpus to replace the loading row. */
async function expectWorksLoaded(dialog: Locator) {
  await expect(dialog.getByText("Loading works…")).toHaveCount(0);
  await expect(
    dialog.getByRole("option", { name: /Recipe Website/ }),
  ).toBeVisible();
}

test.describe("Command palette", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("projects");
    await page.goto("/");
  });

  test("opens with the keyboard shortcut and lists works", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectWorksLoaded(dialog);
  });

  test("opens from the masthead trigger too", async ({ page }) => {
    // The shortcut is an accelerator, not the only way in: the palette has to be
    // reachable by tap and by plain keyboard navigation.
    await page.getByRole("button", { name: "Search works" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("filters works and navigates to the chosen one", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Search works…").fill("recipe");

    const option = dialog.getByRole("option", { name: /Recipe Website/ });
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(/\/project\/recipe-website$/);
  });

  test("matches a tag, which cmdk's own filter would have dropped", async ({
    page,
  }) => {
    // The reason `shouldFilter={false}` is set: cmdk scores on rendered text, and
    // the tag is not rendered on the row — so a tag-only match would be filtered
    // out before it could ever be shown.
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Search works…").fill("oklch");

    await expect(
      dialog.getByRole("option", { name: /Discontent Design System/ }),
    ).toBeVisible();
  });

  test("says so when nothing matches", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Search works…").fill("zzzzznope");
    await expect(dialog.getByText("No works match.")).toBeVisible();
  });

  test("offers navigation and appearance commands", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByRole("option", { name: "About" })).toBeVisible();
    await expect(dialog.getByRole("option", { name: "Dark" })).toBeVisible();

    await dialog.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("Escape closes it", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
