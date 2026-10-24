import { test, expect, type Page } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { fixturePath } from "../support/tasks";
import { expectNoViolations } from "../support/a11y";

/*
 * Alternatives in the edit form (45e2): adjacent step groups made a choice,
 * its label, its options (the first the default) and their yields; an
 * ingredient heading tied to an option; the ingredients' text mode keeping
 * the tie; an import's suggestion, marked until Save, with Undo (G5); and a
 * label two sets share, refused.
 *
 * The recipes are written through the API so no shared fixture's counts
 * move.
 */

type Request = import("@playwright/test").APIRequestContext;

const PLAIN = "plain-dough";
const CHOSEN = "chosen-dough";

async function write(request: Request, token: string, data: object) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data,
  });
  expect(response.status()).toBe(201);
}

const DOUGH_STEPS = {
  name: "Dough",
  instructions: [{ text: "Mix the flour, water and salt." }],
};

/** No choice yet: a dough, then two bakes, then a shared step. */
const plainDough = {
  name: "Plain Dough",
  slug: PLAIN,
  ingredients: [
    "500 g bread flour",
    { ingredient: "For the pretzels", type: "heading" },
    "1/4 cup baking soda",
  ],
  instructions: [
    DOUGH_STEPS,
    {
      name: "Bagels",
      instructions: [{ text: "Shape and boil the bagels." }],
    },
    {
      name: "Pretzels",
      instructions: [{ text: "Shape the pretzels and dip them." }],
    },
    { text: "Cool on a rack." },
  ],
};

/** Already a choice, a heading tied to the bagels and one not tied. */
const chosenDough = {
  name: "Chosen Dough",
  slug: CHOSEN,
  ingredients: [
    "500 g bread flour",
    { ingredient: "For the bagels", type: "heading", choice: "Then make" },
    "2 tbsp molasses",
    { ingredient: "For the pretzels", type: "heading" },
    "1/4 cup baking soda",
  ],
  instructions: [
    DOUGH_STEPS,
    {
      name: "Bagels",
      choice: "Then make",
      recipeYield: "8 bagels",
      instructions: [{ text: "Shape and boil the bagels." }],
    },
    {
      name: "Pretzels",
      choice: "Then make",
      instructions: [{ text: "Shape the pretzels and dip them." }],
    },
    { text: "Cool on a rack." },
    {
      name: "Sesame",
      choice: "Topping",
      instructions: [{ text: "Sprinkle sesame." }],
    },
    {
      name: "Salt",
      choice: "Topping",
      instructions: [{ text: "Sprinkle salt." }],
    },
  ],
};

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

const setBlock = (page: Page, label: string) =>
  page.getByRole("listitem", { name: `Choice “${label}”`, exact: true });
const picker = (page: Page, name: string) =>
  page.getByRole("group", { name, exact: true });

