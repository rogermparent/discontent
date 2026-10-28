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
const CAKE = "cake-framework";

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

/** Two sets side by side: a crumb, then a frosting. */
const cakeFramework = {
  name: "Cake Framework",
  slug: CAKE,
  ingredients: [
    "2 cups flour",
    { ingredient: "For the chocolate", type: "heading", choice: "Frosting" },
    "1/2 cup cocoa",
  ],
  instructions: [
    { name: "Cake", instructions: [{ text: "Mix the batter and bake." }] },
    {
      name: "Vanilla",
      choice: "Crumb",
      instructions: [{ text: "Add the vanilla." }],
    },
    {
      name: "Streusel",
      choice: "Crumb",
      instructions: [{ text: "Rub in the streusel." }],
    },
    {
      name: "Cream cheese",
      choice: "Frosting",
      instructions: [{ text: "Beat the cream cheese." }],
    },
    {
      name: "Chocolate",
      choice: "Frosting",
      instructions: [{ text: "Melt the chocolate." }],
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
    await write(request, token, cakeFramework);
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
    /* Focus goes to the panel, so its instructions are read. */
    await expect(panel).toBeFocused();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(start).toBeFocused();
    await start.click();
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
    /* Focus lands on the new set's label. */
    await expect(set.getByLabel("Choice label")).toBeFocused();
    await expect(set.getByTestId("choice-option")).toHaveCount(2);
    await expect(set.getByTestId("choice-option").first()).toContainText(
      "Option 1 · default",
    );
    await expect(set).toContainText("The first is the default");

    /* A third option: focus on its name. Then, from the keyboard, Bagels
     * moved down twice — the same card each time, focus on its button. */
    await set
      .getByRole("button", { name: "Add an option", exact: true })
      .click();
    const names = set.getByLabel("Option name");
    await expect(names.nth(2)).toBeFocused();
    const down = set.getByRole("button", { name: "Move option “Bagels” down" });
    await down.focus();
    await page.keyboard.press("Enter");
    await expect(down).toBeFocused();
    await page.keyboard.press("Enter");
    for (const [at, name] of ["Pretzels", "", "Bagels"].entries()) {
      await expect(names.nth(at)).toHaveValue(name);
    }
    /* At the bottom, "down" is off: focus stays on the card, on "up". */
    await expect(
      set.getByRole("button", { name: "Move option “Bagels” up" }),
    ).toBeFocused();
    /* The empty option removed: focus on the name of the card that takes
     * its place. */
    await set.getByRole("button", { name: "Remove option “Option 2”" }).click();
    await expect(names.nth(1)).toBeFocused();
    await expect(names.nth(1)).toHaveValue("Bagels");
    await expect(names.first()).toHaveValue("Pretzels");
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
    /* Focus on the group that was its first option. */
    await expect(page.locator(":focus")).toHaveValue("Sesame");
    await save(page, CHOSEN);
  });

  test("a label cleared and retyped key by key keeps its ties", async ({
    page,
    request,
  }) => {
    await openEdit(page, CHOSEN);
    /* By place, not by label: the label is what changes. */
    const set = page.getByTestId("choice-set").first();
    const label = set.getByLabel("Choice label");
    await expectHydrated(label);
    await label.click();
    await label.press("End");
    for (let i = 0; i < "Then make".length; i++) {
      await label.press("Backspace");
    }
    await expect(label).toHaveValue("");
    await expect(set).toContainText(
      "The choice starting with “Bagels” needs a label",
    );
    await expect(label).toHaveAttribute("aria-invalid", "true");
    await label.pressSequentially("Bake");
    await label.press("Tab");
    await expect(page.getByLabel("Ingredient 2 option")).toHaveText(
      "Bake › Bagels",
    );

    await save(page, CHOSEN);
    const stored = await (await request.get(`/api/recipe/${CHOSEN}`)).json();
    expect(stored.ingredients[1]).toEqual({
      ingredient: "For the bagels",
      type: "heading",
      choice: "Bake",
    });
    expect(
      stored.instructions.map((entry: { choice?: string }) => entry.choice),
    ).toEqual([undefined, "Bake", "Bake", undefined, "Topping", "Topping"]);
  });

  test("typing a neighbour's label never merges two sets", async ({
    page,
    request,
  }) => {
    await openEdit(page, CAKE);
    const sets = page.getByTestId("choice-set");
    const frosting = sets.nth(1);
    const label = frosting.getByLabel("Choice label");
    await expectHydrated(label);
    await label.selectText();
    await label.press("Backspace");
    await label.pressSequentially("Crumb");
    /* Still two blocks, the field still has focus, and it says why. */
    await expect(sets).toHaveCount(2);
    await expect(label).toBeFocused();
    await expect(frosting).toContainText(
      "Two choices next to each other can't share a label",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("recipe-form-message")).toHaveText(
      "Couldn't save: 1 problem — Steps.",
    );
    /* Its heading waits under the old label meanwhile. */
    await expect(page.getByTestId("heading-tie")).toContainText(
      "Tied to the choice “Frosting”",
    );

    /* An option's name problem is linked to its field. */
    const chocolate = frosting.getByLabel("Option name").nth(1);
    await chocolate.fill("");
    await expect(chocolate).toHaveAttribute("aria-invalid", "true");
    await expect(chocolate).toHaveAccessibleDescription(
      "An option of the choice “Crumb” needs a name",
    );
    await chocolate.fill("Chocolate");
    await expect(chocolate).not.toHaveAttribute("aria-invalid");

    await label.click();
    await label.press("End");
    await label.pressSequentially("s");
    await label.press("Tab");
    await expect(page.getByLabel("Ingredient 2 option")).toHaveText(
      "Crumbs › Chocolate",
    );
    await save(page, CAKE);
    const stored = await (await request.get(`/api/recipe/${CAKE}`)).json();
    expect(
      stored.instructions.map((entry: { choice?: string }) => entry.choice),
    ).toEqual([undefined, "Crumb", "Crumb", "Crumbs", "Crumbs"]);
    expect(stored.ingredients[1].choice).toBe("Crumbs");
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
    const set = page.getByTestId("choice-set");
    await expect(set.getByTestId("choice-option")).toHaveCount(5);
    await expect(set.getByTestId("choice-suggested-mark")).toHaveText(
      "suggested by the import",
    );
    await expect(card).toHaveCount(0);
    /* Focus on its label; relabelled, it is still the suggestion, marked,
     * with its Undo. */
    const label = set.getByLabel("Choice label");
    await expect(label).toBeFocused();
    await label.selectText();
    await label.pressSequentially("Shape it as");
    await label.press("Tab");
    await expect(setBlock(page, "Shape it as")).toBeVisible();
    await expect(set.getByTestId("choice-suggested-mark")).toHaveText(
      "suggested by the import",
    );

    /* The imported video's player is a third-party embed (its iframe has
     * no title): outside what this phase draws. */
    await expectNoViolations(page, { exclude: ["youtube-video"] });

    /* Undo: the groups are ordinary again, the card is back, and focus is
     * on its button. */
    await set.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByTestId("choice-set")).toHaveCount(0);
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Make it a choice" }),
    ).toBeFocused();

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
    /* Focus on the first of its groups. */
    await expect(page.locator(":focus")).toHaveValue("Large Loaf");
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
