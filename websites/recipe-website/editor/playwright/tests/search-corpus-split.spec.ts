import { test, expect, type Page } from "../support/test";
import { searchFor } from "../support/helpers";

const SEARCH_TIMEOUT = 20_000;

const ticker = (page: Page) => page.getByTestId("search-ticker");

// Direct-child cards only — a card's matched-ingredient <ul><li> would
// otherwise be counted as extra list items.
const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

const cardNamed = (page: Page, name: string | RegExp) =>
  listItems(page).filter({ has: page.getByRole("heading", { name }) });

/**
 * "yolks" appears in exactly one place in the whole fixture: Crème Brûlée's
 * ingredient list. Not in a name, not in a description, not in a tag. So a
 * search for it can only succeed if the ingredients reached whatever is
 * answering — which is the entire point of every test in this file.
 */
const INGREDIENT_ONLY_TERM = "yolks";
const INGREDIENT_ONLY_RECIPE = "Crème Brûlée";

/**
 * Empty the query and wait for the browse view to come back.
 *
 * Required before any reload in this file. The query lives in sessionStorage
 * (and `?q=`), and both survive `page.goto` — so a spec that searched, reloaded
 * and then expected the browse ticker would be asserting against its own
 * leftover query, not a fresh load.
 */
async function clearSearch(page: Page) {
  await searchFor(page, "");
  await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
    timeout: SEARCH_TIMEOUT,
  });
}

/** Record which of the two corpus documents a page load actually fetched. */
function trackCorpusFetches(page: Page) {
  const paths: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === "/search/all" || pathname === "/search/ingredients") {
      paths.push(pathname);
    }
  });
  return {
    all: () => paths.filter((path) => path === "/search/all").length,
    ingredients: () =>
      paths.filter((path) => path === "/search/ingredients").length,
  };
}

/*
 * F4a split the search corpus in two. `/search/all` keeps everything the client
 * *renders* — 54 KiB of the 436-recipe corpus — and is still fetched on every
 * page load. `/search/ingredients` carries the other 199 KiB, which nothing
 * renders: FlexSearch eats it once per corpus version, and `ingredient:`
 * filters read it. Both are conditions, so it is a conditional fetch.
 *
 * What these tests hold down is that "conditional" never becomes "wrong". Every
 * failure mode here is silent — an empty result set that looks like an honest
 * answer — which is why none of them would be caught by the existing specs.
 */
test.describe("Search — the split corpus", () => {
  test("a cold load fetches both halves and can filter on ingredients", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    const fetched = trackCorpusFetches(page);

    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // Nothing is cached yet, so the index needs populating and the ingredients
    // come with it.
    await expect.poll(fetched.ingredients, { timeout: SEARCH_TIMEOUT }).toBe(1);

    await searchFor(page, `ingredient:${INGREDIENT_ONLY_TERM}`);
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(listItems(page)).toHaveCount(1);
  });

  test("a warm load skips the ingredients, then fetches them when a filter asks", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");

    // First load: populate the index and let the populated-version marker land.
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await searchFor(page, INGREDIENT_ONLY_TERM);
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await clearSearch(page);

    // Second load, unchanged corpus: the IndexedDB index is current, so there
    // is nothing to populate — and with no ingredient filter in play there is
    // nothing to fetch the heavy half *for*. This is the saving, made
    // executable: 199 of the corpus's 247 KiB not crossing the wire.
    const fetched = trackCorpusFetches(page);
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect.poll(fetched.all, { timeout: SEARCH_TIMEOUT }).toBe(1);
    expect(fetched.ingredients()).toBe(0);

    // …until a filter needs them. A filter-only query never reaches the engine,
    // so nothing else would pull the document in; `filterUsesField` is what
    // notices, and without it this query would filter a corpus whose recipes
    // all have no ingredients and report a confident zero.
    await searchFor(page, `ingredient:${INGREDIENT_ONLY_TERM}`);
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(listItems(page)).toHaveCount(1);
    expect(fetched.ingredients()).toBe(1);
  });

  /*
   * The hazard the split creates, and the reason the populate is gated.
   *
   * If the populate is allowed to run before the ingredients arrive, FlexSearch
   * is committed without them and `writePopulatedVersion` then marks that
   * version done. The index probes healthy, the version matches, no page load
   * ever refetches — and every ingredient search returns nothing until the
   * corpus version happens to move. This is the same shape as the failure
   * `search-index-recovery.spec.ts` covers: a cached index that looks current
   * and answers nothing.
   *
   * **The delay below is what makes this a test rather than a coincidence.**
   * Without it the two documents land in the same tick over localhost against a
   * 67-recipe fixture, so the populate finds the ingredients already there
   * whether or not anything made it wait — removing the gate entirely left all
   * four tests in this file green. Holding `/search/ingredients` back by a
   * second forces the ordering the gate exists for, and this test then fails
   * without it.
   */
  test("a populated index at a current version still answers ingredient searches", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");

    await page.route("**/search/ingredients", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });

    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    // Searching proves the index is populated, which is when the marker lands.
    await searchFor(page, "tomato");
    await expect(cardNamed(page, "Tomato Basil Soup")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await clearSearch(page);

    // Reload onto the cached index. Free text goes to FlexSearch and nowhere
    // else, so this can only pass if the ingredients were in the document set
    // that was committed — and the version was only written because they were.
    const fetched = trackCorpusFetches(page);
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    await searchFor(page, INGREDIENT_ONLY_TERM);
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    // And it did it without refetching them: this is the *cached* index
    // answering, which is what makes the deferral safe rather than lucky.
    expect(fetched.ingredients()).toBe(0);
  });

  /*
   * A negated bare word parses to `field: "any"`, and `matchesFilter`'s `"any"`
   * arm checks ingredients. So `-yolks` must fetch the ingredients too — a
   * narrower test for "does this filter read ingredients" would leave them
   * unfetched and let the exclusion keep the one recipe it exists to remove.
   */
  test("a bare negation excludes on ingredients it has not been told about", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");

    // Warm the index first, so the only thing that can pull the ingredients in
    // on the second load is the negation itself.
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await searchFor(page, "tomato");
    await expect(cardNamed(page, "Tomato Basil Soup")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await clearSearch(page);

    const fetched = trackCorpusFetches(page);
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    expect(fetched.ingredients()).toBe(0);

    // `dessert` is Crème Brûlée, Chocolate Truffle Cake and Ginger Cookies;
    // `-yolks` must drop Crème Brûlée on an ingredient nothing has rendered.
    await searchFor(page, `tag:dessert -${INGREDIENT_ONLY_TERM}`);
    await expect(cardNamed(page, "Chocolate Truffle Cake")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(cardNamed(page, "Ginger Cookies")).toBeVisible();
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toHaveCount(0);
    expect(fetched.ingredients()).toBe(1);
  });
});
