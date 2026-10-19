import { test, expect, type Page } from "../support/test";

const SEARCH_TIMEOUT = 20_000;
/**
 * How long a fresh browser may take to turn the corpus into results, counted
 * from the moment the last corpus document has arrived — so it measures the
 * client's work, not a cold `next dev` compiling the route. Generous for CI's
 * runners: the build is well under a second on the 67-recipe fixture (and
 * 0.2–1.3 s on the 807-recipe real corpus), where the IndexedDB populate it
 * replaced took 5–30 s.
 */
const RESULTS_AFTER_CORPUS_MS = 5_000;

const ticker = (page: Page) => page.getByTestId("search-ticker");

const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

const cardNamed = (page: Page, name: string | RegExp) =>
  listItems(page).filter({ has: page.getByRole("heading", { name }) });

const databaseNames = (page: Page) =>
  page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name),
  );

/*
 * 42s: the search index is built in memory. Until then it was persisted in
 * IndexedDB, and a fresh browser — or any browser after a content write —
 * sat on "Searching…" for the whole populate: about 18,000 serialized
 * get/put pairs, 5–30 s on the real corpus, while ⌘K said "No results found."
 * These hold the replacement to its two promises: a first search that answers
 * about as soon as the corpus lands, and nothing written to IndexedDB at all.
 *
 * (They retire `search-index-recovery.spec.ts`, whose subject — a
 * localStorage marker vouching for an IndexedDB database it had outlived — no
 * longer exists: there is no marker and no database.)
 */
test.describe("Search — a fresh browser", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("search-corpus");
  });

  test("the first search answers soon after the corpus lands, and stores nothing", async ({
    page,
  }) => {
    // Every playwright test runs in a fresh context: no IndexedDB, no
    // localStorage, nothing cached — the design agent's first visit.
    const corpus = ["/search/all", "/search/ingredients"].map((path) =>
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === path,
        { timeout: SEARCH_TIMEOUT },
      ),
    );
    await page.goto("/search?q=ginger");
    await Promise.all(corpus);
    const landed = Date.now();

    await expect(ticker(page)).toHaveText(/2 RESULTS/i, {
      timeout: RESULTS_AFTER_CORPUS_MS,
    });
    expect(Date.now() - landed).toBeLessThan(RESULTS_AFTER_CORPUS_MS);
    await expect(cardNamed(page, "Ginger Cookies")).toBeVisible();
    await expect(cardNamed(page, "Carrot Slaw")).toBeVisible();

    expect(await databaseNames(page)).toEqual([]);
  });

  test("the browse view says it is loading, never 'All 0 recipes'", async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/search/all", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/LOADING RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect(ticker(page)).not.toHaveText(/ALL 0/i);

    release();
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("the old persisted index is deleted from a browser that has one", async ({
    page,
  }) => {
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // Recreate what a pre-42s browser carries: FlexSearch's database and the
    // marker that vouched for it.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          localStorage.setItem(
            "search-populated-version:recipe-search-v3",
            "spec:1",
          );
          const request = indexedDB.open("flexsearch:recipe-search-v3");
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
          request.onerror = () => reject(request.error);
        }),
    );
    expect(await databaseNames(page)).toEqual(["flexsearch:recipe-search-v3"]);

    await page.reload();
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect.poll(() => databaseNames(page)).toEqual([]);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("search-populated-version:recipe-search-v3"),
      ),
    ).toBeNull();
  });
});
