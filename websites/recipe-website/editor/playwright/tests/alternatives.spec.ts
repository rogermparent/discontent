import { test, expect, type Page } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { fillSignInForm } from "../support/helpers";
import { snapshotPage } from "../support/visual";
import { expectMode, expectNoViolations } from "../support/a11y";

/*
 * Alternatives (45e1): consecutive step groups with one `choice` are a set
 * the reader picks an option of — segmented buttons above the set, the
 * option's extra ingredient lines in the rail, its yield in the meta strip,
 * the steps numbered along the chosen path (G4), the pick linkable with
 * `?pick=` and remembered on the device (G3), the cook view and "Add to
 * list" on the same pick.
 *
 * The recipes are written through the API so no shared fixture's counts
 * move.
 */

const SLUG = "everything-dough-test";
const NAME = "Everything Dough";
const CAKE = "two-set-coffee-cake";

type Request = import("@playwright/test").APIRequestContext;

async function writeDough(request: Request, token: string) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: NAME,
      slug: SLUG,
      recipeYield: "1 batch of dough",
      ingredients: [
        { ingredient: "For the dough", type: "heading" },
        "500 g bread flour",
        "350 g warm water",
        "10 g salt",
        { ingredient: "For the bagels", type: "heading", choice: "Then make" },
        "2 tbsp molasses",
        {
          ingredient: "For the pretzels",
          type: "heading",
          choice: "Then make",
        },
        "1/4 cup baking soda",
        "Flaky sea salt, for topping",
      ],
      instructions: [
        {
          name: "Dough",
          instructions: [
            { text: "Mix the flour, water and salt into a shaggy dough." },
            { text: "Cover and let rise for 1 hour." },
          ],
        },
        {
          name: "Bagels",
          choice: "Then make",
          recipeYield: "8 bagels",
          instructions: [
            { text: "Shape 8 bagels. Cover and refrigerate overnight." },
            { text: "Boil with the molasses for 30 seconds a side." },
            { text: "Bake for 20 minutes." },
          ],
        },
        {
          name: "Pretzels",
          choice: "Then make",
          recipeYield: "8 pretzels",
          instructions: [
            { text: "Shape 8 pretzels." },
            {
              text: "Dip in the baking soda bath, sprinkle with the flaky salt and bake for 15 minutes.",
            },
          ],
        },
        {
          name: "Pizza",
          choice: "Then make",
          instructions: [{ text: "Stretch, top and bake for 12 minutes." }],
        },
        { text: "Cool on a rack for 10 minutes." },
      ],
    },
  });
  expect(response.status()).toBe(201);
}

/** Two sets with a shared step between them. */
async function writeCake(request: Request, token: string) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Two-Set Coffee Cake",
      slug: CAKE,
      ingredients: [
        "2 cups flour",
        { ingredient: "For the streusel", type: "heading", choice: "Crumb" },
        "1/2 cup brown sugar",
        { ingredient: "For the oat crumb", type: "heading", choice: "Crumb" },
        "1 cup oats",
        {
          ingredient: "For the cream cheese",
          type: "heading",
          choice: "Frosting",
        },
        "8 oz cream cheese",
        {
          ingredient: "For the brown butter",
          type: "heading",
          choice: "Frosting",
        },
        "1/2 cup butter",
      ],
      instructions: [
        {
          name: "Streusel",
          choice: "Crumb",
          instructions: [{ text: "Rub the sugar into the flour." }],
        },
        {
          name: "Oat crumb",
          choice: "Crumb",
          instructions: [{ text: "Toss the oats." }, { text: "Rest." }],
        },
        { text: "Bake the cake for 40 minutes." },
        {
          name: "Cream cheese",
          choice: "Frosting",
          instructions: [{ text: "Beat the cream cheese." }],
        },
        {
          name: "Brown butter",
          choice: "Frosting",
          instructions: [{ text: "Brown the butter." }, { text: "Whip it." }],
        },
        { text: "Frost and serve." },
      ],
    },
  });
  expect(response.status()).toBe(201);
}

const picker = (page: Page, name = "Then make") =>
  page.getByRole("group", { name, exact: true });
const option = (page: Page, name: string, set = "Then make") =>
  picker(page, set).getByRole("radio", { name, exact: true });
const rail = (page: Page) =>
  page.getByRole("list", { name: "Ingredients", exact: true });
const yieldValue = (page: Page) =>
  page.locator("dl div", { hasText: "Yield" }).locator("dd");

async function openDough(page: Page, query = "") {
  await page.goto(`/recipe/${SLUG}${query}`);
  await expectHydrated(option(page, "Bagels"));
}

