import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "../support/test";
import {
  openPalette,
  palette,
  paletteIndexReady,
  paletteInput,
  searchFor,
  signIn,
} from "../support/helpers";
import { snapshotLocator } from "../support/visual";

const WCAG = ["wcag2a", "wcag2aa"];
const SEARCH_TIMEOUT = 20_000;

const ticker = (page: Page) => page.getByTestId("search-ticker");
const recentGroup = (page: Page) => page.getByTestId("palette-recent-group");
const filterGroup = (page: Page) => page.getByTestId("palette-filter-group");
/** PR 21b's rows that write a term into the field. Not PR 20's retired group. */
const insertGroup = (page: Page) => page.getByTestId("palette-insert-group");
/** 22f's Groups rows. Always below the recipes — see the ordering case. */
const groupsGroup = (page: Page) => page.getByTestId("palette-groups-group");
const rows = (page: Page) => page.getByRole("option");
const recipeRow = (page: Page, name: string | RegExp) =>
  page.getByTestId("palette-recipes-group").getByRole("option").filter({
    hasText: name,
  });

const axeClean = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
};

/**
 * Sign in, then land back on a fully-loaded home page. The redirect after the
 * credentials submit can still be in flight, so navigate explicitly (the same
 * `signIn(); goto()` pattern the settings specs use) before driving the palette.
 */
async function signInAndHome(page: Page) {
  await page.goto("/");
  await signIn(page);
  await page.goto("/");
}

/** Type into the palette once its shared index is actually searchable. */
async function paletteSearch(page: Page, query: string) {
  await paletteIndexReady(page);
  await paletteInput(page).fill(query);
}

/**
 * Commit queries on `/search` (the RECENT row only records commits), then clear
 * the field. Clearing matters: the palette seeds its input from the *shared*
 * query on open, so a query left set would open the palette on results rather
 * than on the recents this fixture is arranging.
 */
async function recordSearches(page: Page, queries: string[]) {
  await page.goto("/search");
  await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
    timeout: SEARCH_TIMEOUT,
  });
  for (const query of queries) {
    await searchFor(page, query);
    await expect(ticker(page)).toHaveText(new RegExp(`“${query}”`, "i"), {
      timeout: SEARCH_TIMEOUT,
    });
  }
  await searchFor(page, "");
  await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i);
}