test.describe("Alternatives in the edit form (45e2)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    const token = await createApiToken();
    await write(request, token, plainDough);
    await write(request, token, chosenDough);
  });

  test("make two groups a choice, give an option a yield, and the page shows tabs", async ({
    page,
    request,
  }) => {
    await openEdit(page, PLAIN);
    const start = page.getByRole("button", {
      name: "Make a choice of groups…",
      exact: true,
    });
    await expectHydrated(start);
    await start.click();

    const panel = page.getByRole("group", { name: "Make a choice" });
    /* Nothing ticked yet, and no label: it says why. */
    await panel
      .getByRole("button", { name: "Make these a choice", exact: true })
      .click();
    await expect(panel).toContainText("Tick at least two groups.");

    await page
      .getByRole("checkbox", { name: "Include “Bagels” in the choice" })
      .check();
    await page
      .getByRole("checkbox", { name: "Include “Pretzels” in the choice" })
      .check();
    await panel
      .getByRole("button", { name: "Make these a choice", exact: true })
      .click();
    await expect(panel).toContainText(
      "Give the choice a label, such as “Then make”.",
    );
    await panel.getByLabel("Choice label").fill("Then make");
    await panel
      .getByRole("button", { name: "Make these a choice", exact: true })
      .click();
    await expect(panel).toHaveCount(0);

    const set = setBlock(page, "Then make");
    await expect(set).toBeVisible();
    await expect(set.getByTestId("choice-option")).toHaveCount(2);
    await expect(set.getByTestId("choice-option").first()).toContainText(
      "Option 1 · default",
    );
    await expect(set).toContainText("The first is the default");

    /* Reorder: Pretzels first, so it is the default. */
    await set
      .getByRole("button", { name: "Move option “Pretzels” up" })
      .click();
    await expect(
      set.getByTestId("choice-option").first().getByLabel("Option name"),
    ).toHaveValue("Pretzels");
    await set
      .getByTestId("choice-option")
      .nth(1)
      .getByLabel("Option yield")
      .fill("8 bagels");

    /* The pretzels heading pairs with an option now: offered, not made. */
    await expect(
      page.getByRole("button", { name: "Tie it to Then make › Pretzels" }),
    ).toBeVisible();

    await save(page, PLAIN);
    await expect(picker(page, "Then make")).toBeVisible();
    await expect(
      picker(page, "Then make").getByRole("radio", { name: "Pretzels" }),
    ).toHaveAttribute("aria-checked", "true");

    const stored = await (await request.get(`/api/recipe/${PLAIN}`)).json();
    expect(stored.instructions).toEqual([
      DOUGH_STEPS,
      {
        name: "Pretzels",
        choice: "Then make",
        instructions: [{ text: "Shape the pretzels and dip them." }],
      },
      {
        name: "Bagels",
        choice: "Then make",
        recipeYield: "8 bagels",
        instructions: [{ text: "Shape and boil the bagels." }],
      },
      { text: "Cool on a rack." },
    ]);
    /* The tie was offered, never made by itself. */
    expect(stored.ingredients[1]).toEqual({
      ingredient: "For the pretzels",
      type: "heading",
    });
  });

  test("tie a heading to an option; the text mode keeps the tie", async ({
    page,
    request,
  }) => {
    await openEdit(page, CHOSEN);
    const tie = page.getByRole("button", {
      name: "Tie it to Then make › Pretzels",
    });
    await expectHydrated(tie);
    await tie.click();
    await expect(tie).toHaveCount(0);
    await expect(page.getByLabel("Ingredient 4 option")).toHaveText(
      "Then make › Pretzels",
    );

    /* Rows → text → rows, the bagels heading edited: both keep their tie. */
    await page
      .getByRole("button", { name: "Edit as text", exact: true })
      .click();
    const text = page.locator("#ingredients-paste-area");
    await text.fill(
      (await text.inputValue()).replace("For the bagels", "For the bagels:"),
    );
    await page.getByRole("button", { name: "Rows", exact: true }).click();
    await expect(page.getByLabel("Ingredient 2 option")).toHaveText(
      "Then make › Bagels",
    );

    await save(page, CHOSEN);
    const stored = await (await request.get(`/api/recipe/${CHOSEN}`)).json();
    expect(
      stored.ingredients
        .filter((line: { type?: string }) => line.type === "heading")
        .map((line: { ingredient: string; choice?: string }) => [
          line.ingredient.replace(/:$/, ""),
          line.choice,
        ]),
    ).toEqual([
      ["For the bagels", "Then make"],
      ["For the pretzels", "Then make"],
    ]);
    /* On the page, the soda shows only for the pretzels. */
    const rail = page.getByRole("list", { name: "Ingredients", exact: true });
    const pretzels = picker(page, "Then make").getByRole("radio", {
      name: "Pretzels",
    });
    await expectHydrated(pretzels);
    await expect(rail.getByText("1/4 cup baking soda")).toBeHidden();
    await pretzels.click();
    await expect(rail.getByText("1/4 cup baking soda")).toBeVisible();
  });

  test("two sets can't share a label; a set of one needs another option", async ({
    page,
  }) => {
    await openEdit(page, CHOSEN);
    const topping = setBlock(page, "Topping");
    const label = topping.getByLabel("Choice label");
    await expectHydrated(label);
    await label.fill("Then make");
    const clash = page.getByText(
      "Two choices are called “Then make”: give each its own label",
    );
    await expect(clash.first()).toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("recipe-form-message")).toHaveText(
      "Couldn't save: 1 problem — Steps.",
    );
    await expect(page.getByTestId("section-errors-steps")).toHaveText(
      "Two choices are called “Then make”: give each its own label",
    );

    /* Fixed by a label of its own; then a removed option leaves one. */
    const fixed = page.getByRole("listitem", {
      name: "Choice “Then make”",
      exact: true,
    });
    await fixed.nth(1).getByLabel("Choice label").fill("Finish with");
    await setBlock(page, "Finish with")
      .getByRole("button", { name: "Remove option “Salt”" })
      .click();
    await expect(setBlock(page, "Finish with")).toContainText(
      "The choice “Finish with” needs at least two options",
    );
    await setBlock(page, "Finish with")
      .getByRole("button", { name: "Not a choice", exact: true })
      .click();
    await expect(setBlock(page, "Finish with")).toHaveCount(0);
    await save(page, CHOSEN);
  });

  test("axe: the edit form with a set and a tie", async ({ page }) => {
    await openEdit(page, CHOSEN);
    await expectHydrated(
      setBlock(page, "Then make").getByLabel("Choice label"),
    );
    await expectNoViolations(page);
  });
});