test.describe("Alternatives on the recipe page (45e1)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    await writeDough(request, await createApiToken());
  });

  test("the server renders the default; a pick moves the steps, their numbers, the rail and the yield", async ({
    page,
    request,
  }) => {
    /* U1: the HTML is the default path, every option in it. */
    const html = await (await request.get(`/recipe/${SLUG}`)).text();
    expect(html).toContain('id="step-bagels-3"');
    expect(html).toContain('id="step-pretzels-3"');
    expect(html).toContain('id="step-6"');

    await openDough(page);
    await expect(option(page, "Bagels")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#step-bagels-3")).toBeVisible();
    await expect(page.locator("#step-pretzels-3")).toBeHidden();
    await expect(page.locator("#step-6")).toContainText(
      "Cool on a rack for 10 minutes.",
    );
    await expect(page.getByText("steps 3–5", { exact: true })).toBeVisible();
    await expect(rail(page).getByText("2 tbsp molasses")).toBeVisible();
    await expect(rail(page).getByText("1/4 cup baking soda")).toBeHidden();
    await expect(
      rail(page).getByTestId("choice-extras-note").first(),
    ).toHaveText("Only for Bagels · choose another");
    await expect(yieldValue(page)).toHaveText("8 bagels");

    await option(page, "Pretzels").click();
    await expect(option(page, "Pretzels")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#step-pretzels-3")).toBeVisible();
    await expect(page.locator("#step-bagels-3")).toBeHidden();
    /* The shared step after the set continues from the pretzels' last. */
    await expect(page.locator("#step-5")).toContainText("Cool on a rack");
    await expect(page.locator("#step-6")).toHaveCount(0);
    await expect(rail(page).getByText("1/4 cup baking soda")).toBeVisible();
    await expect(rail(page).getByText("2 tbsp molasses")).toBeHidden();
    await expect(yieldValue(page)).toHaveText("8 pretzels");
    await expect(page).toHaveURL(
      new RegExp(`/recipe/${SLUG}\\?pick=pretzels$`),
    );

    /* An option without a yield: the recipe's own. */
    await option(page, "Pizza").click();
    await expect(yieldValue(page)).toHaveText("1 batch of dough");
    await expect(page.locator("#step-4")).toContainText("Cool on a rack");

    /* Back to the default: the address drops the parameter. */
    await option(page, "Bagels").click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`));
  });

  test("arrow keys move between the options", async ({ page }) => {
    await openDough(page);
    await option(page, "Bagels").focus();
    await page.keyboard.press("ArrowRight");
    await expect(option(page, "Pretzels")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(option(page, "Pretzels")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("a ?pick= link opens on its option, and the device remembers a pick", async ({
    page,
  }) => {
    await openDough(page, "?pick=pizza");
    await expect(option(page, "Pizza")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#step-pizza-3")).toBeVisible();

    await option(page, "Pretzels").click();
    await page.goto(`/recipe/${SLUG}`);
    await expectHydrated(option(page, "Pretzels"));
    await expect(option(page, "Pretzels")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#step-pretzels-3")).toBeVisible();

    /* A link wins over what the device remembers; a stale one is ignored. */
    await openDough(page, "?pick=bagels");
    await expect(option(page, "Bagels")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await openDough(page, "?pick=focaccia");
    await expect(option(page, "Pretzels")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("All shows every option stacked, and print shows them all", async ({
    page,
  }) => {
    await openDough(page);
    await option(page, "All").click();
    for (const id of ["#step-bagels-3", "#step-pretzels-3", "#step-pizza-3"]) {
      await expect(page.locator(id)).toBeVisible();
    }
    await expect(rail(page).getByText("2 tbsp molasses")).toBeVisible();
    await expect(rail(page).getByText("1/4 cup baking soda")).toBeVisible();
    await expect(page).toHaveURL(/\?pick=all$/);

    await option(page, "Bagels").click();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#step-pretzels-3")).toBeVisible();
    await expect(rail(page).getByText("1/4 cup baking soda")).toBeVisible();
    await expect(picker(page)).toBeHidden();
  });

  test("the heads-up follows the path", async ({ page }) => {
    await openDough(page);
    const notes = page.getByTestId("heads-up-note");
    await expect(notes).toHaveText([
      "Step 3 says “Cover and refrigerate overnight.”",
    ]);
    await expect(notes.getByRole("link", { name: "Step 3" })).toHaveAttribute(
      "href",
      "#step-bagels-3",
    );
    await option(page, "Pretzels").click();
    await expect(page.getByTestId("recipe-heads-up")).toHaveCount(0);
  });

  test("a step's Uses are the chosen option's lines", async ({ page }) => {
    await openDough(page, "?pick=pretzels");
    await expect(
      page
        .locator("#step-pretzels-4")
        .getByRole("list", { name: "Uses", exact: true })
        .getByRole("listitem"),
    ).toContainText(["1/4 cup baking soda"]);
  });

  test("the cook view cooks the chosen path, with its own picker and ticks", async ({
    page,
  }) => {
    await openDough(page);
    await option(page, "Pretzels").click();
    const button = page.getByRole("button", { name: "Cook view" });
    await button.click();
    const view = page.getByRole("dialog", { name: `Cook view: ${NAME}` });
    await expect(view).toBeVisible();
    /* Dough 2 + pretzels 2 + cool 1. */
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 1 of 5");
    const cookPicker = view.getByRole("group", {
      name: "Then make",
      exact: true,
    });
    await expect(
      cookPicker.getByRole("radio", { name: "Pretzels", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    /* No "All" here: one path to cook. */
    await expect(
      cookPicker.getByRole("radio", { name: "All", exact: true }),
    ).toHaveCount(0);

    await view.getByTestId("cook-done").click();
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 2 of 5");

    await cookPicker
      .getByRole("radio", { name: "Bagels", exact: true })
      .click();
    /* Bagels keeps its own ticks: none yet. */
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 1 of 6");
    await view.getByRole("button", { name: "All steps" }).click();
    await expect(view.getByText("Boil with the molasses")).toBeVisible();
    await expect(view.getByText("Dip in the baking soda bath")).toHaveCount(0);

    /* The page followed. */
    await view.getByRole("button", { name: "Close cook view" }).click();
    await expect(option(page, "Bagels")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    /* Back to pretzels: its tick is still there. */
    await option(page, "Pretzels").click();
    await button.click();
    await view.getByRole("button", { name: "All steps" }).click();
    await expect(view.getByTestId("cook-progress")).toHaveText(
      "1 of 5 steps done",
    );
  });

  for (const mode of ["light", "dark"] as const) {
    test(`the picker stays WCAG 2.2 AA in ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await openDough(page);
      await expectMode(page, mode);
      await expectNoViolations(page);
      await option(page, "All").click();
      await expectNoViolations(page);
    });
  }

  test("desktop @visual", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDough(page, "?pick=pretzels");
    await expect(page.locator("#step-pretzels-3")).toBeVisible();
    await snapshotPage(page, "alternatives-desktop.png");
  });
});

