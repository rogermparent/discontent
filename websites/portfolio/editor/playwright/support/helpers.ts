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