test.describe("An import's suggested choice (45e2, G5)", () => {
  test.beforeEach(async ({ page, resetData, writeSettings }) => {
    await resetData("importable-uploads");
    await writeSettings({
      ytdlpPath: fixturePath("yt-dlp", "ytdlp-mimic.mjs"),
    });
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
  });

  test("offered, marked when accepted, undone, then saved", async ({
    page,
    request,
  }) => {
    await page
      .getByLabel("Import from URL")
      .fill("https://www.youtube.com/watch?v=EVERYTHING_DOUGH_TEST");
    await page.getByRole("button", { name: "Import", exact: true }).click();

    const card = page.getByTestId("choice-suggestion");
    await expect(card).toContainText(
      "These 5 groups look like alternatives: Large Loaf, Baguettes, Pizza, Bagels and Soft Pretzels. Make them a choice, “Then make”?",
      { timeout: 30_000 },
    );
    await expect(card.getByTestId("choice-suggested-mark")).toHaveText(
      "suggested by the import",
    );
    /* Nothing applied by itself. */
    await expect(page.getByTestId("choice-set")).toHaveCount(0);

    await card.getByRole("button", { name: "Make it a choice" }).click();
    const set = setBlock(page, "Then make");
    await expect(set.getByTestId("choice-option")).toHaveCount(5);
    await expect(set.getByTestId("choice-suggested-mark")).toHaveText(
      "suggested by the import",
    );
    await expect(card).toHaveCount(0);

    await expectNoViolations(page);

    /* Undo: the groups are ordinary again, and the card is back. */
    await set.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByTestId("choice-set")).toHaveCount(0);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Make it a choice" }).click();
    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    const slug = "the-25-minute-no-knead-dough-i-use-to-make-everything";
    await expect(page).toHaveURL(new RegExp(`/recipe/${slug}$`), {
      timeout: 15_000,
    });
    await expect(
      picker(page, "Then make").getByRole("radio", { name: "Large Loaf" }),
    ).toHaveAttribute("aria-checked", "true");
    const stored = await (await request.get(`/api/recipe/${slug}`)).json();
    expect(
      stored.instructions
        .filter((entry: { choice?: string }) => entry.choice)
        .map((entry: { name: string }) => entry.name),
    ).toEqual(["Large Loaf", "Baguettes", "Pizza", "Bagels", "Soft Pretzels"]);
  });

  test("“Not now” puts it away and nothing is set", async ({
    page,
    request,
  }) => {
    await page
      .getByLabel("Import from URL")
      .fill("https://www.youtube.com/watch?v=EVERYTHING_DOUGH_TEST");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    const card = page.getByTestId("choice-suggestion");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(card).toHaveCount(0);
    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    const slug = "the-25-minute-no-knead-dough-i-use-to-make-everything";
    await expect(page).toHaveURL(new RegExp(`/recipe/${slug}$`), {
      timeout: 15_000,
    });
    const stored = await (await request.get(`/api/recipe/${slug}`)).json();
    expect(
      stored.instructions.some((entry: { choice?: string }) => entry.choice),
    ).toBe(false);
  });
});
