import { expect, type Locator, type Page } from "@playwright/test";

export interface SignInOptions {
  email?: string;
  password?: string;
}

/**
 * Sets the value of a Lexical markdown field (description, note, instruction
 * text, yield) by switching it to Source mode and filling the raw-markdown
 * textarea. Playwright's fill() can't reliably drive the Lexical WYSIWYG, and
 * the field's submitted `name` is on a hidden input, so we locate the field's
 * container via that hidden input and use its Source toggle + textarea.
 */
export async function fillMarkdownField(
  page: Page,
  name: string,
  value: string,
): Promise<void> {
  // openMarkdownSource waits for the editor to hydrate before toggling, so the
  // Source click isn't swallowed mid-hydration, then returns the textarea.
  const textarea = await openMarkdownSource(page, name);
  await textarea.fill(value);
}

/**
 * The FieldWrapper element of a Lexical markdown field, located by its
 * submitted `name` via the always-present hidden input. Stable across the
 * rich/source mode toggle (the hidden input lives outside the mode switch).
 */
function markdownFieldContainer(page: Page, name: string): Locator {
  return page
    .locator(`input[type="hidden"][name="${name}"]`)
    .locator("xpath=..");
}

/**
 * Resolves once a Lexical markdown field's editor has actually registered and
 * is ready for input. Lexical stamps `data-lexical-editor="true"` on the root
 * contenteditable inside setRootElement, which runs in the same hydration
 * commit that attaches the island's React handlers — so waiting for it avoids
 * the flaky window where a click/keystroke lands before hydration and is
 * silently swallowed. Returns the contenteditable locator.
 */
export async function markdownEditorReady(
  page: Page,
  name: string,
): Promise<Locator> {
  const editable = markdownFieldContainer(page, name).locator(
    "[data-lexical-editor='true']",
  );
  await expect(editable).toBeVisible({ timeout: 15_000 });
  return editable;
}

/**
 * Switches a Lexical markdown field (located by its submitted `name`) into
 * Source mode and returns the source <textarea>. Waits for the editor to be
 * hydrated first so the toggle click isn't swallowed mid-hydration.
 */
export async function openMarkdownSource(
  page: Page,
  name: string,
): Promise<Locator> {
  await markdownEditorReady(page, name);
  const container = markdownFieldContainer(page, name);
  await container.getByRole("button", { name: "Source", exact: true }).click();
  return container.locator("textarea");
}

export async function fillSignInForm(
  page: Page,
  { email = "admin@nextmail.com", password = "password" }: SignInOptions = {},
): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Sign in with Credentials", exact: true })
    .click();
}

export async function signIn(
  page: Page,
  options?: SignInOptions,
): Promise<void> {
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await fillSignInForm(page, options);
}

/**
 * Drives the live search field: clear, type the query, press Enter.
 *
 * `/search` filters as you type (no Submit button), but Enter is still
 * meaningful — it flushes the input debounce immediately and records the query
 * as recent — so it doubles as the deterministic "results are for *this* query"
 * signal a spec wants. Pass `scope` to target the field inside the featured-
 * recipe picker dialog. Route every spec's search through here, so the next
 * change to the search surface touches one place.
 */
export async function searchFor(
  page: Page,
  query: string,
  scope?: Locator,
): Promise<void> {
  const field = (scope ?? page).getByLabel("Search recipes");
  await field.clear();
  await field.fill(query);
  await field.press("Enter");
}

// --- ⌘K command palette ---
// Shared for the same reason `searchFor` is: the palette is driven from several
// specs, and its opening ritual + readiness gate should live in one place.

/** The palette input's placeholder. Distinct from `/search`'s own field. */
export const PALETTE_PLACEHOLDER = /Search recipes or jump to/;

/** The palette dialog, keyed by its sr-only DialogTitle. */
export function palette(page: Page): Locator {
  return page.getByRole("dialog", { name: "Command palette" });
}

/**
 * The palette's field, located by placeholder. Deliberately *not* by an
 * accessible name of "Search recipes": `searchFor()` resolves that name
 * unscoped, so giving the palette input a matching name would make every
 * `/search` spec strict-mode ambiguous the moment the palette is mounted.
 */
export function paletteInput(page: Page): Locator {
  return page.getByPlaceholder(PALETTE_PLACEHOLDER);
}

/**
 * Open via the desktop header trigger and wait for the field. Scoped to the
 * banner because `/search`'s own form carries an `sr-only` submit button that is
 * also named "Search".
 */
export async function openPalette(page: Page): Promise<void> {
  const trigger = page
    .getByRole("banner")
    .getByRole("button", { name: "Search" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(paletteInput(page)).toBeVisible();
}

/**
 * Resolves once the palette's shared FlexSearch index is populated — the
 * palette's analogue of `/search`'s ticker. Without it every result assertion
 * has to carry a bare long timeout and hope.
 */
export async function paletteIndexReady(page: Page): Promise<void> {
  await expect(page.getByTestId("palette-list")).toHaveAttribute(
    "data-index-ready",
    "true",
    { timeout: 20_000 },
  );
}

export async function checkNamesInOrder(
  page: Page,
  names: string[],
): Promise<void> {
  // Scope to the recipe list so semantic list items elsewhere on the page
  // (e.g. pagination's <ul><li>) are not miscounted as recipe cards.
  const items = page.getByTestId("recipe-list").getByRole("listitem");
  await expect(items).toHaveCount(names.length);
  for (let i = 0; i < names.length; i++) {
    await expect(items.nth(i).getByText(names[i])).toBeVisible();
  }
}

/**
 * Click a Delete trigger and confirm the alert dialog it opens.
 *
 * The confirm button is deliberately *not* also called "Delete": fourteen
 * locators across both suites use
 * `getByRole("button", { name: "Delete", exact: true })`, and a second button
 * with that exact name would make every one of them ambiguous. It is
 * "Delete recipe", "Delete menu", and so on — hence `itemLabel`.
 */
export async function deleteWithConfirm(
  page: Page,
  itemLabel: string,
  triggerName = "Delete",
): Promise<void> {
  const trigger = page.getByRole("button", { name: triggerName, exact: true });
  const confirm = page.getByRole("button", {
    name: `Delete ${itemLabel}`,
    exact: true,
  });

  // The trigger is a client island, so a click that lands before it hydrates
  // moves focus and does nothing else — the button ends up focused with no
  // dialog, which is exactly how this failed on the recipe detail page (a
  // heavier page, so a slower hydration). Retrying the click until the dialog is
  // actually open is the honest fix: there is no server-rendered marker that
  // distinguishes "hydrated" for a Radix trigger.
  await expect(async () => {
    await trigger.click();
    await expect(confirm).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await confirm.click();
}
