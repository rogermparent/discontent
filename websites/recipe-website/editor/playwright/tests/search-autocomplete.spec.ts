import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  searchFor,
} from "../support/helpers";
import { WCAG_TAGS } from "../support/a11y";

const SEARCH_TIMEOUT = 20_000;

const searchField = (page: Page) => page.getByLabel("Search recipes");
const ticker = (page: Page) => page.getByTestId("search-ticker");
const suggestions = (page: Page) => page.getByTestId("query-autocomplete");
const options = (page: Page) => page.getByTestId("query-autocomplete-option");
/** Just the subject of each row — the hint beside it is prose, not the term. */
const optionLabels = (page: Page) =>
  page.getByTestId("query-autocomplete-label");

const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

/**
 * The row `aria-activedescendant` currently points at, by its text.
 *
 * An attribute selector rather than `#id`: `useId` produces ids containing `«»`,
 * which are not valid in a CSS id selector, and `CSS.escape` does not exist in
 * the Node process the spec runs in.
 */
async function activeOption(page: Page): Promise<string | null> {
  const id = await searchField(page).getAttribute("aria-activedescendant");
  if (!id) return null;
  return page.locator(`[id="${id}"]`).innerText();
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

    await expect(field).toHaveValue("tag:dessert");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
    // And the list goes away rather than offering back the tag just accepted.
    await expect(suggestions(page)).toHaveCount(0);
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

    await expect(field).toHaveValue("tag:dessert");
    await expect(field).toBeFocused();
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

    await expect(field).toHaveValue("-tag:dessert");
    await expect(ticker(page)).toHaveText(/64 RESULTS/i, {
      timeout: SEARCH_TIMEOUT,
    });
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
