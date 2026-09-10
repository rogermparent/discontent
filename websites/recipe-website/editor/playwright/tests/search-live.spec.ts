import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "../support/test";
import { searchFor } from "../support/helpers";

const SEARCH_TIMEOUT = 20_000;

const searchField = (page: Page) => page.getByLabel("Search recipes");
const ticker = (page: Page) => page.getByTestId("search-ticker");

// Direct-child cards only — a card's matched-ingredient <ul><li> would
// otherwise be counted as extra list items.
const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

const cardNamed = (page: Page, name: string | RegExp) =>
  listItems(page).filter({ has: page.getByRole("heading", { name }) });

test.describe("Search — live", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    // The index populates from /search/all plus /search/ingredients before any
    // query can resolve.
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("filters as you type, with no Submit button", async ({ page }) => {
    // The old utilitarian form is gone: there is nothing to press.
    await expect(
      page.getByRole("button", { name: "Submit", exact: true }),
    ).toHaveCount(0);

    // Typing alone — no Enter, no click — narrows the results.
    await searchField(page).fill("tomato");

    await expect(cardNamed(page, "Tomato Basil Soup")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(ticker(page)).toHaveText(/RESULT/i);
    await expect(ticker(page)).toContainText("tomato");
  });

  test("a multi-word query still matches when one term is nonsense", async ({
    page,
  }) => {
    // `suggest: true`. Without it a single unmatched term zeroed the whole
    // result set, so this returned nothing at all.
    await searchFor(page, "chocolate jujubezzz");

    await expect(cardNamed(page, "Chocolate Truffle Cake")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("accent folding surfaces an accented recipe from a plain query", async ({
    page,
  }) => {
    await searchFor(page, "creme");

    const card = cardNamed(page, /Crème Brûlée/);
    await expect(card).toBeVisible({ timeout: SEARCH_TIMEOUT });
    // …and the UI highlights the fold, rather than matching blind.
    await expect(card.locator("mark").first()).toBeVisible();
  });

  test("descriptions are searchable and render as a highlighted snippet", async ({
    page,
  }) => {
    // "pomegranate" appears only in Weeknight Skillet's description.
    await searchFor(page, "pomegranate");

    const card = cardNamed(page, "Weeknight Skillet");
    await expect(card).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(card.getByText(/one-pan supper glazed with/)).toBeVisible();
    await expect(
      card.locator("mark", { hasText: "pomegranate" }),
    ).toBeVisible();
  });

  test("a description's second paragraph is searchable too", async ({
    page,
  }) => {
    /*
     * F23. Weeknight Skillet's description is the corpus's one piece of real
     * prose — two paragraphs, with an inline link in the second — and
     * "smokehouse" appears only inside that link's text. The old flattener kept
     * a description only when its compiled children were a bare string, so
     * every multi-paragraph description indexed as "" and this found nothing.
     */
    await searchFor(page, "smokehouse");

    const card = cardNamed(page, "Weeknight Skillet");
    await expect(card).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(card.locator("mark", { hasText: "smokehouse" })).toBeVisible();
  });

  test("a name hit outranks an ingredient-only hit for the same term", async ({
    page,
  }) => {
    // Ranking now rests entirely on `document.index` declaration order
    // (name > tags > ingredients > description) — there is no JS re-tiering
    // left to catch a regression here.
    await searchFor(page, "ginger");

    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(listItems(page).first().getByRole("heading")).toHaveText(
      "Ginger Cookies",
    );
    await expect(listItems(page).nth(1).getByRole("heading")).toHaveText(
      "Carrot Slaw",
    );
  });

  test("recent searches remember committed queries and re-run on click", async ({
    page,
  }) => {
    // Nothing is recorded until a query is committed.
    await expect(page.getByLabel(/Search again for/)).toHaveCount(0);

    await searchFor(page, "sourdough");
    await expect(cardNamed(page, "Sourdough Loaf")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });

    // Clearing the field returns to the idle browse view, where RECENT shows.
    await searchFor(page, "");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i);

    const chip = page.getByLabel("Search again for sourdough");
    await expect(chip).toBeVisible();

    await chip.click();
    await expect(cardNamed(page, "Sourdough Loaf")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    // A chip is a commit surface, not a browse one — it hides while active.
    await expect(chip).toHaveCount(0);

    // Clear wipes the row.
    await searchFor(page, "");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i);
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByLabel(/Search again for/)).toHaveCount(0);
  });

  test("typing does not stack browser history", async ({ page }) => {
    // The URL sync replaces rather than pushes, so a live field can't bury the
    // previous page under one entry per keystroke.
    const before = await page.evaluate(() => history.length);

    await searchField(page).fill("chocolate");
    await expect(cardNamed(page, "Chocolate Truffle Cake")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(page).toHaveURL(/[?&]q=chocolate/);

    expect(await page.evaluate(() => history.length)).toBe(before);
  });

  test("the results grid caps at 60 cards and reveals the rest on demand", async ({
    page,
  }) => {
    // 67 recipes in the corpus; the browse view renders the first 60.
    await expect(listItems(page)).toHaveCount(60);
    // The ticker reports the *total*, so the cap never misstates the set.
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i);

    const showMore = page.getByRole("button", { name: "Show 7 more" });
    await expect(showMore).toBeVisible();
    await showMore.click();

    await expect(listItems(page)).toHaveCount(67);
    await expect(showMore).toHaveCount(0);

    // Changing the query resets the cap (and here, drops well under it).
    await searchFor(page, "pantry");
    await expect(listItems(page)).toHaveCount(60, { timeout: SEARCH_TIMEOUT });
    await expect(
      page.getByRole("button", { name: /Show \d+ more/ }),
    ).toHaveCount(0);
  });

  test("the live search page is WCAG2AA-clean idle and with results", async ({
    page,
  }) => {
    const axe = () =>
      new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

    expect((await axe()).violations).toEqual([]);

    await searchFor(page, "dessert");
    await expect(listItems(page).first()).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });

    expect((await axe()).violations).toEqual([]);
  });
});

