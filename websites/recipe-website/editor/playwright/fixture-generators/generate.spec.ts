/**
 * Fixture Generation Spec
 *
 * Generates the test fixtures used by other tests.
 * Run explicitly with `pnpm generate-fixtures`; not part of the normal suite.
 */

import { test, expect } from "../support/test";
import { fillMarkdownField, fillSignInForm } from "../support/helpers";

test.describe("Fixture Generation", () => {
  test("generates one-recipe fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    await resetData();
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    await page.getByLabel("Name").fill("Existing Recipe");
    await page.getByLabel("Slug").fill("existing-recipe");
    await page.getByText("Submit").click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Existing Recipe" }),
    ).toBeVisible();

    await copyFixtures("one-recipe");
  });

  test("generates three-recipes fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    await resetData();
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    await page.getByLabel("Name").fill("First Recipe");
    await page.getByLabel("Description").fill("This is the first recipe.");
    await page.getByLabel("Slug").fill("first-recipe");
    await page.getByText("Submit").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "First Recipe" }),
    ).toBeVisible();

    await page.goto("/new-recipe");
    await page.getByLabel("Name").fill("Second Recipe");
    await page.getByLabel("Description").fill("This is the second recipe.");
    await page.getByLabel("Slug").fill("second-recipe");
    await page.getByText("Submit").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Second Recipe" }),
    ).toBeVisible();

    await page.goto("/new-recipe");
    await page.getByLabel("Name").fill("Third Recipe");
    await page.getByLabel("Description").fill("This is the third recipe.");
    await page.getByLabel("Slug").fill("third-recipe");
    await page.getByText("Submit").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Third Recipe" }),
    ).toBeVisible();

    await page.goto("/recipes");
    await expect(page.getByText("First Recipe")).toBeVisible();
    await expect(page.getByText("Second Recipe")).toBeVisible();
    await expect(page.getByText("Third Recipe")).toBeVisible();

    await copyFixtures("three-recipes");
  });

  test("generates one-featured-recipe fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    await resetData();
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    await page.getByLabel("Name").fill("Featured Recipe");
    await page.getByLabel("Slug").fill("featured-recipe");
    await page.getByText("Submit").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Featured Recipe" }),
    ).toBeVisible();

    await page.getByText("Feature").click();
    await page.getByLabel("Note").fill("This recipe is featured for testing.");
    await page.getByText("Submit").click();

    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByText("Featured Recipes")).toBeVisible();
    await expect(
      page
        .locator("h2", { hasText: "Featured Recipes" })
        .locator("xpath=ancestor::*[1]")
        .getByText("Featured Recipe"),
    ).toBeVisible();

    await copyFixtures("one-featured-recipe");
  });

  test("generates many-featured-recipes fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    await resetData();
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    for (let i = 1; i <= 15; i++) {
      await page.goto("/new-recipe");
      await page.getByLabel("Name").fill(`Recipe ${i}`);
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill(`recipe-${i}`);
      await page.getByText("Submit").click();
      await expect(
        page.getByRole("heading", { level: 1, name: `Recipe ${i}` }),
      ).toBeVisible();
    }

    for (let i = 1; i <= 15; i++) {
      await page.goto(`/recipe/recipe-${i}`);
      await page.getByText("Feature").click();
      await page.getByText("Submit").click();
      await expect(page).toHaveURL(/\/$/);
    }

    await page.goto("/featured-recipes");
    await expect(page.getByText("Featured Recipes")).toBeVisible();
    /*
     * All fifteen, on the landing. At `FEATURED_RECIPES_PER_PAGE` = 12 a
     * 15-item corpus has `headPage` 1, so the landing's fold of the head and
     * the page below it covers the whole corpus and there are no numbered
     * pages at all. Deliberately left at 15 — four other specs read this
     * fixture — with `many-featured-recipes-paged` below carrying the
     * pagination cases.
     */
    await expect(page.getByTestId("recipe-list").locator("> li")).toHaveCount(
      15,
    );

    await copyFixtures("many-featured-recipes");
  });

  /**
   * `many-featured-recipes-paged` — every one of `many-recipes`' 40 recipes
   * featured once, "feature-01" … "feature-40", dated one per day from
   * 2024-03-01.
   *
   * Built on top of `many-recipes` rather than from scratch: the 40 dated
   * recipes already exist there, so this is 40 form round-trips instead of 80.
   *
   * At `FEATURED_RECIPES_PER_PAGE` = 12 that lays out as:
   *
   *   page 0: feature-01..12   page 1: feature-13..24
   *   page 2: feature-25..36   page 3: feature-37..40  ← head, partial
   *
   * so `headPage` is 3, the landing folds pages 3 and 2 into sixteen cards,
   * and the numbered routes are exactly `/featured-recipes/1` and `/2` — the
   * same shape `many-recipes` gives the recipe index.
   *
   * The slug and the date are set explicitly on every feature. The older
   * `many-featured-recipes` generator lets both default, which derives the
   * slug from the wall clock at second granularity — fine for 15 items with a
   * form round-trip between them, a collision waiting to happen at 40, and
   * non-deterministic ordering either way.
   */
  test("generates many-featured-recipes-paged fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    // 40 form round-trips; well past the default per-test timeout.
    test.setTimeout(900_000);

    await resetData("many-recipes");
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    for (let i = 1; i <= 40; i++) {
      const number = String(i).padStart(2, "0");
      // 2024-03-01 + (i - 1) days, so the corpus spans Mar 01 … Apr 09.
      const date = new Date(Date.UTC(2024, 2, i)).toISOString().slice(0, 10);

      await page.goto(`/recipe/recipe-${number}`);
      await page.getByText("Feature").click();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill(`feature-${number}`);
      await page.getByLabel("Date (UTC)").fill(`${date}T12:00`);
      await page.getByText("Submit").click();
      await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    }

    await page.goto("/featured-recipes");
    await expect(page.getByTestId("recipe-list").locator("> li")).toHaveCount(
      16,
    );

    await copyFixtures("many-featured-recipes-paged");
  });

  /**
   * `many-recipes` — 40 recipes, "Recipe 01" … "Recipe 40", dated one per day
   * from 2024-01-01 so the ordering is fixed rather than whatever the creation
   * timestamps happened to be.
   *
   * At `RECIPES_PER_PAGE` = 12 that lays out as:
   *
   *   page 0: recipe-01..12   page 1: recipe-13..24
   *   page 2: recipe-25..36   page 3: recipe-37..40  ← head, partial
   *
   * so `headPage` is 3, the landing folds pages 3 and 2 into sixteen recipes,
   * and the numbered routes are exactly `/recipes/1` and `/recipes/2`.
   *
   * Generated against `next dev` while the suite may run against a build —
   * which is precisely the boundary the pinned `version` on `recipesByDate`
   * exists to survive.
   */
  test("generates many-recipes fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    // 40 form round-trips; well past the default per-test timeout.
    test.setTimeout(900_000);

    await resetData();
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    for (let i = 1; i <= 40; i++) {
      const number = String(i).padStart(2, "0");
      // 2024-01-01 + (i - 1) days, so the corpus spans Jan 01 … Feb 09.
      const date = new Date(Date.UTC(2024, 0, i)).toISOString().slice(0, 10);

      await page.goto("/new-recipe");
      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(`Recipe ${number}`);
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill(`recipe-${number}`);
      await page.getByLabel("Date (UTC)").fill(`${date}T12:00`);
      await page.getByText("Submit").click();
      await expect(
        page.getByRole("heading", { level: 1, name: `Recipe ${number}` }),
      ).toBeVisible({ timeout: 20_000 });
    }

    await page.goto("/recipes");
    await expect(page.getByTestId("recipe-list").getByRole("link")).toHaveCount(
      16,
    );

    await copyFixtures("many-recipes");
  });

  /**
   * `search-corpus` — the fixture the search specs exercise. Purpose-built, and
   * additive: nothing else reads it, so its recipe counts are free to change
   * without disturbing the older fixtures' assertions.
   *
   * It carries, deliberately:
   *  - an accented name (Crème Brûlée) for the encoder's diacritic folding,
   *  - descriptions, so the description field is actually in the index,
   *  - a term that appears **only** in a description (pomegranate),
   *  - a term that is a name on one recipe and an ingredient on another
   *    (ginger), pinning the native field-priority ranking,
   *  - prep/cook times on the rich recipes (and none on the filler), so the
   *    query language's `time:` filter has a corpus to compare against — two
   *    recipes come in under 30 minutes, and the filler has no timing at all,
   *  - one deliberately old date, so `before:`/`after:` can discriminate rather
   *    than just parse,
   *  - and enough filler to overflow the results grid's 60-card reveal cap.
   */
  test("generates search-corpus fixture", async ({
    page,
    resetData,
    copyFixtures,
  }) => {
    // ~70 form round-trips; well past the default per-test timeout.
    test.setTimeout(900_000);

    await resetData();
    await page.goto("/new-recipe");
    await fillSignInForm(page);

    const submitRecipe = async (name: string) => {
      await page.getByText("Submit").click();
      await expect(
        page.getByRole("heading", { level: 1, name, exact: true }),
      ).toBeVisible({ timeout: 20_000 });
    };

    const addTag = async (tag: string) => {
      const input = page.getByLabel("Add a tag");
      await input.fill(tag);
      await input.press("Enter");
      await expect(
        page.getByRole("button", { name: `Remove tag ${tag}` }),
      ).toBeVisible();
    };

    // The Duration sub-inputs are titled "<label> Hours" / "<label> Minutes";
    // there is no other stable handle on them, and both halves are their own
    // number field.
    const setDuration = async (label: string, minutes: number) => {
      await page
        .getByTitle(`${label} Hours`)
        .fill(String(Math.floor(minutes / 60)));
      await page.getByTitle(`${label} Minutes`).fill(String(minutes % 60));
    };

    const createRecipe = async (recipe: {
      name: string;
      slug: string;
      description?: string;
      tags?: string[];
      ingredients?: string[];
      prepTime?: number;
      cookTime?: number;
      /** `datetime-local` value; the field parses it as UTC. */
      date?: string;
    }) => {
      await page.goto("/new-recipe");
      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(recipe.name);
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill(recipe.slug);
      if (recipe.date) await page.getByLabel("Date (UTC)").fill(recipe.date);
      if (recipe.prepTime) await setDuration("Prep Time", recipe.prepTime);
      if (recipe.cookTime) await setDuration("Cook Time", recipe.cookTime);

      if (recipe.description) {
        // Description is a Lexical WYSIWYG; drive it through the sanctioned
        // Source-mode helper rather than fill()ing the contenteditable.
        await fillMarkdownField(page, "description", recipe.description);
      }

      for (const tag of recipe.tags ?? []) await addTag(tag);

      if (recipe.ingredients && recipe.ingredients.length > 0) {
        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page
          .getByTitle("Ingredients Paste Area")
          .fill(recipe.ingredients.join("\n"));
        await page.getByText("Import Ingredients", { exact: true }).click();
      }

      await submitRecipe(recipe.name);
    };

    // The one dated recipe. Created first, so it already sorts last in the
    // reverse-chronological browse view — backdating it changes no ordering,
    // and gives `before:`/`after:` a boundary no timezone can straddle.
    await createRecipe({
      name: "Crème Brûlée",
      slug: "creme-brulee",
      date: "2020-05-05T12:00",
      description:
        "A classic French custard baked slow and low, finished under a blowtorch for a caramelized sugar crust.",
      tags: ["dessert", "french"],
      ingredients: ["2 cups heavy cream", "1/2 cup sugar", "6 egg yolks"],
      prepTime: 20,
      cookTime: 180,
    });

    await createRecipe({
      name: "Chocolate Truffle Cake",
      slug: "chocolate-truffle-cake",
      description:
        "A dense flourless chocolate cake with a molten center, best served slightly warm.",
      tags: ["dessert", "chocolate"],
      ingredients: ["200 g dark chocolate", "4 eggs", "1/2 cup butter"],
      prepTime: 20,
      cookTime: 40,
    });

    await createRecipe({
      name: "Tomato Basil Soup",
      slug: "tomato-basil-soup",
      description:
        "Slow-roasted tomatoes blended smooth with fresh basil and a splash of cream.",
      tags: ["soup"],
      ingredients: ["6 ripe tomatoes", "1 bunch basil", "1 cup cream"],
      prepTime: 15,
      cookTime: 45,
    });

    await createRecipe({
      name: "Sourdough Loaf",
      slug: "sourdough-loaf",
      description:
        "A slow-fermented country loaf with a blistered crust and an open, custardy crumb.",
      tags: ["bread", "baked"],
      ingredients: ["500 g bread flour", "1 cup starter", "10 g salt"],
      prepTime: 30,
      cookTime: 45,
    });

    // "pomegranate" lives only in this description — nowhere in any name, tag,
    // or ingredient — so finding it proves the description field is indexed.
    // Also one of the two recipes under half an hour.
    //
    // It is also the corpus's one piece of *real* prose: two paragraphs, with
    // an inline link in the second. That shape is what F23 dropped — the old
    // flattener kept a description only when its compiled children were a bare
    // string, so anything with a paragraph break or a link indexed as "".
    // "smokehouse" appears only in the second paragraph, behind the link, so a
    // search that finds it proves the whole description survives flattening.
    await createRecipe({
      name: "Weeknight Skillet",
      slug: "weeknight-skillet",
      description:
        "A brisk one-pan supper glazed with pomegranate molasses and finished with herbs.\n\nAdapted from [a smokehouse standby](https://example.com/smokehouse), with the char traded for a fast sear under the broiler.",
      tags: ["quick"],
      ingredients: ["2 chicken thighs", "1 onion", "1 tbsp olive oil"],
      prepTime: 10,
      cookTime: 15,
    });

    // Ranking pair: "ginger" is a *name* hit here…
    await createRecipe({
      name: "Ginger Cookies",
      slug: "ginger-cookies",
      description: "Chewy spiced cookies with crackled tops and a sugar crust.",
      tags: ["dessert", "baked"],
      ingredients: ["2 cups flour", "1 cup molasses", "1 tsp cinnamon"],
      prepTime: 20,
      cookTime: 12,
    });

    // …and an *ingredient-only* hit here, so the name hit must sort first.
    // Prep-only, so it also exercises the prep+cook fallback for `time:`.
    await createRecipe({
      name: "Carrot Slaw",
      slug: "carrot-slaw",
      description: "A bright raw salad dressed with rice vinegar and sesame.",
      tags: ["salad", "quick"],
      ingredients: ["4 carrots", "1 tbsp grated ginger", "2 tbsp rice vinegar"],
      prepTime: 10,
    });

    // Filler: no description, tags, or ingredients — pure volume, so the browse
    // view overflows the 60-card cap (7 rich + 60 filler = 67).
    for (let i = 1; i <= 60; i++) {
      await createRecipe({
        name: `Pantry Staple ${i}`,
        slug: `pantry-staple-${i}`,
      });
    }

    await page.goto("/search");
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 67 RECIPES/i,
      { timeout: 30_000 },
    );

    await copyFixtures("search-corpus");
  });
});