test.describe("Command palette", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("opens from the header trigger with an accessible title", async ({
    page,
  }) => {
    await page.goto("/");
    // The ⌘K hint chip is decorative (aria-hidden) — the trigger's name is "Search".
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Search" }),
    ).toBeVisible();

    await openPalette(page);
    // Radix names the dialog from the sr-only DialogTitle (and marks the rest of
    // the page inert while it's open).
    await expect(palette(page)).toBeVisible();
  });

  test("toggles open with the ⌘K / Ctrl-K shortcut", async ({ page }) => {
    await page.goto("/");
    await expect(paletteInput(page)).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    await expect(paletteInput(page)).toBeVisible();

    // The same chord toggles it back closed.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(paletteInput(page)).toHaveCount(0);
  });

  // The handler accepts metaKey *or* ctrlKey, so the hint chip has to name the
  // one this machine actually uses — it hardcoded ⌘ before PR 20. Both
  // `navigator.platform` and the UA are stubbed so the assertion holds whatever
  // the host OS is.
  for (const { platform, userAgent, expected } of [
    {
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      expected: "⌘K",
    },
    {
      platform: "Win32",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      expected: "Ctrl+K",
    },
  ]) {
    test(`the shortcut hint reads ${expected} on ${platform}`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ platform, userAgent }) => {
          Object.defineProperty(navigator, "platform", { get: () => platform });
          Object.defineProperty(navigator, "userAgent", {
            get: () => userAgent,
          });
        },
        { platform, userAgent },
      );
      await page.goto("/");
      await expect(page.getByTestId("palette-shortcut-hint")).toHaveText(
        expected,
      );
    });
  }

  test("live search surfaces a recipe and Enter navigates to it", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);

    await paletteSearch(page, "First");

    const row = page.getByRole("option", { name: /First Recipe/ });
    await expect(row).toBeVisible({ timeout: SEARCH_TIMEOUT });

    // cmdk auto-selects the top row, so Enter opens it.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/recipe\/first-recipe$/);
  });

  test("Enter opens the top recipe even when the query matches a destination", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);

    // "Recipe" matches nav items ("All recipes", the Search destination) too, but
    // the top recipe row must stay selected so Enter opens a recipe, not /search.
    await paletteSearch(page, "Recipe");
    await expect(
      page.getByRole("option", { name: /Recipe/ }).first(),
    ).toBeVisible({ timeout: SEARCH_TIMEOUT });

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/recipe\/[a-z-]+$/);
  });

  test("shows owner destinations when signed in", async ({ page }) => {
    await signInAndHome(page);
    await openPalette(page);

    await expect(
      page.getByRole("option", { name: "New Recipe" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Content Sync" }),
    ).toBeVisible();
    // The editor-injected auth action reads "Sign out" when signed in.
    await expect(page.getByRole("option", { name: "Sign out" })).toBeVisible();
  });

  test("hides owner destinations for a signed-out reader", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);

    // Reader (no session) → owner-only items are structurally absent.
    await expect(page.getByRole("option", { name: "New Recipe" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("option", { name: "Content Sync" }),
    ).toHaveCount(0);
    // Reader destinations are present.
    await expect(page.getByRole("option", { name: "Bookmarks" })).toBeVisible();
  });

  test("navigates via a 'Go to' destination", async ({ page }) => {
    await signInAndHome(page);
    await openPalette(page);

    // "Site details" is the palette's entry for /settings (mirrors SettingsNav).
    await page.getByRole("option", { name: "Site details" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("closes on route change", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await page.getByRole("option", { name: "Bookmarks" }).click();
    await expect(page).toHaveURL(/\/bookmarks$/);
    await expect(palette(page)).toHaveCount(0);
  });

  test("open palette has no WCAG2AA violations", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await expect(palette(page)).toBeVisible();
    await axeClean(page);
  });
});

/**
 * Depth-dependent behaviour runs against `search-corpus` — 67 recipes, 8 tags,
 * real descriptions, and the ginger name-vs-ingredient pair. The launcher/owner
 * tests above stay on `three-recipes` so the owner baseline doesn't churn.
 */
test.describe("Command palette — search depth", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("search-corpus");
  });

  test("a tag filter set on /search never follows the palette to another route", async ({
    page,
  }) => {
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // Two tags no recipe carries together — the filter that matches nothing.
    // Before PR 21a it lived in sessionStorage and silently emptied the palette
    // on every other route; now it lives in the query, so leaving the query
    // behind leaves the filter behind with it.
    await page.getByRole("button", { name: "Filter by tag soup" }).click();
    await page.getByRole("button", { name: "Filter by tag bread" }).click();
    await expect(ticker(page)).toHaveText(/0 RESULTS · .* · 2 FILTERS/i);

    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "ginger");

    // Both ginger recipes, neither of which is a soup or a bread.
    await expect(recipeRow(page, "Ginger Cookies")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(recipeRow(page, "Carrot Slaw")).toBeVisible();
    // No FILTER row: there is no hidden state left for one to surface.
    await expect(filterGroup(page)).toHaveCount(0);
  });

  test("the palette takes the query language too, and honours what it says", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);

    // A filter typed into the palette's own field applies to the palette's own
    // results — it is the same one string `/search` reads.
    await paletteSearch(page, "ginger tag:dessert");
    await expect(recipeRow(page, "Ginger Cookies")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(recipeRow(page, "Carrot Slaw")).toHaveCount(0);

    // Only the free text is highlighted; the tag value constrained the set, it
    // didn't match the words on screen.
    const cookies = recipeRow(page, "Ginger Cookies");
    await expect(cookies.locator("mark", { hasText: "Ginger" })).toBeVisible();
    await expect(cookies.locator("mark", { hasText: "dessert" })).toHaveCount(
      0,
    );

    // A filter with no free text at all still lists rows — the whole corpus,
    // narrowed. "soup" is carried by exactly one fixture recipe.
    await paletteSearch(page, "tag:soup");
    await expect(recipeRow(page, "Tomato Basil Soup")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(
      page.getByTestId("palette-recipes-group").getByRole("option"),
    ).toHaveCount(1);
  });

  test("rows carry the description and the matched ingredient", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);

    // "pomegranate" lives only in Weeknight Skillet's description, so the row
    // has to show the description or there is no visible reason it matched.
    await paletteSearch(page, "pomegranate");
    const skillet = recipeRow(page, "Weeknight Skillet");
    await expect(skillet).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(skillet).toContainText("one-pan supper glazed with");
    await expect(
      skillet.locator("mark", { hasText: "pomegranate" }),
    ).toBeVisible();

    // Same for an ingredient-only hit: Carrot Slaw matches "ginger" through its
    // ingredient list alone.
    await paletteSearch(page, "ginger");
    const slaw = recipeRow(page, "Carrot Slaw");
    await expect(slaw).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(slaw).toContainText("grated ginger");
    await expect(slaw.locator("mark", { hasText: "ginger" })).toBeVisible();
  });

  test("'See all results' carries the query across and records it", async ({
    page,
  }) => {
    // A filter left on /search stays with /search's query — the palette starts
    // from whatever is typed into it, so the row can't inherit a stale one.
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await page.getByRole("button", { name: "Filter by tag soup" }).click();
    await expect(ticker(page)).toHaveText(/1 FILTER/i);

    await page.goto("/");
    await openPalette(page);
    // 60 "Pantry Staple" recipes — well past the 5-row cap, so the overflow row
    // is present.
    await paletteSearch(page, "pantry");
    const seeAll = page.getByRole("option", { name: /See all results/ });
    await expect(seeAll).toBeVisible({ timeout: SEARCH_TIMEOUT });

    await seeAll.click();
    await expect(page).toHaveURL(/\/search\?q=pantry/);
    // A row promising "all results" must land somewhere unfiltered — the ticker
    // reports no tags, and the full 60.
    await expect(ticker(page)).toHaveText(/60 RESULTS · “pantry”$/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // Following it is a commit, so it joins RECENT (visible on the idle view).
    await searchFor(page, "");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i);
    await expect(page.getByLabel("Search again for pantry")).toBeVisible();
  });

  // --- PR 21b: rows that build the query instead of leaving it ---

  test("a wide result set offers rows that narrow it, after the recipes", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    // Every timed recipe: seven hits, so past the five-row cap — and all seven
    // carry tags, which is what gives the facet rows something to offer.
    await paletteSearch(page, "time:<10000");
    await expect(recipeRow(page, "Ginger Cookies")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });

    await expect(insertGroup(page)).toBeVisible();
    // Last, not first: a filter edit must never be what Enter does (PR 20).
    const groups = page.locator(
      "[data-testid=palette-recipes-group], [data-testid=palette-insert-group]",
    );
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toHaveAttribute(
      "data-testid",
      "palette-recipes-group",
    );

    // PR 20's retired FILTER row stays retired; this is a different group with a
    // different testid, and the fence around the old one still holds.
    await expect(filterGroup(page)).toHaveCount(0);
  });

  test("a narrow result set offers nothing to narrow", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    // Two hits, both on screen: the list is already the answer.
    await paletteSearch(page, "ginger");
    await expect(recipeRow(page, "Carrot Slaw")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(insertGroup(page)).toHaveCount(0);
  });

  test("a facet row writes its term into the field and keeps the palette open", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "time:<10000");
    await expect(insertGroup(page)).toBeVisible({ timeout: SEARCH_TIMEOUT });

    const facet = insertGroup(page)
      .getByRole("option", { name: /^Only tag:/ })
      .first();
    await expect(facet).toBeVisible();
    await facet.click();

    // The row narrows; it does not navigate, so the palette is still open and
    // the field now carries the term.
    await expect(palette(page)).toBeVisible();
    await expect(paletteInput(page)).toHaveValue(/^time:<10000 tag:/);
    await expect(page.getByTestId("palette-recipes-group")).toBeVisible();
  });

  test("a field row leaves the caret ready and the results standing", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    // The 60 filler recipes carry no tags at all, so this query's rows are the
    // bare-field kind — the ones 21a's judgement call (a) has to make safe.
    await paletteSearch(page, "pantry");
    await expect(insertGroup(page)).toBeVisible({ timeout: SEARCH_TIMEOUT });

    const rowCount = await page
      .getByTestId("palette-recipes-group")
      .getByRole("option")
      .count();

    await insertGroup(page)
      .getByRole("option", { name: /Filter by ingredient:/ })
      .click();

    await expect(paletteInput(page)).toHaveValue("pantry ingredient:");
    // A known field with no operand is *dropped*, so the result set the user was
    // looking at is exactly the one still on screen while they type the operand.
    await expect(
      page.getByTestId("palette-recipes-group").getByRole("option"),
    ).toHaveCount(rowCount);
    await expect(paletteInput(page)).toBeFocused();
    // And the group stops offering a second empty field while one is pending.
    await expect(
      insertGroup(page).getByRole("option", { name: /Filter by/ }),
    ).toHaveCount(0);
  });

  test("the new group does not steal cmdk's selection from the recipes", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "pantry");
    await expect(insertGroup(page)).toBeVisible({ timeout: SEARCH_TIMEOUT });

    // cmdk snaps its selection to the first item when the item list changes, and
    // the palette controls `selectedValue` for exactly that reason. Appending a
    // group below the recipes must not move the highlight — asserted rather than
    // trusted.
    const top = page
      .getByTestId("palette-recipes-group")
      .getByRole("option")
      .first();
    await expect(top).toHaveAttribute("data-selected", "true");

    await paletteInput(page).press("Enter");
    await expect(page).toHaveURL(/\/recipe\//);
  });

  test("stays WCAG2AA-clean with the narrow-by rows rendered", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "time:<10000");
    await expect(insertGroup(page)).toBeVisible({ timeout: SEARCH_TIMEOUT });
    // The count-free row shape matters here: a <button> inside a `role="option"`
    // would fail `nested-interactive`, a wcag2a rule.
    await axeClean(page);
  });

  test("the empty palette leads with RECENT, and ⌫ deletes the highlighted entry", async ({
    page,
  }) => {
    await recordSearches(page, ["sourdough", "tomato"]);

    await page.goto("/");
    await openPalette(page);

    // Most-recent-first, above "Go to".
    const recents = recentGroup(page).getByRole("option");
    await expect(recents).toHaveCount(3); // two entries + "Clear recent searches"
    await expect(recents.nth(0)).toHaveText(/tomato/);
    await expect(recents.nth(1)).toHaveText(/sourdough/);

    // The group arrives from localStorage after hydration, with the input text
    // unchanged — cmdk would leave the highlight on "Home", handing Enter to the
    // wrong row. The snap arm puts it on the first recent, ⌫ hint and all.
    await expect(recents.nth(0)).toHaveAttribute("data-selected", "true");
    await expect(recents.nth(0).getByText("⌫")).toBeVisible();

    await page.keyboard.press("Backspace");
    await expect(recentGroup(page).getByRole("option")).toHaveCount(2);
    await expect(page.getByRole("option", { name: /tomato/ })).toHaveCount(0);

    // The highlight reflows onto the entry that took the slot, so Enter re-runs
    // that search in place.
    const remaining = recentGroup(page).getByRole("option").first();
    await expect(remaining).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Enter");
    await expect(recipeRow(page, "Sourdough Loaf")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("a recent can be removed by pointer, and the group cleared wholesale", async ({
    page,
  }) => {
    await recordSearches(page, ["sourdough", "tomato"]);

    await page.goto("/");
    await openPalette(page);
    await expect(recentGroup(page).getByRole("option")).toHaveCount(3);

    // The × is a hover affordance on the row, not a nested button.
    await page.getByTestId("palette-recent-remove:sourdough").click();
    await expect(recentGroup(page).getByRole("option")).toHaveCount(2);
    // Deleting must not also re-run the search it deleted.
    await expect(paletteInput(page)).toHaveValue("");
    await expect(page.getByRole("option", { name: /tomato/ })).toBeVisible();

    await page.getByRole("option", { name: "Clear recent searches" }).click();
    await expect(recentGroup(page)).toHaveCount(0);
    // With the group gone the launcher takes over again.
    await expect(page.getByRole("option", { name: "Bookmarks" })).toBeVisible();
  });

  test("opening a result from the palette records it as a recent search", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "sourdough");

    const row = recipeRow(page, "Sourdough Loaf");
    await expect(row).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await row.click();
    await expect(page).toHaveURL(/\/recipe\/sourdough-loaf$/);

    // Palette-originated searches used to be invisible to /search's RECENT row.
    await page.goto("/search");
    await searchFor(page, "");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect(page.getByLabel("Search again for sourdough")).toBeVisible();
  });

  test("stays WCAG2AA-clean with results, with recents, and in dark mode", async ({
    page,
  }) => {
    await recordSearches(page, ["ginger"]);

    // Results: three-line rows, Badge tag chips.
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "ginger");
    await expect(recipeRow(page, "Ginger Cookies")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await axeClean(page);

    // Recents: the ⌫ row and its aria-hidden × — the `nested-interactive`
    // (wcag2a) guard for both delete affordances.
    await paletteInput(page).fill("");
    await expect(recentGroup(page).getByRole("option").first()).toBeVisible();
    await axeClean(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await axeClean(page);
    await expect(rows(page).first()).toBeVisible();
  });
});

