import { test, expect, type Page } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectNoViolations } from "../support/a11y";

/*
 * A step's stored "uses" (47f): the lines a step brings in are a guess from
 * its text until the recipe says otherwise. The recipe page and the cook
 * view list a stored step's lines exactly, in its order; the edit form's
 * chips are editable — remove one, add a line from the picker, "Back to
 * automatic" — and a step nobody touched stores nothing.
 *
 * The recipes are written through the API (the JSON seat), so no shared
 * fixture's counts move.
 */

type Request = import("@playwright/test").APIRequestContext;

const GUESSED = "guessed-eggnog";
const STORED = "stored-eggnog";

const INGREDIENTS = [
  "4 egg yolks",
  "1/3 cup sugar, plus 1 tablespoon",
  "1 pint whole milk",
  "1 cup heavy cream",
  "3 oz bourbon",
  "1 teaspoon freshly grated nutmeg",
  "4 egg whites",
];

const TEXTS = [
  "Beat the egg yolks until they lighten, then add the 1/3 cup sugar.",
  "Stir in the milk, cream, bourbon and nutmeg.",
  "Beat the egg whites to soft peaks, then add the 1 tablespoon of sugar.",
  "Whisk the egg whites into the mixture and chill.",
  "Serve cold.",
];

/** Nothing stored: every step's list is the guess. */
const guessedEggnog = {
  name: "Guessed Eggnog",
  slug: GUESSED,
  ingredients: INGREDIENTS,
  instructions: TEXTS.map((text) => ({ text })),
};

/**
 * Step 2 in its own order with the nutmeg left out, step 4 bringing nothing
 * in, step 5 with the nutmeg and a name no line goes by.
 */
const storedEggnog = {
  name: "Stored Eggnog",
  slug: STORED,
  ingredients: INGREDIENTS,
  instructions: [
    { text: TEXTS[0] },
    { text: TEXTS[1], uses: ["bourbon", "heavy cream", "whole milk"] },
    { text: TEXTS[2] },
    { text: TEXTS[3], uses: [] },
    { text: TEXTS[4], uses: ["nutmeg", "cinnamon"] },
  ],
};

async function write(request: Request, token: string, data: object) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data,
  });
  expect(response.status()).toBe(201);
}

async function storedSteps(request: Request, slug: string) {
  return (await (await request.get(`/api/recipe/${slug}`)).json()).instructions;
}

async function openEdit(page: Page, slug: string) {
  await page.goto(`/recipe/${slug}/edit`);
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
}

