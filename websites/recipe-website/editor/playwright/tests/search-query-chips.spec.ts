import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  searchFor,
} from "../support/helpers";

const SEARCH_TIMEOUT = 20_000;

const searchField = (page: Page) => page.getByLabel("Search recipes");
const ticker = (page: Page) => page.getByTestId("search-ticker");
const chips = (page: Page) => page.getByTestId("query-chips");
/** Every chip's face, in DOM order — the atom each one stands for. */
const chipFaces = (page: Page) => chips(page).getByTestId("query-chip-face");

// Direct-child cards only, as in `search-query-language.spec.ts`.
const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

const cardNamed = (page: Page, name: string | RegExp) =>
  listItems(page).filter({ has: page.getByRole("heading", { name }) });

/**
 * PR 21b's chip preview line and the two edits each chip offers.
 *
 * The rewrites themselves are unit-tested (`test/queryLanguage.test.ts` — every
 * cycle step, removal tidying, stale handles, and the span round-trip that keeps
 * a folded value from being displayed). What these cases prove is what a browser
 * is needed for: that the line appears only for advanced syntax, that the chips
 * are drawn from the live query, and that clicking one moves the field, the URL
 * and the result set together.
 */
test.describe("Search — query chips", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("stays out of the way of an ordinary search", async ({ page }) => {
    // Idle, and then a plain word: `hasAdvancedSyntax` is false for both, so the
    // line renders nothing at all — which is why the default `/search`
    // baselines do not move.
    await expect(chips(page)).toHaveCount(0);

    await searchFor(page, "chocolate");
    await expect(listItems(page).first()).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(chips(page)).toHaveCount(0);

    // An unknown prefix is free text (21a's rule 1), so it earns no chip either.
    await searchFor(page, "chocolate:cake");
    await expect(cardNamed(page, "Chocolate Truffle Cake")).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(chips(page)).toHaveCount(0);
  });

  test("draws one chip per typed term, in the order they were typed", async ({
    page,
  }) => {
    await searchFor(
      page,
      "tag:dessert (ingredient:molasses OR ingredient:chocolate)",
    );
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });

    await expect(chips(page)).toBeVisible();
    await expect(chipFaces(page)).toHaveText([
      "tag:dessert",
      "ingredient:molasses",
      "ingredient:chocolate",
    ]);
  });

  test("shows the operand as typed, not as it was folded for matching", async ({
    page,
  }) => {
    // The filter is case- and accent-insensitive, so this matches the `dessert`
    // tag — and the chip must still read back what the user typed. A chip built
    // from the parsed `value` would say `tag:dessert`.
    await searchFor(page, "tag:Dessert");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
    await expect(chipFaces(page)).toHaveText(["tag:Dessert"]);
  });

  test("the × removes just that term", async ({ page }) => {
    await searchFor(page, "tag:dessert -tag:baked");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(chipFaces(page)).toHaveText(["tag:dessert", "-tag:baked"]);

    await page.getByRole("button", { name: "Remove -tag:baked" }).click();

    await expect(searchField(page)).toHaveValue("tag:dessert");
    await expect(page).toHaveURL(/\?q=tag%3Adessert/);
    await expect(listItems(page)).toHaveCount(3);
    await expect(chipFaces(page)).toHaveText(["tag:dessert"]);
  });

  test("the chip body cycles include and exclude", async ({ page }) => {
    await searchFor(page, "tag:dessert");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });

    await page.getByRole("button", { name: "Exclude tag:dessert" }).click();

    await expect(searchField(page)).toHaveValue("-tag:dessert");
    // 67 minus the three desserts. The reveal cap is 60, so the ticker is what
    // reports the size of the set.
    await expect(ticker(page)).toHaveText(/64 RESULTS/i);
    await expect(chipFaces(page)).toHaveText(["-tag:dessert"]);

    // And back — the cycle is never destructive.
    await page.getByRole("button", { name: "Include -tag:dessert" }).click();
    await expect(searchField(page)).toHaveValue("tag:dessert");
    await expect(listItems(page)).toHaveCount(3);
  });

  test("a long-hand NOT reads as an exclusion and normalises when cycled", async ({
    page,
  }) => {
    // `NOT` is its own token, so the chip's span is just `tag:baked` — the chip
    // has to be told it is negated, and the destination it offers is "Include".
    await searchFor(page, "tag:dessert NOT tag:baked");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(chipFaces(page)).toHaveText(["tag:dessert", "tag:baked"]);

    await page.getByRole("button", { name: "Include tag:baked" }).click();
    await expect(searchField(page)).toHaveValue("tag:dessert tag:baked");
    await expect(listItems(page)).toHaveCount(1);
    await expect(cardNamed(page, "Ginger Cookies")).toBeVisible();
  });

  test("a time: chip cycles its comparison", async ({ page }) => {
    await searchFor(page, "time:<30");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });

    const cycle = (label: string) =>
      page.getByRole("button", { name: `Cycle the operator on ${label}` });

    await cycle("time:<30").click();
    await expect(searchField(page)).toHaveValue("time:<=30");

    await cycle("time:<=30").click();
    await expect(searchField(page)).toHaveValue("time:>30");
    // The two fast recipes are the ones that just dropped out.
    await expect(cardNamed(page, "Carrot Slaw")).toHaveCount(0);
    await expect(cardNamed(page, "Weeknight Skillet")).toHaveCount(0);

    await cycle("time:>30").click();
    await expect(searchField(page)).toHaveValue("time:>=30");
    await cycle("time:>=30").click();
    await expect(searchField(page)).toHaveValue("time:<30");
    await expect(listItems(page)).toHaveCount(2);
  });

  test("a before: chip swaps to after:", async ({ page }) => {
    await searchFor(page, "before:2021-01-01");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(cardNamed(page, /Crème Brûlée/)).toBeVisible();

    await page
      .getByRole("button", { name: "Cycle the operator on before:2021-01-01" })
      .click();

    await expect(searchField(page)).toHaveValue("after:2021-01-01");
    await expect(ticker(page)).toHaveText(/66 RESULTS/i);
  });

  test("the same term twice gets two chips that edit independently", async ({
    page,
  }) => {
    // Nothing stops a query naming one term twice, and value-matching could not
    // tell the two apart. The chips are keyed on position, so each edits itself.
    await searchFor(page, "tag:dessert time:<30 tag:dessert");
    await expect(chipFaces(page)).toHaveText([
      "tag:dessert",
      "time:<30",
      "tag:dessert",
    ]);

    await page
      .getByRole("button", { name: "Remove tag:dessert" })
      .last()
      .click();
    await expect(searchField(page)).toHaveValue("tag:dessert time:<30");
    await expect(chipFaces(page)).toHaveText(["tag:dessert", "time:<30"]);
  });

  test("a term still being typed gets no chip, and blanks nothing", async ({
    page,
  }) => {
    // `tag:` is dropped by the parser (21a's judgement call (a)), so there is no
    // filter to preview and the browse view stands. Asserted on the cards, not
    // the ticker, for F25's reason.
    await searchField(page).fill("tag:");
    await expect(listItems(page)).toHaveCount(60, { timeout: SEARCH_TIMEOUT });
    await expect(chips(page)).toHaveCount(0);

    // One keystroke later there is a term, and a chip for it.
    await searchField(page).fill("tag:dessert");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
    await expect(chipFaces(page)).toHaveText(["tag:dessert"]);
  });

  test("advanced syntax with nothing to preview renders no line", async ({
    page,
  }) => {
    // `hasAdvancedSyntax` is true (there is a parenthesis) but no term evaluates,
    // so an empty labelled row would be worse than no row.
    await searchFor(page, "chocolate (cake)");
    await expect(listItems(page).first()).toBeVisible({
      timeout: SEARCH_TIMEOUT,
    });
    await expect(chips(page)).toHaveCount(0);
  });
});

test.describe("Search — query chips stay on /search", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/featured-recipe/new");
    await fillSignInForm(page);
    // The Select-Recipe button shares a client island with the note editor.
    await markdownEditorReady(page, "note");
  });

  test("the featured-recipe picker gets no chip line", async ({ page }) => {
    // `SearchInput` is shared with the picker; the chip line is not. It hangs off
    // `SearchResultsPage`, and the picker renders `SearchResultsModal` — so the
    // modal's field takes the same query language with none of `/search`'s
    // furniture.
    await page
      .getByRole("button", { name: "Select Recipe", exact: true })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await searchFor(page, "tag:dessert", dialog);
    await expect(chips(page)).toHaveCount(0);
  });
});