test.describe("Command palette visuals @visual", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  for (const mode of ["light", "dark"] as const) {
    test(`empty palette in ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await openPalette(page);
      await snapshotLocator(palette(page), `palette-empty-${mode}.png`);
    });
  }

  test("palette with recipe results", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "Recipe");
    await expect(
      page.getByRole("option", { name: /First Recipe/ }),
    ).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await snapshotLocator(palette(page), "palette-results-light.png");
  });

  test("owner palette exposes owner destinations", async ({ page }) => {
    await signInAndHome(page);
    await openPalette(page);
    await expect(
      page.getByRole("option", { name: "New Recipe" }),
    ).toBeVisible();
    await snapshotLocator(palette(page), "palette-owner-light.png");
  });
});

test.describe("Command palette visuals — corpus @visual", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("search-corpus");
  });

  test("recents lead the empty palette", async ({ page }) => {
    await recordSearches(page, ["sourdough", "creme"]);

    await page.goto("/");
    await openPalette(page);
    await expect(recentGroup(page).getByRole("option").first()).toBeVisible();
    await snapshotLocator(palette(page), "palette-recents-light.png");
  });

  // The narrow-by rows (PR 21b). Deliberately a *new* baseline rather than a
  // moved one: the two result baselines above capture 3-hit and 2-hit queries,
  // and the group only renders past the five-row cap, so neither of them changed.
  //
  // Scoped to the group, not the dialog. The group renders *below* five recipe
  // rows and the overflow row, which is past `CommandList`'s `min(24rem,60vh)` —
  // a whole-palette shot is clipped before it reaches them. Being last is the
  // deliberate part (Enter must never be a filter edit); needing a scroll or an
  // arrow-down to see it is the price.
  test("narrow-by rows sit under the recipe rows", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "time:<10000");
    const group = page.getByTestId("palette-insert-group");
    await expect(group).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await group.scrollIntoViewIfNeeded();
    await snapshotLocator(group, "palette-insert-rows-light.png");
  });

  test("a deep result row shows description, ingredient and tags", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "ginger");
    await expect(recipeRow(page, "Carrot Slaw")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await snapshotLocator(palette(page), "palette-deep-rows-light.png");
  });
});

test.describe("Command palette @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("opens from the mobile nav sheet with no keyboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    // Tapping Search closes the sheet and opens the palette (no ⌘K hint here).
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Search" })
      .click();

    await expect(paletteInput(page)).toBeVisible();

    await paletteSearch(page, "First");
    await expect(
      page.getByRole("option", { name: /First Recipe/ }),
    ).toBeVisible({ timeout: SEARCH_TIMEOUT });
  });
});

/**
 * Groups in the palette (22f). The one fixture that has any, so this is its own
 * describe — the launcher cases above stay on `three-recipes`, where the Groups
 * rows never render and the owner baseline cannot churn.
 */
test.describe("Command palette — groups", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes-groups");
  });

  test("a group name lists a Groups row that opens the group", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "weeknight");

    const row = groupsGroup(page).getByRole("option");
    await expect(row).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(row.first()).toContainText("Weeknight Favourites");
    // The kind is on the row, so a group is never mistaken for a recipe.
    await expect(row.first()).toContainText("Collection");

    await row.first().click();
    await expect(page).toHaveURL(/\/group\/weeknight-favourites$/);
  });

  test("groups match on description, and vanish with the query", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);

    // "shop" is only in "Week of May 4"'s description.
    await paletteSearch(page, "shop");
    await expect(groupsGroup(page)).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(groupsGroup(page).getByRole("option")).toHaveCount(1);

    // An empty palette is a launcher: no recipes, and no groups either.
    await paletteSearch(page, "");
    await expect(groupsGroup(page)).toHaveCount(0);
  });

  test("the Groups rows sit below the recipe rows, so Enter still opens a recipe", async ({
    page,
  }) => {
    /*
     * The palette's oldest promise, restated for a new row group. "th" is the
     * one prefix this fixture answers on both sides — every recipe description
     * carries "This"/"the", and "Week of May 4" is described as "Three dinners,
     * one shop." — so it is exactly the query a Groups group placed above the
     * recipes would break. Asserted by DOM order rather than trusted, because
     * cmdk's auto-selection is positional.
     */
    await page.goto("/");
    await openPalette(page);
    await paletteSearch(page, "th");

    await expect(groupsGroup(page).getByRole("option")).toHaveCount(1, {
      timeout: SEARCH_TIMEOUT,
    });

    const texts = await rows(page).allTextContents();
    const groupIndex = texts.findIndex((text) =>
      text.includes("Week of May 4"),
    );
    expect(groupIndex).toBeGreaterThan(0);
    // Everything above the group row is a recipe row.
    expect(
      texts.slice(0, groupIndex).every((text) => /Recipe/.test(text)),
    ).toBe(true);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/recipe\/[a-z-]+$/);
  });
});
