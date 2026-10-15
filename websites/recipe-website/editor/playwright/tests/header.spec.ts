import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { snapshotLocator } from "../support/visual";

/** The masthead's destinations, in order (usability pass, U2). */
const READER_DESTINATIONS = [
  ["Recipes", "/recipes"],
  ["Drinks", "/drinks"],
  ["What can I make?", "/make"],
  ["Plans", "/groups"],
  ["Saved", "/bookmarks"],
] as const;

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

  test("lists the site's destinations, with no Home", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("banner").getByRole("navigation", {
      name: "Site",
    });
    const links = nav.getByRole("link");
    await expect(links).toHaveText(READER_DESTINATIONS.map(([name]) => name));
    for (const [name, href] of READER_DESTINATIONS) {
      await expect(
        nav.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", href);
    }
    /* The wordmark links home; a Home link would repeat it. Shopping is the
     * owner's: a guest's page would only send them to sign in. */
    await expect(nav.getByRole("link", { name: "Home" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Shopping" })).toHaveCount(0);
  });

  test("the signed-in owner also gets Shopping", async ({ page }) => {
    await page.goto("/");
    await signIn(page);
    const nav = page.getByRole("banner").getByRole("navigation", {
      name: "Site",
    });
    await expect(
      nav.getByRole("link", { name: "Shopping", exact: true }),
    ).toHaveAttribute("href", "/shopping");
    await expect(nav.getByRole("link")).toHaveText([
      "Recipes",
      "Drinks",
      "What can I make?",
      "Plans",
      "Shopping",
      "Saved",
    ]);
  });

  test("marks the current page, numbered pages included", async ({ page }) => {
    const nav = page.getByRole("banner").getByRole("navigation", {
      name: "Site",
    });
    for (const [name, href] of READER_DESTINATIONS) {
      await page.goto(href);
      await expect(
        nav.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(nav.locator("[aria-current=page]")).toHaveCount(1);
    }
    /* A recipe of its own is not the Recipes page. */
    await page.goto("/recipe/first-recipe");
    await expect(nav.locator("[aria-current=page]")).toHaveCount(0);
  });

  test("the search field counts the recipes and opens the palette", async ({
    page,
  }) => {
    await page.goto("/");
    const field = page
      .getByRole("banner")
      .getByRole("button", { name: "Search 3 recipes", exact: true });
    await expect(field).toBeVisible();
    await expect(field).toContainText("Search 3 recipes");
    await field.click();
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
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

  test("no phone tab bar on a desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("phone-tab-bar")).toBeHidden();
  });
});

test.describe("Masthead @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("hamburger sheet holds what the tab bar doesn't, + appearance", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("link", { name: "Plans", exact: true }),
    ).toBeVisible();
    /* The tab bar's four live there, not here. */
    await expect(dialog.getByRole("link", { name: "Saved" })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Recipes" })).toHaveCount(0);
    await expect(
      dialog.getByRole("group", { name: "Color mode" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("combobox", { name: "Theme preset" }),
    ).toBeVisible();
  });

  test("the masthead keeps a search icon that opens the palette", async ({
    page,
  }) => {
    await page.goto("/");
    const banner = page.getByRole("banner");
    /* The desktop row is hidden: no inline destinations on a phone. */
    await expect(banner.getByRole("navigation", { name: "Site" })).toBeHidden();
    const search = banner.getByRole("button", { name: "Search 3 recipes" });
    const box = await search.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await search.click();
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
  });

  test("the tab bar: four destinations, current marked, thumb-sized", async ({
    page,
  }) => {
    const tabs = page.getByTestId("phone-tab-bar");
    await page.goto("/drinks");
    await expect(tabs.getByRole("link")).toHaveText([
      "Recipes",
      "Drinks",
      "Make",
      "Saved",
    ]);
    for (const link of await tabs.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    await expect(tabs.getByRole("link", { name: "Drinks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabs.locator("[aria-current=page]")).toHaveCount(1);

    await tabs.getByRole("link", { name: "Saved" }).click();
    await expect(page).toHaveURL(/\/bookmarks$/);
    await expect(tabs.getByRole("link", { name: "Saved" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      tabs.getByRole("link", { name: "Drinks" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("the tab bar pins to the bottom and never covers the page's end", async ({
    page,
  }) => {
    await page.goto("/recipes");
    const tabs = page.getByTestId("phone-tab-bar");
    await expect(tabs).toHaveCSS("position", "sticky");
    const viewport = page.viewportSize()!;
    const pinned = await tabs.boundingBox();
    expect(Math.round(pinned!.y + pinned!.height)).toBe(viewport.height);

    /* At the end of the page the footer's last line sits above it. */
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const colophon = page
      .getByRole("contentinfo")
      .getByText("Built on Content Engine");
    const end = await colophon.boundingBox();
    const bar = await tabs.boundingBox();
    expect(end!.y + end!.height).toBeLessThanOrEqual(bar!.y);
  });

  test("the tab bar follows the sticky-headers setting", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("recipe-sticky-chrome", "off"),
    );
    await page.goto("/recipes");
    await expect(page.getByTestId("phone-tab-bar")).toHaveCSS(
      "position",
      "static",
    );
  });

  test("print leaves the tab bar out", async ({ page }) => {
    await page.goto("/recipes");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("phone-tab-bar")).toBeHidden();
  });
});
