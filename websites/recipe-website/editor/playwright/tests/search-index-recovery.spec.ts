import { test, expect, type Page } from "../support/test";

const SEARCH_TIMEOUT = 20_000;

/** Mirrors SearchContext's constants — see the note on each test below. */
const SEARCH_DB_NAME = "recipe-search-v2";
const POPULATED_VERSION_KEY = `search-populated-version:${SEARCH_DB_NAME}`;
/** The un-namespaced key shipped before the fix. A stale one must stay inert. */
const LEGACY_POPULATED_VERSION_KEY = "search-populated-version";

const searchField = (page: Page) => page.getByLabel("Search recipes");
const ticker = (page: Page) => page.getByTestId("search-ticker");

const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

const cardNamed = (page: Page, name: string | RegExp) =>
  listItems(page).filter({ has: page.getByRole("heading", { name }) });

test.describe("Search — index recovery", () => {
  test("a marker that outlived its database repopulates rather than searching nothing", async ({
    page,
    request,
    resetData,
  }) => {
    await resetData("search-corpus");

    // Reproduce the deployed failure exactly. The marker claims the corpus is
    // already populated, but the database it vouches for holds nothing —
    // whether because SEARCH_DB_NAME was bumped out from under it or because
    // the browser evicted IndexedDB and kept localStorage. Seeding the marker
    // into a browser that has never populated the index is that state.
    //
    // It only ever showed up on an unchanged corpus: any write moves the
    // version and repopulates, which is why this never reproduced in
    // development. (The version was data.mdb's mtime+size when this was
    // written; F3 made it the pagination meta's `specHash:updatedAt`. The
    // reproduction is unaffected — what matters is that an unchanged corpus
    // holds it still, which is truer of the new form than the old.)
    const { version } = (await (
      await request.get("/search/version")
    ).json()) as {
      version: string;
    };
    expect(version).toBeTruthy();

    await page.addInitScript(
      ([key, legacyKey, value]) => {
        localStorage.setItem(key, value);
        localStorage.setItem(legacyKey, value);
      },
      [POPULATED_VERSION_KEY, LEGACY_POPULATED_VERSION_KEY, version],
    );

    await page.goto("/search");
    // The browse view reads the display corpus straight off /search/all (F4a
    // moved the ingredients to their own route), so the ticker
    // reports the full count whether or not the index behind it is usable —
    // which is precisely why the failure was invisible until you typed.
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // Before the fix this found nothing at all, with no error and no spinner:
    // the marker matched, the populate was skipped, and the query ran against
    // an empty index.
    await searchField(page).fill("tomato");
    await expect(cardNamed(page, "Tomato Basil Soup")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(ticker(page)).toHaveText(/RESULT/i);
  });

  test("the populated marker is namespaced by the database it describes", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // Searching proves the index is populated, which is when the marker lands.
    await searchField(page).fill("tomato");
    await expect(cardNamed(page, "Tomato Basil Soup")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });

    // The marker carries the database name, so bumping SEARCH_DB_NAME orphans
    // it instead of leaving it behind to vouch for a database that was never
    // populated. Nothing may be written under the old bare key.
    await expect
      .poll(
        () =>
          page.evaluate(
            (key) => localStorage.getItem(key),
            POPULATED_VERSION_KEY,
          ),
        { timeout: SEARCH_TIMEOUT },
      )
      .toBeTruthy();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        LEGACY_POPULATED_VERSION_KEY,
      ),
    ).toBeNull();
  });
});
