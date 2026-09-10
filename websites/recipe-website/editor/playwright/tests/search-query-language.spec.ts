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

/** The names of every currently-rendered card, in order. */
const cardNames = async (page: Page) =>
  (await listItems(page).getByRole("heading").allTextContents()).map((text) =>
    text.trim(),
  );

/**
 * The query language on the real corpus. The grammar itself is unit-tested
 * (`test/queryLanguage.test.ts` — ~60 cases of precedence, quoting and
 * fragments, which are miserable through a browser); what these cases prove is
 * that the language is wired to the *engine*, the *index* and the *URL*.
 */
test.describe("Search — query language", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    // The index populates from /search/all plus /search/ingredients before any
    // query can resolve.
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("the locked shape: a tag AND an either-or pair of ingredients", async ({
    page,
  }) => {
    await searchFor(
      page,
      "tag:dessert (ingredient:molasses OR ingredient:chocolate)",
    );

    // Ginger Cookies (molasses) and Chocolate Truffle Cake (dark chocolate) are
    // both desserts; Crème Brûlée is a dessert with neither.
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    expect((await cardNames(page)).sort()).toEqual([
      "Chocolate Truffle Cake",
      "Ginger Cookies",
    ]);
    await expect(ticker(page)).toHaveText(/3 FILTERS/i);
  });

  test("free text and a filter compose: the engine ranks, the filter narrows", async ({
    page,
  }) => {
    // Unfiltered, "ginger" finds both the name hit and the ingredient-only hit.
    await searchFor(page, "ginger");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });

    // The tag term cuts it to the one that is also a dessert — and the engine's
    // ranking survives, since the filter only removes.
    await searchFor(page, "ginger tag:dessert");
    await expect(listItems(page)).toHaveCount(1);
    await expect(cardNamed(page, "Ginger Cookies")).toBeVisible();
  });

  test("negation excludes", async ({ page }) => {
    await searchFor(page, "tag:dessert");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });

    // Ginger Cookies is the one dessert that is also baked.
    await searchFor(page, "tag:dessert -tag:baked");
    await expect(listItems(page)).toHaveCount(2);
    await expect(cardNamed(page, "Ginger Cookies")).toHaveCount(0);

    // The long-hand form reads the same.
    await searchFor(page, "tag:dessert NOT tag:baked");
    await expect(listItems(page)).toHaveCount(2);
  });

  test("time: compares the indexed durations", async ({ page }) => {
    // Weeknight Skillet is 10 + 15; Carrot Slaw is prep-only at 10 — so the
    // prep + cook fallback is doing work here, not just `totalTime`.
    await searchFor(page, "time:<30");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    expect((await cardNames(page)).sort()).toEqual([
      "Carrot Slaw",
      "Weeknight Skillet",
    ]);

    // The 60 filler recipes have no timing at all, and "unknown" is not "fast":
    // a generous bound still returns only the seven timed recipes.
    await searchFor(page, "time:<10000");
    await expect(listItems(page)).toHaveCount(7);

    await searchFor(page, "time:>120");
    await expect(listItems(page)).toHaveCount(1);
    await expect(cardNamed(page, /Crème Brûlée/)).toBeVisible();
  });

  test("before:/after: bound by date", async ({ page }) => {
    // Crème Brûlée is the corpus's one backdated recipe (2020).
    await searchFor(page, "before:2021-01-01");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(cardNamed(page, /Crème Brûlée/)).toBeVisible();

    await searchFor(page, "after:2021-01-01");
    await expect(listItems(page)).toHaveCount(60);
    await expect(ticker(page)).toHaveText(/66 RESULTS/i);
  });

  test("an unknown prefix is a search, not a filter", async ({ page }) => {
    // A colon in an ordinary query must never trap the user: `chocolate:cake`
    // is free text, and free text with `suggest: true` still finds the cake.
    await searchFor(page, "chocolate:cake");
    await expect(cardNamed(page, "Chocolate Truffle Cake")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    // No filter was parsed, so the ticker reports none.
    await expect(ticker(page)).not.toContainText(/filter/i);
  });

  test("a half-typed query narrows rather than blanking the page", async ({
    page,
  }) => {
    // The states a real query passes through on its way to being typed. None
    // may throw, and none may empty a page that is mid-filter.
    await searchField(page).fill("tag:");
    // A field with no operand yet is not a filter for the literal word "tag" —
    // it is not a filter at all, so the browse view stands: all 67 match, 60
    // revealed. Asserted on the cards, not the ticker: the ticker branches on
    // the raw query string, so it reads `67 results · “tag:”` the moment the
    // 180 ms debounce commits, and an `ALL 67 RECIPES` assertion could only
    // pass before that (F25).
    await expect(listItems(page)).toHaveCount(60, { timeout: SEARCH_TIMEOUT });

    await searchField(page).fill("tag:dessert (");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });

    await searchField(page).fill("tag:dessert (ingredient:molasses OR");
    await expect(listItems(page)).toHaveCount(1);
    await expect(cardNamed(page, "Ginger Cookies")).toBeVisible();

    await searchField(page).fill("time:<");
    await expect(listItems(page)).toHaveCount(60);

    await searchField(page).fill(
      "tag:dessert (ingredient:molasses OR ingredient:chocolate)",
    );
    await expect(listItems(page)).toHaveCount(2);
  });

  test("highlighting marks the free text and never the filter values", async ({
    page,
  }) => {
    // "chocolate" is this recipe's tag *and* a word in its name and its
    // description — so if a filter value leaked into the highlighter, it would
    // be visible right here.
    await searchFor(page, "truffle tag:chocolate");
    const card = cardNamed(page, "Chocolate Truffle Cake");
    await expect(card).toBeVisible({ timeout: SEARCH_TIMEOUT });

    // The word that was searched for is marked…
    await expect(
      card.locator("mark").filter({ hasText: /truffle/i }),
    ).toHaveCount(1);
    // …and the tag value, which constrained the set rather than matching it,
    // is not.
    await expect(
      card.locator("mark").filter({ hasText: /chocolate/i }),
    ).toHaveCount(0);
  });

  test("the URL carries the whole query, filters included", async ({
    page,
  }) => {
    await searchFor(page, "tag:soup");
    await expect(page).toHaveURL(/\?q=tag%3Asoup/);
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });

    // …and a reload of that URL comes back to the same filtered page.
    await page.reload();
    await expect(searchField(page)).toHaveValue("tag:soup");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
  });

  test("a ?q= deep link lands filtered, with the filter visible in the field", async ({
    page,
  }) => {
    // The shape the search field mints. (Tag chips mint /tags/<slug> since F8;
    // this URL is still what typing or editing a filter term produces.)
    await page.goto("/search?q=tag%3Abread");
    await expect(searchField(page)).toHaveValue("tag:bread");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(cardNamed(page, "Sourdough Loaf")).toBeVisible();
  });

  test("a legacy ?tags=&mode=or link folds into the query", async ({
    page,
  }) => {
    // Pre-PR-21 links, bookmarks and history entries keep working: the params
    // are read once on arrival and rewritten to the `?q=` form. Session state
    // is cleared first because it wins over the URL by design — a deep link
    // opened in a used tab is not what this case is about.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/search?tags=soup,bread&mode=or");

    await expect(searchField(page)).toHaveValue("(tag:soup OR tag:bread)");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(page).not.toHaveURL(/tags=/);
  });

  test("a legacy single-tag ?tags= link folds into the query", async ({
    page,
  }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/search?tags=french");

    await expect(searchField(page)).toHaveValue("tag:french");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(cardNamed(page, /Crème Brûlée/)).toBeVisible();
  });

  test("the search page stays WCAG2AA-clean with a filter active", async ({
    page,
  }) => {
    await searchFor(page, "tag:dessert -tag:baked");
    await expect(listItems(page).first()).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });

    // The rail's AND/OR ToggleGroup is gone — combining is typed now.
    await expect(page.getByRole("radio")).toHaveCount(0);
    // PR 21b's chip line is up too — a pair of sibling buttons per term, which
    // is the shape `nested-interactive` (wcag2a) forces. This case is where that
    // gets checked, since it is the axe pass that runs with a filter active.
    await expect(
      page.getByTestId("query-chips").getByTestId("query-chip-face"),
    ).toHaveText(["tag:dessert", "-tag:baked"]);
    await expect(
      page.getByRole("button", { name: "Clear tags", exact: true }),
    ).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  });
});