test.describe("Search — live @mobile", () => {
  test("the live field filters on a small viewport", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    await searchField(page).fill("brulee");
    await expect(cardNamed(page, /Crème Brûlée/)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
  });
});

/**
 * Groups as *results* (22f). A matching group is a different kind of answer to
 * a recipe — one card standing for several — so it gets a strip of its own
 * above the grid, and the ticker goes on counting recipes only.
 */
test.describe("Search — matching groups", () => {
  const groupResults = (page: Page) => page.getByTestId("group-results");

  test.beforeEach(async ({ page, resetData }) => {
    await resetData("three-recipes-groups");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 3 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("a description-only match surfaces the group and no recipes", async ({
    page,
  }) => {
    // "shop" is in "Three dinners, one shop." and nowhere in the corpus.
    await searchFor(page, "shop");

    await expect(groupResults(page)).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(groupResults(page).getByRole("listitem")).toHaveCount(1);
    await expect(groupResults(page)).toContainText("Week of May 4");
    await expect(listItems(page)).toHaveCount(0);
    // The count under the field is still a recipe count.
    await expect(ticker(page)).toHaveText(/0 RESULTS/i);
  });

  test("a name match highlights and opens the group", async ({ page }) => {
    await searchFor(page, "weeknight");

    const card = groupResults(page).getByRole("listitem").first();
    await expect(card).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(card).toContainText("Weeknight Favourites");
    // The matched prefix is marked, exactly as it is on a recipe card.
    await expect(card.locator("mark", { hasText: /weeknight/i })).toBeVisible();
    await expect(listItems(page)).toHaveCount(0);

    await card.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/group\/weeknight-favourites$/);
  });

  test("a query that matches only recipes shows no group strip", async ({
    page,
  }) => {
    await searchFor(page, "recipe");

    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
    await expect(groupResults(page)).toHaveCount(0);
  });

  test("a filter never selects a group", async ({ page }) => {
    /*
     * `group:` narrows *recipes*; it does not ask for a list of groups. Nor
     * does any other filter — answering `tag:x` with the groups that happen to
     * contain a matching recipe would be a different question than the one that
     * was asked, and free text is the only thing that selects a group.
     */
    await searchFor(page, "group:weeknight-favourites");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(groupResults(page)).toHaveCount(0);
  });
});
