import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  narrowRow,
  searchFor,
} from "../support/helpers";
import { WCAG_TAGS } from "../support/a11y";

const SEARCH_TIMEOUT = 20_000;

// The field too (46b: in search-query-chips the second copy met `fill`).
const searchField = (page: Page) =>
  page.getByRole("main").getByLabel("Search recipes");
// Inside the visible <main>, as in `search-live.spec.ts` (42s-T1, 46b): a
// hidden second copy of the page can linger, and a page-wide locator then
// fails strict mode.
const ticker = (page: Page) =>
  page.getByRole("main").getByTestId("search-ticker");
const suggestions = (page: Page) => page.getByTestId("query-autocomplete");
const options = (page: Page) => page.getByTestId("query-autocomplete-option");
/** Just the subject of each row — the hint beside it is prose, not the term. */
const optionLabels = (page: Page) =>
  page.getByTestId("query-autocomplete-label");

const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

/**
 * The row `aria-activedescendant` currently points at, by its label (43s: a
 * row also carries its count, which is not the term).
 *
 * An attribute selector rather than `#id`: `useId` produces ids containing `«»`,
 * which are not valid in a CSS id selector, and `CSS.escape` does not exist in
 * the Node process the spec runs in.
 */
async function activeOption(page: Page): Promise<string | null> {
  const id = await searchField(page).getAttribute("aria-activedescendant");
  if (!id) return null;
  return page
    .locator(`[id="${id}"]`)
    .getByTestId("query-autocomplete-label")
    .innerText();
}

/** Where the caret sits in the field. */
function caretOf(page: Page): Promise<number | null> {
  return searchField(page).evaluate(
    (element: HTMLInputElement) => element.selectionStart,
  );
}

/**
 * PR 21c's in-field completion — the fourth and last of PR 21's builder
 * affordances.
 *
 * What the caret is in the middle of, and what replaces it, are unit-tested
 * (`test/queryLanguage.test.ts`: `completionsAt` at every interesting caret, and
 * `replaceSpan`'s round trip). What needs a browser is the part that is a
 * *keyboard contract*: that arrows move a descendant without moving the caret,
 * that Escape puts the list away without taking the query with it, and that
 * Enter still means submit whenever no row is highlighted.
 */