/**
 * The `group:` field (22f). Its own describe because it needs the one fixture
 * that has groups in it: `three-recipes-groups` is `three-recipes` plus "Week
 * of May 4" (first + second + a dangling `missing-recipe`) and "Weeknight
 * Favourites" (first + third).
 *
 * Membership does not live on the recipe index at all — it arrives as a second
 * document from `/search/groups` and the client decorates the corpus with it —
 * so what these cases really prove is that the decoration reaches the filter.
 */
test.describe("Search — the group: field", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("three-recipes-groups");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 3 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("narrows to a group's members, and a dangling slug contributes nothing", async ({
    page,
  }) => {
    await searchFor(page, "group:week-of-may-4");

    // Three items, two recipes: `missing-recipe` names nothing in the corpus,
    // and a membership cannot conjure a card for a recipe that is not there.
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    expect((await cardNames(page)).sort()).toEqual([
      "First Recipe",
      "Second Recipe",
    ]);
    await expect(ticker(page)).toHaveText(/1 FILTER/i);
  });

  test("negation excludes a group's members", async ({ page }) => {
    await searchFor(page, "-group:weeknight-favourites");

    // First and Third are the collection; Second is the one left.
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(cardNamed(page, "Second Recipe")).toBeVisible();
  });

  test("composes with another field", async ({ page }) => {
    await searchFor(page, "group:week-of-may-4 name:second");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(cardNamed(page, "Second Recipe")).toBeVisible();

    // The two groups overlap on First Recipe only.
    await searchFor(page, "group:week-of-may-4 group:weeknight-favourites");
    await expect(listItems(page)).toHaveCount(1);
    await expect(cardNamed(page, "First Recipe")).toBeVisible();
  });

  test("the idle browse rail lists the groups, and goes away once a query is typed", async ({
    page,
  }) => {
    const rail = page.getByTestId("group-rail");
    await expect(rail).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(rail.getByRole("link")).toHaveCount(2);
    await expect(rail).toContainText("Week of May 4");
    await expect(rail).toContainText("Weeknight Favourites");

    // The rail is a browse affordance for the *empty* page, exactly as the
    // recents row is — once there is a query, the results are the answer.
    await searchFor(page, "first");
    await expect(rail).toHaveCount(0);

    await searchFor(page, "");
    await expect(page.getByTestId("group-rail")).toBeVisible();

    // A chip is a destination, not a filter: it opens the group's page.
    await page.getByRole("link", { name: /Week of May 4/ }).click();
    await expect(page).toHaveURL(/\/group\/week-of-may-4$/);
  });

  test("shows no rail at all on a corpus with no groups", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 3 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect(page.getByTestId("group-rail")).toHaveCount(0);
    await expect(page.getByTestId("group-results")).toHaveCount(0);
  });
});
