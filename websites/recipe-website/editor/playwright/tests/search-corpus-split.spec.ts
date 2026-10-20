import { test, expect, type Page } from "../support/test";
import { openPalette, searchFor } from "../support/helpers";

const SEARCH_TIMEOUT = 20_000;

// Inside the visible <main>: a hidden second copy of the page can linger on
// "Loading recipes…" (41-Th6, 42s-T1), and a page-wide locator then fails
// strict mode.
const ticker = (page: Page) =>
  page.getByRole("main").getByTestId("search-ticker");

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
 * *renders* and is fetched on every page load. `/search/ingredients` carries the
 * rest, which nothing renders: the free-text index is built from it, and
 * `ingredient:` filters read it. Both are conditions, so it is a conditional
 * fetch — and since 42s, with the index built in memory rather than persisted,
 * the conditions are the first free text, the ⌘K palette opening, and a filter
 * that reads ingredients. A page that searches nothing never fetches it.
 *
 * What these tests hold down is that "conditional" never becomes "wrong". Every
 * failure mode here is silent — an empty result set that looks like an honest
 * answer — which is why none of them would be caught by the existing specs.
 */
test.describe("Search — the split corpus", () => {
  test("browsing fetches only the display half; the first free text fetches the rest", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    const fetched = trackCorpusFetches(page);

    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect.poll(fetched.all, { timeout: SEARCH_TIMEOUT }).toBe(1);
    // The browse view, the rails and the chips render from the display half
    // alone, so nothing has asked for the heavy one yet.
    expect(fetched.ingredients()).toBe(0);

    // An ingredient-only word can only be answered by an index built with the
    // ingredients in it.
    await searchFor(page, INGREDIENT_ONLY_TERM);
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(listItems(page)).toHaveCount(1);
    expect(fetched.ingredients()).toBe(1);
  });

  test("a filter-only query fetches the ingredients when it asks for them", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    const fetched = trackCorpusFetches(page);

    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    expect(fetched.ingredients()).toBe(0);

    // A filter-only query never reaches the engine, so nothing else would pull
    // the document in; `filterUsesField` is what notices, and without it this
    // query would filter a corpus whose recipes all have no ingredients and
    // report a confident zero.
    await searchFor(page, `ingredient:${INGREDIENT_ONLY_TERM}`);
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(listItems(page)).toHaveCount(1);
    expect(fetched.ingredients()).toBe(1);
  });

  /*
   * The hazard the split creates, and the reason the build is gated.
   *
   * `ingredients` is an indexed field. An index built before they arrive would
   * answer an ingredient-only word with nothing — an honest-looking "No
   * matches" — until the rebuild their arrival triggers. So the build waits for
   * them to settle, and the query stays "Searching…" meanwhile.
   *
   * **Holding the response is what makes this a test rather than a
   * coincidence.** Over localhost against a 67-recipe fixture both documents
   * land in the same tick, so the build would find the ingredients already
   * there whether or not anything made it wait.
   */
  test("a query typed while the ingredients are in flight waits for them", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/search/ingredients", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    await searchFor(page, INGREDIENT_ONLY_TERM);
    await expect(ticker(page)).toHaveText(/SEARCHING/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect(page.getByTestId("search-no-results")).toHaveCount(0);
    // A beat later, still waiting. Without the gate the build runs the moment
    // the query lands, and by now the ticker would read "0 results" and the
    // page "No matches" — the second look is what turns that red.
    await page.waitForTimeout(500);
    await expect(ticker(page)).toHaveText(/SEARCHING/i);
    await expect(page.getByTestId("search-no-results")).toHaveCount(0);

    release();
    await expect(cardNamed(page, INGREDIENT_ONLY_RECIPE)).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(ticker(page)).toHaveText(/1 RESULT/i);
  });

  test("opening the palette starts the ingredients before any word is typed", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    const fetched = trackCorpusFetches(page);

    await page.goto("/");
    await expect.poll(fetched.all, { timeout: SEARCH_TIMEOUT }).toBe(1);
    expect(fetched.ingredients()).toBe(0);

    await openPalette(page);
    await expect.poll(fetched.ingredients, { timeout: SEARCH_TIMEOUT }).toBe(1);
    await expect(page.getByTestId("palette-list")).toHaveAttribute(
      "data-index-ready",
      "true",
      { timeout: SEARCH_TIMEOUT },
    );
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