test.describe("Two sets of alternatives (45e1)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    await writeCake(request, await createApiToken());
  });

  test("each set picks on its own, the count running through both", async ({
    page,
  }) => {
    await page.goto(
      `/recipe/${CAKE}?pick=crumb:oat-crumb,frosting:brown-butter`,
    );
    const oat = option(page, "Oat crumb", "Crumb");
    await expectHydrated(oat);
    await expect(oat).toHaveAttribute("aria-checked", "true");
    await expect(option(page, "Brown butter", "Frosting")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#step-oat-crumb-1")).toBeVisible();
    await expect(page.locator("#step-3")).toContainText("Bake the cake");
    await expect(page.locator("#step-brown-butter-5")).toBeVisible();
    await expect(page.locator("#step-6")).toContainText("Frost and serve.");
    await expect(rail(page).getByText("1 cup oats")).toBeVisible();
    await expect(rail(page).getByText("1/2 cup brown sugar")).toBeHidden();

    await option(page, "Streusel", "Crumb").click();
    await expect(page.locator("#step-2")).toContainText("Bake the cake");
    await expect(page).toHaveURL(/\?pick=frosting(:|%3A)brown-butter$/);
  });
});

test.describe("Alternatives and the shopping list (45e1)", () => {
  test.beforeEach(
    async ({ resetData, initializeContentGit, request, createApiToken }) => {
      await resetData("shopping");
      await initializeContentGit();
      await writeDough(request, await createApiToken());
    },
  );

  test("Add to list adds the chosen option's lines", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/shopping");
    await fillSignInForm(page);
    await expect(
      page.getByRole("heading", { name: "Shopping list" }),
    ).toBeVisible();
    await openDough(page, "?pick=pretzels");
    const add = page.getByRole("button", { name: "Add to list" });
    await expectHydrated(add);
    await add.click();
    /* Flour, water, salt + baking soda and flaky salt; no molasses. */
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      "5 items added",
    );
    expect((await getContentGitLog())[0]).toBe(
      `Update shopping list: +${NAME} (5 items)`,
    );
    await page.goto("/shopping");
    const list = page.getByTestId("shopping-list");
    await expect(list).toContainText("baking soda");
    await expect(list).not.toContainText("molasses");
  });
});

test.describe("Alternatives on a phone @mobile", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    await writeDough(request, await createApiToken());
  });

  test("the picker wraps, nothing scrolls sideways @visual", async ({
    page,
  }) => {
    await openDough(page);
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(width).toBeLessThanOrEqual(0);
    await snapshotPage(page, "alternatives-phone.png");
  });
});