async function save(page: Page, slug: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${slug}$`), {
    timeout: 15_000,
  });
}

/** The form's editor for step `n`. */
const editor = (page: Page, n: number) =>
  page.getByRole("group", { name: `What step ${n} uses`, exact: true });
const chips = (page: Page, n: number) =>
  editor(page, n).getByTestId("step-uses-chip");
const remove = (page: Page, n: number, label: string) =>
  editor(page, n).getByRole("button", {
    name: `Remove ${label} from step ${n}`,
    exact: true,
  });
const adder = (page: Page, n: number) =>
  editor(page, n).getByRole("button", {
    name: `Add an ingredient to step ${n}`,
    exact: true,
  });
/** The picker's list, open: the lines step `n` could add. */
const choices = (page: Page, n: number) =>
  page
    .getByRole("group", {
      name: `Ingredients to add to step ${n}`,
      exact: true,
    })
    .getByRole("button");
const back = (page: Page, n: number) =>
  editor(page, n).getByRole("button", {
    name: `Back to automatic for step ${n}`,
    exact: true,
  });

/** The recipe page's "Uses" list under step `n`. */
const pageUses = (page: Page, n: number) =>
  page
    .locator(`#step-${n}`)
    .getByRole("list", { name: "Uses", exact: true })
    .getByRole("listitem");

test.describe("A step's stored uses (47f)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    const token = await createApiToken();
    await write(request, token, guessedEggnog);
    await write(request, token, storedEggnog);
  });

  test("the recipe page and the cook view list a stored step's lines, in its order", async ({
    page,
    request,
  }) => {
    /* The API answers what was stored, and nothing for the other steps. */
    expect(await storedSteps(request, STORED)).toEqual(
      storedEggnog.instructions,
    );

    await page.goto(`/recipe/${STORED}`);
    /* Step 1 is the guess. */
    await expect(pageUses(page, 1)).toHaveText([
      "4 egg yolks",
      "1/3 cup sugar, plus 1 tablespoon",
    ]);
    /* Step 2: the stored lines in the stored order — no nutmeg, though its
     * text names it. */
    await expect(pageUses(page, 2)).toHaveText([
      "3 oz bourbon",
      "1 cup heavy cream",
      "1 pint whole milk",
    ]);
    /* Step 3 is the guess: the sugar again (its line says "plus"). */
    await expect(pageUses(page, 3)).toHaveText([
      "1/3 cup sugar, plus 1 tablespoon",
      "4 egg whites",
    ]);
    /* Step 4 brings nothing in. */
    await expect(page.locator("#step-4").getByTestId("step-uses")).toHaveCount(
      0,
    );
    /* Step 5: the nutmeg; "cinnamon" is no line and shows nowhere. */
    await expect(pageUses(page, 5)).toHaveText([
      "1 teaspoon freshly grated nutmeg",
    ]);
    await expect(page.locator("#step-5")).not.toContainText("cinnamon");

    /* The cook view reads the same answer. */
    const cook = page.getByRole("button", { name: "Cook view" });
    await expectHydrated(cook);
    await cook.click();
    const view = page.getByRole("dialog", { name: "Cook view: Stored Eggnog" });
    await expect(view).toBeVisible();
    await view.getByTestId("cook-done").click();
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 2 of 5");
    await expect(
      view.getByRole("region", { name: "For this step" }).getByRole("checkbox"),
    ).toHaveCount(3);
    await expect(view.getByTestId("cook-step-uses")).toContainText("bourbon");
    await expect(view.getByTestId("cook-step-uses")).not.toContainText(
      "nutmeg",
    );
  });

  test("a save with no changes stores nothing for any step", async ({
    page,
    request,
  }) => {
    await openEdit(page, GUESSED);
    await expectHydrated(adder(page, 1));
    /* The chips are the guess, and say so. */
    await expect(chips(page, 1)).toHaveText(["egg yolk", "granulated sugar"]);
    await expect(editor(page, 1)).toContainText("guessed from the text");
    await expect(back(page, 1)).toHaveCount(0);
    await save(page, GUESSED);
    expect(await storedSteps(request, GUESSED)).toEqual(
      guessedEggnog.instructions,
    );

    /* And a stored recipe comes back as stored, the unknown name included. */
    await page.goto(`/recipe/${STORED}/edit`);
    await markdownEditorReady(page, "description");
    await expectHydrated(adder(page, 2));
    await save(page, STORED);
    expect(await storedSteps(request, STORED)).toEqual(
      storedEggnog.instructions,
    );
  });

  test("remove a chip, add a line, save, reload, and go back to automatic", async ({
    page,
    request,
  }) => {
    await openEdit(page, GUESSED);
    await expectHydrated(adder(page, 2));
    await expect(chips(page, 2)).toHaveText([
      "milk",
      "heavy cream",
      "bourbon",
      "nutmeg",
    ]);

    /* Remove: the list is the person's now, and focus stays in it. */
    await remove(page, 2, "nutmeg").click();
    await expect(chips(page, 2)).toHaveText(["milk", "heavy cream", "bourbon"]);
    await expect(editor(page, 2)).not.toContainText("guessed from the text");
    await expect(back(page, 2)).toBeVisible();
    await expect(remove(page, 2, "bourbon")).toBeFocused();
    /* The other steps are still guesses: step 5 does not gain the nutmeg
     * chip's line by magic, since its text names none. */
    await expect(editor(page, 1)).toContainText("guessed from the text");

    /* Add, with the mouse: the picker lists the lines the step lacks, whole. */
    await adder(page, 2).click();
    await expect(choices(page, 2)).toHaveText([
      "4 egg yolks",
      "1/3 cup sugar, plus 1 tablespoon",
      "1 teaspoon freshly grated nutmeg",
      "4 egg whites",
    ]);
    await choices(page, 2).filter({ hasText: "4 egg whites" }).click();
    await expect(choices(page, 2)).toHaveCount(0);
    await expect(chips(page, 2)).toHaveText([
      "milk",
      "heavy cream",
      "bourbon",
      "egg white",
    ]);
    await expect(adder(page, 2)).toBeFocused();

    /* Add, with the keyboard: Enter opens the list on its first line, Enter
     * adds it; Escape closes the list and adds nothing. */
    await page.keyboard.press("Enter");
    await expect(choices(page, 2).first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(choices(page, 2)).toHaveCount(0);
    await expect(adder(page, 2)).toBeFocused();
    await expect(chips(page, 2)).toHaveCount(4);
    await page.keyboard.press("Enter");
    await expect(choices(page, 2).first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(choices(page, 2)).toHaveCount(0);
    await expect(chips(page, 2)).toHaveText([
      "milk",
      "heavy cream",
      "bourbon",
      "egg white",
      "egg yolk",
    ]);
    /* And off again, with the keyboard. */
    await remove(page, 2, "egg yolk").focus();
    await page.keyboard.press("Enter");
    await expect(chips(page, 2)).toHaveCount(4);

    await save(page, GUESSED);
    const stored = await storedSteps(request, GUESSED);
    expect(stored[1]).toEqual({
      text: TEXTS[1],
      uses: ["milk", "heavy cream", "bourbon", "egg white"],
    });
    /* Only the step that was touched stores a list. */
    expect([stored[0], stored[2], stored[3], stored[4]]).toEqual(
      [0, 2, 3, 4].map((index) => ({ text: TEXTS[index] })),
    );
    /* The page lists them in that order; the whites came in at step 2, so
     * step 3's guess no longer lists them. */
    await expect(pageUses(page, 2)).toHaveText([
      "1 pint whole milk",
      "1 cup heavy cream",
      "3 oz bourbon",
      "4 egg whites",
    ]);
    await expect(pageUses(page, 3)).toHaveText([
      "1/3 cup sugar, plus 1 tablespoon",
    ]);

    /* Reload the form: the list is still the person's. */
    await page.goto(`/recipe/${GUESSED}/edit`);
    await markdownEditorReady(page, "description");
    await expectHydrated(back(page, 2));
    await expect(chips(page, 2)).toHaveText([
      "milk",
      "heavy cream",
      "bourbon",
      "egg white",
    ]);
    await expect(editor(page, 2)).not.toContainText("guessed from the text");

    /* Back to automatic: the guess again, focus on the picker, and a save
     * stores nothing. */
    await back(page, 2).click();
    await expect(chips(page, 2)).toHaveText([
      "milk",
      "heavy cream",
      "bourbon",
      "nutmeg",
    ]);
    await expect(editor(page, 2)).toContainText("guessed from the text");
    await expect(adder(page, 2)).toBeFocused();
    await save(page, GUESSED);
    expect(await storedSteps(request, GUESSED)).toEqual(
      guessedEggnog.instructions,
    );
  });

  test("every chip removed is a step that brings nothing in", async ({
    page,
    request,
  }) => {
    await openEdit(page, GUESSED);
    await expectHydrated(adder(page, 1));
    await remove(page, 1, "egg yolk").click();
    await remove(page, 1, "granulated sugar").click();
    await expect(chips(page, 1)).toHaveCount(0);
    await expect(editor(page, 1)).toContainText("nothing");
    /* Nothing left to remove: focus is on the picker. */
    await expect(adder(page, 1)).toBeFocused();
    await save(page, GUESSED);
    expect((await storedSteps(request, GUESSED))[0]).toEqual({
      text: TEXTS[0],
      uses: [],
    });
    await expect(page.locator("#step-1").getByTestId("step-uses")).toHaveCount(
      0,
    );
  });

  test("a name no ingredient goes by is said, kept, and removable; the form passes axe", async ({
    page,
    request,
  }) => {
    await openEdit(page, STORED);
    await expectHydrated(adder(page, 5));
    await expect(chips(page, 5)).toHaveText(["nutmeg", "cinnamon"]);
    await expect(editor(page, 5)).toContainText(
      "No ingredient called “cinnamon”.",
    );
    /* A stored empty list, a stored list, a guess and the note, together. */
    await expect(editor(page, 4)).toContainText("nothing");
    await expectNoViolations(page);

    await remove(page, 5, "cinnamon").click();
    await expect(editor(page, 5)).not.toContainText("No ingredient called");
    await save(page, STORED);
    expect((await storedSteps(request, STORED))[4]).toEqual({
      text: TEXTS[4],
      uses: ["nutmeg"],
    });
  });
});
