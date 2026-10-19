import AxeBuilder from "@axe-core/playwright";
import { WCAG_TAGS } from "../support/a11y";
import { test, expect, type Page } from "../support/test";
import {
  narrowRow,
  openPalette,
  paletteIndexReady,
  paletteInput,
  searchFor,
  signIn,
} from "../support/helpers";

const SEARCH_TIMEOUT = 20_000;

const field = (page: Page) => page.getByLabel("Search recipes");
const ticker = (page: Page) =>
  page.getByRole("main").getByTestId("search-ticker");
const grid = (page: Page) => page.getByTestId("recipe-list").locator("> li");
const band = (page: Page, kind: "drinks" | "food") =>
  page.getByRole("region", { name: kind === "drinks" ? "Drinks" : "Food" });
const cardNames = (scope: ReturnType<Page["getByRole"]>) =>
  scope.getByRole("listitem").getByRole("heading");

const axeClean = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
};

/**
 * 43s — `/search` B, "Sorted by what it is". `drinks-bar` is the fixture with
 * both kinds (seven drinks; Hand Pies and Lavender Syrup are food), a spirit
 * root, and two dated holidays. The clock is the canvas's day, 18 October
 * 2026: Halloween in 13 days, Christmas in 68.
 */
test.describe("Search — sorted by what it is", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(new Date(2026, 9, 18, 12));
    await page.goto("/search");
    await expect(ticker(page)).toHaveText("All 9 recipes · 7 drinks · 2 food", {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("results of both kinds band into Drinks and Food, the best match's band first", async ({
    page,
  }) => {
    await searchFor(page, "syrup");
    /* Lavender Syrup is named for it: Food leads. */
    const regions = page.getByRole("main").getByRole("region");
    await expect(regions).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(regions.nth(0)).toHaveAccessibleName("Food");
    await expect(regions.nth(1)).toHaveAccessibleName("Drinks");
    await expect(cardNames(band(page, "food")).first()).toHaveText(
      "Lavender Syrup",
    );

    /* Five drinks: four cards, one name on the Also line. */
    const drinks = band(page, "drinks");
    await expect(drinks.getByRole("listitem")).toHaveCount(4);
    await expect(drinks.getByText(/^Also:/)).toBeVisible();
    await expect(drinks.getByText(/^Also:/).getByRole("link")).toHaveCount(1);
    await expect(ticker(page)).toHaveText(
      "6 results · “syrup” · 5 drinks · 1 food",
    );
    await expect(page.getByTestId("recipe-list")).toHaveCount(0);

    /* "All 5 drinks" writes the Kind; the page is then one grid. */
    await drinks.getByRole("button", { name: "All 5 drinks" }).click();
    await expect(field(page)).toHaveValue("syrup tag:drink");
    await expect(grid(page)).toHaveCount(5);
    await expect(page.getByRole("region", { name: "Food" })).toHaveCount(0);
    await axeClean(page);
  });

  test("the Narrow column counts inside the results, and its rows are the query", async ({
    page,
  }) => {
    const narrow = page.getByTestId("narrow");
    await expect(narrow.getByRole("group", { name: "Kind" })).toBeVisible();
    await expect(narrowRow(page, "Drinks")).toHaveText("Drinks 7");
    await expect(narrowRow(page, "Food")).toHaveText("Food 2");
    await expect(narrowRow(page, "Vodka")).toHaveText("Vodka 2");

    /* Kind writes `tag:drink`, and reads back pressed. */
    await narrowRow(page, "Drinks").click();
    await expect(field(page)).toHaveValue("tag:drink");
    await expect(grid(page)).toHaveCount(7, { timeout: SEARCH_TIMEOUT });
    await expect(narrowRow(page, "Drinks")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    /* Food is the negation; pressing it swaps the one term for the other. */
    await narrowRow(page, "Food").click();
    await expect(field(page)).toHaveValue("-tag:drink");
    await expect(grid(page)).toHaveCount(2);
    await narrowRow(page, "Food").click();
    await expect(field(page)).toHaveValue("");

    /* A facet row adds its term; counts are now inside these results. */
    await searchFor(page, "lime");
    await expect(grid(page)).toHaveCount(4, { timeout: SEARCH_TIMEOUT });
    await expect(narrowRow(page, "Vodka")).toHaveText("Vodka 1");
    await narrowRow(page, "Vodka").click();
    await expect(field(page)).toHaveValue("lime tag:vodka");
    await expect(grid(page)).toHaveCount(1);
    await expect(narrowRow(page, "Vodka")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await narrowRow(page, "Vodka").click();
    await expect(field(page)).toHaveValue("lime");
    await expect(narrow).toContainText("Each adds its tag: to the search.");
  });

  test("cards say what a drink is and why it matched, the amount in mono", async ({
    page,
  }) => {
    await searchFor(page, "lime");
    const daiquiri = grid(page).filter({
      has: page.getByRole("heading", { name: "Daiquiri", exact: true }),
    });
    await expect(daiquiri).toBeVisible({ timeout: SEARCH_TIMEOUT });
    const why = daiquiri.getByTestId("card-why");
    await expect(why).toHaveText("1 oz lime juice");
    await expect(why.locator("b")).toHaveText("1 oz");
    await expect(why.locator("mark")).toHaveText("lime");

    const sour = grid(page).filter({
      has: page.getByRole("heading", { name: "Vodka Sour" }),
    });
    await expect(sour.getByTestId("card-meta")).toHaveText("Sour");
  });

  test("a tag: query opens on its term, then bands by date", async ({
    page,
  }) => {
    await narrowRow(page, "Vodka").click();
    await expect(field(page)).toHaveValue("tag:vodka");

    const term = page.getByTestId("search-term-card");
    await expect(term).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(term.getByRole("heading", { name: "Vodka" })).toBeVisible();
    await expect(term).toContainText("Spirit & base");
    await expect(term).toContainText("2 recipes");
    await expect(
      term.getByRole("link", { name: "Open the Vodka page" }),
    ).toHaveAttribute("href", "/tags/vodka");

    /* Halloween comes round first; neither band leaves an "Any time". */
    const bands = page.getByTestId("season-band");
    await expect(bands).toHaveCount(2);
    await expect(bands.nth(0)).toHaveAccessibleName("Halloween");
    await expect(bands.nth(0)).toContainText("1 · in 13 days");
    await expect(bands.nth(0)).toContainText("Vodka Sour");
    await expect(bands.nth(1)).toHaveAccessibleName("Christmas");
    await expect(bands.nth(1)).toContainText("1 · in 68 days");
    await expect(page.getByRole("region", { name: "Any time" })).toHaveCount(0);
    await axeClean(page);
  });

  test("a search that finds nothing says what it looked through, and where to go", async ({
    page,
  }) => {
    await searchFor(page, "quince");
    const empty = page.getByTestId("search-no-results");
    await expect(
      empty.getByRole("heading", { name: "Nothing mentions quince" }),
    ).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(empty).toContainText(
      "Not a name, tag, ingredient or description in 9 recipes.",
    );
    await expect(
      empty.getByRole("link", { name: "Import a recipe" }),
    ).toHaveCount(0);
    await expect(
      empty.getByRole("link", { name: /^Spirit & base 2 terms$/ }),
    ).toHaveAttribute("href", "/tags/spirit");
    await expect(
      empty.getByRole("link", { name: /^Holidays 2 terms$/ }),
    ).toHaveAttribute("href", "/tags/holidays");
    await axeClean(page);

    await empty.getByRole("button", { name: "Clear search" }).click();
    await expect(field(page)).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^All 9 recipes/);
  });

  test("the signed-in owner is offered an import when nothing matches", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/search?q=quince");
    await expect(
      page
        .getByTestId("search-no-results")
        .getByRole("link", { name: "Import a recipe" }),
    ).toHaveAttribute("href", "/new-recipe", { timeout: SEARCH_TIMEOUT });
  });

  test("the masthead keeps its search trigger off /search", async ({
    page,
  }) => {
    const banner = page.getByRole("banner");
    await expect(
      banner.getByRole("button", { name: /^Search \d+ recipes$/ }),
    ).toHaveCount(0);
    await page.goto("/");
    await expect(
      banner.getByRole("button", { name: /^Search \d+ recipes$/ }),
    ).toBeVisible();
  });

  test("tag completions carry what accepting them finds", async ({ page }) => {
    await field(page).click();
    await field(page).pressSequentially("tag:vod");
    const option = page.getByTestId("query-autocomplete-option");
    await expect(option).toHaveCount(1);
    await expect(option.getByTestId("query-autocomplete-label")).toHaveText(
      "Vodka",
    );
    await expect(option.getByTestId("query-autocomplete-count")).toHaveText(
      "2",
    );
  });
});

test.describe("Search — a term's description", () => {
  test("tag:cookies shows the record's place and description", async ({
    page,
    resetData,
  }) => {
    await resetData("christmas-cookies");
    await page.goto("/search?q=tag%3Acookies");
    const term = page.getByTestId("search-term-card");
    await expect(term).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(term).toContainText("Dessert");
    await expect(term).toContainText("Small, sweet, baked one tray at a time.");
    /* No holidays root here: the results are one grid. */
    await expect(page.getByTestId("recipe-list").locator("> li")).toHaveCount(
      8,
    );
  });
});

test.describe("Command palette — the hand-over row", () => {
  test("ends in 'All N results in search', and Ctrl ↵ opens it", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.goto("/");
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("syrup");

    const recipes = page
      .getByTestId("palette-recipes-group")
      .getByRole("option");
    const all = recipes.last();
    await expect(all).toContainText("All 6 results in search", {
      timeout: SEARCH_TIMEOUT,
    });
    await expect(all).toContainText("5 drinks · 1 food");
    /* The top recipe keeps the highlight: plain ↵ still opens it. */
    await expect(recipes.first()).toHaveAttribute("data-selected", "true");

    await paletteInput(page).press("ControlOrMeta+Enter");
    await page.waitForURL(/\/search\?q=syrup$/);
    await expect(ticker(page)).toHaveText(/^6 results/, {
      timeout: SEARCH_TIMEOUT,
    });
  });
});

test.describe("Search — the Narrow sheet @mobile", () => {
  test("the column is a sheet on a phone, and nothing scrolls sideways", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/^All 9 recipes/, {
      timeout: SEARCH_TIMEOUT,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Narrow", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Narrow these results" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /^Vodka \d+$/ }).click();
    await expect(field(page)).toHaveValue("tag:vodka");
    await axeClean(page);
  });
});