test.describe("Search — in-field autocomplete", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("offers a field name for a bare word, and writes it in", async ({
    page,
  }) => {
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("ta");

    await expect(suggestions(page)).toBeVisible();
    await expect(optionLabels(page).first()).toHaveText("tag:");

    // No row is active until an arrow makes one — see the Enter case below.
    expect(await activeOption(page)).toBeNull();
    await field.press("ArrowDown");
    expect(await activeOption(page)).toMatch(/^tag:/);
    await field.press("Enter");

    await expect(field).toHaveValue("tag:");
    // 21a's judgement call (a): a known field with no operand is dropped, so
    // the browse view the user was looking at is the one they keep. Asserted on
    // the cards rather than the ticker, for F25's reason.
    await expect(listItems(page)).toHaveCount(60);
  });

  test("offers corpus tags once the caret is past tag:", async ({ page }) => {
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag:des");

    await expect(optionLabels(page)).toHaveText(["dessert"]);

    await field.press("ArrowDown");
    await field.press("Enter");

    await expect(field).toHaveValue("tag:dessert ");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
    // And the list goes away rather than offering back the tag just accepted.
    await expect(suggestions(page)).toHaveCount(0);
  });

  /* 32i: typing an alias offers the term it belongs to. */
  test("offers the term an alias belongs to", async ({
    page,
    request,
    createApiToken,
  }) => {
    const token = await createApiToken();
    const created = await request.post("/api/taxonomies/tag", {
      headers: { authorization: `Bearer ${token}` },
      data: { label: "Dessert", aliases: ["Sweets"] },
    });
    expect(created.status()).toBe(201);
    await page.reload();
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag:swe");
    await expect(optionLabels(page)).toHaveText(["Dessert"]);
    await expect(options(page)).toContainText("also called sweets");

    await field.press("ArrowDown");
    await field.press("Enter");
    await expect(field).toHaveValue("tag:Dessert ");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
  });

  test("the arrows move the active descendant, and wrap", async ({ page }) => {
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("t");

    // `tag:` and `time:` both start with `t`.
    await expect(optionLabels(page)).toHaveText(["tag:", "time:"]);

    await field.press("ArrowDown");
    expect(await activeOption(page)).toMatch(/^tag:/);
    await field.press("ArrowDown");
    expect(await activeOption(page)).toMatch(/^time:/);
    await field.press("ArrowDown"); // wraps
    expect(await activeOption(page)).toMatch(/^tag:/);
    await field.press("ArrowUp"); // and back the other way
    expect(await activeOption(page)).toMatch(/^time:/);

    // The caret never moved: the arrows are the list's, not the field's.
    await expect(field).toHaveValue("t");
  });

  test("Escape closes the list and leaves the query alone", async ({
    page,
  }) => {
    // `type="search"` clears natively on Escape in some engines. Dismissing the
    // list without `preventDefault` would take the query with it.
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag:des");
    await expect(suggestions(page)).toBeVisible();

    await field.press("Escape");
    await expect(suggestions(page)).toHaveCount(0);
    await expect(field).toHaveValue("tag:des");

    // One more keystroke brings it back: the dismissal was about that list.
    await field.pressSequentially("s");
    await expect(suggestions(page)).toBeVisible();
  });

  test("Enter with no active row still submits and records a recent", async ({
    page,
  }) => {
    // The load-bearing half of the keyboard contract. `tag` offers `tag:`, so
    // the list *is* open — and Enter still means "run this query", because
    // nothing is highlighted.
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag");
    await expect(suggestions(page)).toBeVisible();

    await field.press("Enter");
    await expect(field).toHaveValue("tag");
    await expect(page).toHaveURL(/\?q=tag/);

    // Recorded, which is the thing only a real submit does. RECENT shows on
    // the idle browse view, so the field has to be cleared to see it.
    await searchFor(page, "");
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
    await expect(page.getByLabel("Search again for tag")).toBeVisible();
  });

  test("clicking a row keeps the caret in the field", async ({ page }) => {
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag:des");
    await options(page).first().click();

    // An operand finishes the atom: one space, and the caret after it.
    await expect(field).toHaveValue("tag:dessert ");
    await expect(field).toBeFocused();
    await expect.poll(() => caretOf(page)).toBe("tag:dessert ".length);
  });

  test("Tab accepts the active row mid-query, as Enter does", async ({
    page,
  }) => {
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag:des quick");
    await expect(suggestions(page)).toHaveCount(0);

    // Back into the middle of the query: the caret after `tag:des`.
    await field.press("Home");
    for (let i = 0; i < "tag:des".length; i += 1)
      await field.press("ArrowRight");
    await expect(optionLabels(page)).toHaveText(["dessert"]);

    await field.press("ArrowDown");
    await field.press("Tab");

    // Only the term under the caret is rewritten, and the caret lands after it
    // and the space that was already there.
    await expect(field).toHaveValue("tag:dessert quick");
    await expect(field).toBeFocused();
    await expect.poll(() => caretOf(page)).toBe("tag:dessert ".length);
  });

  test("a tag chip picked over a half-typed word replaces the word", async ({
    page,
  }) => {
    // Roger, 2026-10-15: `sal` and the salad chip mean `tag:salad`, not
    // `sal tag:salad` — the partial word was a search for the tag. (Not a
    // word any field name starts with, so no suggestion list opens over the
    // rail.)
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("sal");
    await expect(ticker(page)).toHaveText(/“sal”/i, {
      timeout: SEARCH_TIMEOUT,
    });

    // The Narrow column's row (43s).
    await narrowRow(page, "salad").click();
    await expect(field).toHaveValue("tag:salad");
    await expect(page).toHaveURL(/\?q=tag%3Asalad$/);

    // A word the tag was not heading for stays, and the tag is appended.
    await searchFor(page, "ginger");
    await narrowRow(page, "dessert").click();
    await expect(field).toHaveValue("ginger tag:dessert");
  });

  test("offers nothing for an unknown prefix", async ({ page }) => {
    // Rule 1: `foo:` is free text, so inventing values for it would be
    // inventing a filter nobody asked for.
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("foo:d");
    await expect(suggestions(page)).toHaveCount(0);
  });

  test("completes a negated term without losing the negation", async ({
    page,
  }) => {
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("-tag:des");
    await options(page).first().click();

    await expect(field).toHaveValue("-tag:dessert ");
    await expect(ticker(page)).toHaveText(/64 RESULTS/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("offers ingredient names once the caret is past ingredient:", async ({
    page,
  }) => {
    // 32f. The names are the Make page's (`suggestNames`): "2 chicken thighs"
    // is offered as `chicken thigh`, and a multi-word name is written quoted.
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("ingredient:c");
    await expect(optionLabels(page)).toHaveText([
      "carrot",
      "chicken thigh",
      "cinnamon",
      "cream",
    ]);

    await field.pressSequentially("h");
    await expect(optionLabels(page)).toHaveText(["chicken thigh"]);

    await field.press("ArrowDown");
    expect(await activeOption(page)).toBe("chicken thigh");
    await field.press("Enter");

    await expect(field).toHaveValue('ingredient:"chicken thigh" ');
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await expect(listItems(page).first()).toContainText("Weeknight Skillet");
    await expect(suggestions(page)).toHaveCount(0);
  });

  test("says the ingredients are loading until they land", async ({ page }) => {
    // The lines are a conditional fetch (F4a). A reload starts with nothing
    // asking for them (42s), and the completion is what asks.
    // Holding the response keeps the loading row up long enough to look at.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/search/ingredients", async (route) => {
      await held;
      await route.continue();
    });
    await page.reload();
    await expect(ticker(page)).toHaveText(/ALL 67 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });

    const field = searchField(page);
    await field.click();
    await field.pressSequentially("ingredient:mo");

    const loading = page.getByTestId("query-autocomplete-loading");
    await expect(loading).toHaveText("Loading ingredients…");
    await expect(options(page)).toHaveCount(0);
    // An empty, busy listbox is still a valid one.
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);

    release();
    await expect(optionLabels(page)).toHaveText(["molasses"]);
    await expect(loading).toHaveCount(0);
    await options(page).first().click();
    await expect(field).toHaveValue("ingredient:molasses ");
    await expect(field).toBeFocused();
  });

  test("has no WCAG2AA violations with the list open", async ({ page }) => {
    // `nested-interactive` above all — a `<button>` inside a `role="option"` is
    // the trap this list is shaped to avoid — plus the validity of
    // `aria-activedescendant` once it points at something.
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("tag:des");
    await expect(suggestions(page)).toBeVisible();
    await field.press("ArrowDown");

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("Search — autocomplete offers groups", () => {
  test.beforeEach(async ({ page, resetData }) => {
    // The one fixture with groups in it (see search-query-language.spec.ts):
    // "Week of May 4" (a meal plan) and "Weeknight Favourites" (a collection).
    await resetData("three-recipes-groups");
    await page.goto("/search");
    await expect(ticker(page)).toHaveText(/ALL 3 RECIPES/i, {
      timeout: SEARCH_TIMEOUT,
    });
  });

  test("offers group slugs once the caret is past group:, by slug or name", async ({
    page,
  }) => {
    // `group:` matches on the slug (22f), and the slug is what gets written —
    // but the prefix is also tried against the name, because that is what a
    // curator remembers. `week` hits both "week-of-may-4" (slug) and
    // "Weeknight Favourites" (name).
    const field = searchField(page);
    await field.click();
    await field.pressSequentially("group:week");
    await expect(optionLabels(page)).toHaveText([
      "week-of-may-4",
      "weeknight-favourites",
    ]);

    await field.pressSequentially("-of");
    await expect(optionLabels(page)).toHaveText(["week-of-may-4"]);

    await field.press("ArrowDown");
    await field.press("Enter");
    await expect(field).toHaveValue("group:week-of-may-4 ");
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(suggestions(page)).toHaveCount(0);
  });
});

test.describe("Search — autocomplete stays on /search", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/featured-recipe/new");
    await fillSignInForm(page);
    // The Select-Recipe button shares a client island with the note editor.
    await markdownEditorReady(page, "note");
  });

  test("the featured-recipe picker gets no suggestion list", async ({
    page,
  }) => {
    // This is what proves the opt-in prop gates: `SearchInput` is shared
    // verbatim with the picker, so a list added unconditionally would be live
    // inside a dialog whose job is picking one recipe. `/search` passes
    // `autocomplete`; nothing else does.
    await page
      .getByRole("button", { name: "Select Recipe", exact: true })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const field = dialog.getByLabel("Search recipes");
    await field.click();
    await field.pressSequentially("tag:des");
    await expect(suggestions(page)).toHaveCount(0);
    // And no combobox wiring either — the field is the field it always was.
    await expect(field).not.toHaveAttribute("role", "combobox");
  });
});
