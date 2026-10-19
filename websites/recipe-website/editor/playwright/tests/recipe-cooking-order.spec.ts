import { test, expect, type Page } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { snapshotPage } from "../support/visual";
import { expectMode, expectNoViolations } from "../support/a11y";

/*
 * The recipe page in cooking order (42c1): each step's "Uses" list of the
 * ingredient lines it confidently names (D3), the heads-up note above the
 * steps, the ingredients rail that stays beside the steps, and the three
 * columns at 1600px and wider with their Appearance switch.
 *
 * The recipe is written through the API so no shared fixture's counts move.
 */

const SLUG = "make-ahead-pie";

/* Hardcoded, not imported: the key is a contract with readers' browsers
 * (the same reasoning as sticky-chrome.spec's). */
const WIDE_KEY = "recipe-wide-columns";

const WIDE = { width: 1680, height: 1000 };
const DESKTOP = { width: 1440, height: 900 };

async function writePie(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  extraSteps = 0,
) {
  const filler = Array.from({ length: extraSteps }, (_, i) => ({
    text: `Rest ${i + 1}. Admire the pie from across the kitchen while the oven ticks and the timer runs down, then look again in a minute.`,
  }));
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Make-Ahead Pie",
      slug: SLUG,
      ingredients: [
        { ingredient: "For the crust:", type: "heading" },
        "1 1/4 cups all-purpose flour",
        "1/2 teaspoon salt",
        "1/2 cup cold unsalted butter, cubed",
        { ingredient: "For the filling:", type: "heading" },
        "3 large eggs",
        "1 cup packed brown sugar",
        "1/4 teaspoon salt",
      ],
      instructions: [
        {
          name: "Crust",
          instructions: [
            {
              text: "Whisk the flour and salt. Cut in the butter. Wrap the dough and chill for at least 2 hours, or overnight.",
            },
            { text: "Roll it out on a floured counter." },
          ],
        },
        {
          name: "Filling",
          instructions: [{ text: "Whisk the eggs, brown sugar and salt." }],
        },
        { text: "Bake for 50 minutes. Let cool completely." },
        ...filler,
      ],
    },
  });
  expect(response.status()).toBe(201);
}

/** The page's step `n` (its `#step-n` anchor). */
const step = (page: Page, n: number) => page.locator(`#step-${n}`);

test.describe("Recipe page in cooking order (42c1)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("two-pages");
  });

  test("each step lists what it uses; a step that names nothing lists nothing", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writePie(request, await createApiToken());
    await page.goto(`/recipe/${SLUG}`);

    const uses = (n: number) =>
      step(page, n).getByRole("list", { name: "Uses", exact: true });

    /* The crust's step takes the crust's salt — a section disambiguates. */
    await expect(uses(1).getByRole("listitem")).toHaveText([
      "1 1/4 cups all-purpose flour",
      "1/2 teaspoon salt",
      "1/2 cup cold unsalted butter, cubed",
    ]);
    /* "floured" is not flour: whole words only. */
    await expect(step(page, 2).getByTestId("step-uses")).toHaveCount(0);
    await expect(uses(3).getByRole("listitem")).toHaveText([
      "3 large eggs",
      "1 cup packed brown sugar",
      "1/4 teaspoon salt",
    ]);
    await expect(step(page, 4).getByTestId("step-uses")).toHaveCount(0);

    /* Steps number straight through the groups. */
    await expect(page.getByText("steps 1–2", { exact: true })).toBeVisible();
    await expect(page.getByText("step 3", { exact: true })).toBeVisible();

    /* The lists scale with the multiplier, in the reader's unit. */
    const double = page.getByRole("button", { name: "Double batch" });
    await expectHydrated(double);
    await double.click();
    await expect(uses(3).getByRole("listitem").first()).toHaveText(
      "6 large eggs",
    );
  });

  test("a heads-up quotes the sentence and links its step", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writePie(request, await createApiToken());
    await page.goto(`/recipe/${SLUG}`);

    const headsUp = page.getByRole("region", { name: "Heads-up" });
    await expect(headsUp.getByTestId("heads-up-note")).toHaveText([
      "Step 1 says “Wrap the dough and chill for at least 2 hours, or overnight.”",
    ]);
    await headsUp.getByRole("link", { name: "Step 1" }).click();
    await expect(page).toHaveURL(/#step-1$/);
    await expect(step(page, 1)).toBeInViewport();
  });

  for (const mode of ["light", "dark"] as const) {
    test(`the heads-up and the lists stay WCAG 2.2 AA in ${mode} mode, three columns`, async ({
      page,
      request,
      createApiToken,
    }) => {
      await writePie(request, await createApiToken());
      await page.emulateMedia({ colorScheme: mode });
      await page.setViewportSize({ width: 1680, height: 1000 });
      await page.goto(`/recipe/${SLUG}`);
      await expect(page.getByTestId("recipe-heads-up")).toBeVisible();
      await expectMode(page, mode);
      await expectNoViolations(page);
    });
  }

  test("a recipe with no long waits has no heads-up", async ({ page }) => {
    await page.goto("/recipe/recipe-6");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
    await expect(page.getByTestId("recipe-heads-up")).toHaveCount(0);
  });

  test("the ingredients rail stays beside the steps, below the masthead", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writePie(request, await createApiToken(), 14);
    await page.goto(`/recipe/${SLUG}`);
    const rail = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Ingredients" }),
    });
    await expect(rail).toHaveCSS("position", "sticky");

    await step(page, 10).scrollIntoViewIfNeeded();
    await expect(step(page, 10)).toBeInViewport();
    await expect(rail).toBeInViewport();
    const header = await page.getByRole("banner").boundingBox();
    const box = await rail.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  });

  test("with sticky headers off the rail still pins, at the top", async ({
    page,
    request,
    createApiToken,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("recipe-sticky-chrome", "off");
    });
    await writePie(request, await createApiToken(), 14);
    await page.goto(`/recipe/${SLUG}`);
    const rail = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Ingredients" }),
    });
    await step(page, 10).scrollIntoViewIfNeeded();
    await expect(rail).toBeInViewport();
    /* The offset follows the masthead: 0 once it releases, plus 1rem. */
    expect((await rail.boundingBox())!.y).toBeCloseTo(16, 0);
  });
});

test.describe("Wide recipe columns (42c1)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    await writePie(request, await createApiToken());
  });

  async function boxes(page: Page) {
    const ingredients = await page
      .locator("section", {
        has: page.getByRole("heading", { level: 2, name: "Ingredients" }),
      })
      .boundingBox();
    const steps = await page
      .getByRole("heading", { level: 2, name: /^Instructions/ })
      .boundingBox();
    const headsUp = await page
      .getByRole("region", { name: "Heads-up" })
      .boundingBox();
    return { ingredients: ingredients!, steps: steps!, headsUp: headsUp! };
  }

  test("three columns from 1600px: ingredients | steps | notes", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto(`/recipe/${SLUG}`);
    const { ingredients, steps, headsUp } = await boxes(page);
    expect(steps.x).toBeGreaterThan(ingredients.x + ingredients.width);
    expect(headsUp.x).toBeGreaterThan(steps.x + steps.width / 2);
    /* Side by side: the heads-up sits level with the steps, not above. */
    expect(Math.abs(headsUp.y - ingredients.y)).toBeLessThan(40);
    await snapshotPage(page, "recipe-wide-columns.png");
  });

  test("below 1600px nothing changes: the heads-up runs above two columns", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`/recipe/${SLUG}`);
    const { ingredients, steps, headsUp } = await boxes(page);
    expect(headsUp.y + headsUp.height).toBeLessThanOrEqual(ingredients.y);
    expect(steps.x).toBeGreaterThan(ingredients.x + ingredients.width);
  });

  test("the Appearance switch turns it off, and it stays off after a reload", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto(`/recipe/${SLUG}`);
    const appearance = page.getByRole("button", { name: "Appearance" });
    await expectHydrated(appearance);
    await appearance.click();
    await page
      .getByRole("group", { name: "Wide recipe columns" })
      .getByRole("radio", { name: "Off" })
      .click();
    /* Survives the panel closing: the sync lives in AppProviders. */
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("group", { name: "Wide recipe columns" }),
    ).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute(
      "data-recipe-columns",
      "two",
    );
    let { ingredients, headsUp } = await boxes(page);
    expect(headsUp.y + headsUp.height).toBeLessThanOrEqual(ingredients.y);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-recipe-columns",
      "two",
    );
    ({ ingredients, headsUp } = await boxes(page));
    expect(headsUp.y + headsUp.height).toBeLessThanOrEqual(ingredients.y);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), WIDE_KEY),
    ).toBe("off");

    /* Back on: the key is cleared, not written as "on". */
    await expectHydrated(appearance);
    await appearance.click();
    await page
      .getByRole("group", { name: "Wide recipe columns" })
      .getByRole("radio", { name: "On" })
      .click();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), WIDE_KEY))
      .toBeNull();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-recipe-columns",
    );
  });

  test("a stored off is on <html> before hydration — no reflow", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "off");
    }, WIDE_KEY);
    /* No script bundles, so the page never hydrates and `WideRecipeSync`
       never runs: only the inline pre-paint script can set the attribute. */
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.setViewportSize(WIDE);
    await page.goto(`/recipe/${SLUG}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-recipe-columns",
      "two",
    );
    /* And the CSS reads it: two columns, the heads-up above them. */
    const headsUp = (await page
      .getByRole("region", { name: "Heads-up" })
      .boundingBox())!;
    const ingredients = (await page
      .locator("section", {
        has: page.getByRole("heading", { level: 2, name: "Ingredients" }),
      })
      .boundingBox())!;
    expect(headsUp.y + headsUp.height).toBeLessThanOrEqual(ingredients.y);
  });
});

test.describe("Recipe page in cooking order @mobile", () => {
  test("one column on a phone, the lists smaller, no sideways scroll @mobile", async ({
    page,
    request,
    resetData,
    createApiToken,
  }) => {
    await resetData("two-pages");
    await writePie(request, await createApiToken());
    await page.goto(`/recipe/${SLUG}`);

    const headsUp = page.getByRole("region", { name: "Heads-up" });
    const ingredients = page.getByRole("list", {
      name: "Ingredients",
      exact: true,
    });
    await expect(headsUp).toBeVisible();
    /* One column, in order: heads-up, ingredients, then the steps. */
    const headsUpBox = (await headsUp.boundingBox())!;
    const ingredientsBox = (await ingredients.boundingBox())!;
    const stepBox = (await step(page, 1).boundingBox())!;
    expect(headsUpBox.y).toBeLessThan(ingredientsBox.y);
    expect(ingredientsBox.y + ingredientsBox.height).toBeLessThan(stepBox.y);

    await expect(
      step(page, 1).getByRole("list", { name: "Uses", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});
