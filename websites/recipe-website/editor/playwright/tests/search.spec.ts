import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  searchFor,
} from "../support/helpers";

const searchField = (page: Page) => page.getByLabel("Search recipes");

test.describe("Search Page", () => {
  test.describe("with many featured recipes", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("many-featured-recipes");
      await page.goto("/search");
    });

    test("should preserve search state between search page and featured recipe selector", async ({
      page,
    }) => {
      await searchFor(page, "Recipe 5");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 5");

      await page.goto("/featured-recipe/new");
      await fillSignInForm(page);
      // The FeaturedRecipe form (Select-Recipe button + note editor) is one
      // client island; gate on the note editor hydrating so the Select Recipe
      // click isn't swallowed mid-hydration.
      await markdownEditorReady(page, "note");

      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();

      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(searchField(page)).toHaveValue("Recipe 5");
    });
  });

  test.describe("with seven items", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("two-pages");
      await page.goto("/search");
    });

    test("should not need authorization", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: "Sign In", exact: true }),
      ).toBeVisible();
    });

    // The URL sync uses replaceState (a live field would otherwise push a
    // history entry per debounced keystroke), so consecutive searches no longer
    // stack history — but the *URL* still tracks the query, which is what makes
    // a search shareable and reload-safe. That is what this asserts now.
    test("keeps the URL in step with the query without stacking history", async ({
      page,
    }) => {
      await searchFor(page, "Recipe 5");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 5");
      await expect(page).toHaveURL(/[?&]q=Recipe\+5/);

      await searchFor(page, "Recipe 6");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6");
      await expect(page).toHaveURL(/[?&]q=Recipe\+6/);

      // Both searches replaced the same entry, so one Back leaves /search
      // entirely instead of walking backwards through every keystroke.
      await page.goBack();
      await expect(page).not.toHaveURL(/\/search/);
    });

    test("a shared search URL restores the query and its results", async ({
      page,
    }) => {
      await page.goto("/search?q=Recipe%205");

      await expect(searchField(page)).toHaveValue("Recipe 5");
      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 5", { timeout: 15_000 });
    });

    test("returns to the last search when coming back from a recipe", async ({
      page,
    }) => {
      await searchFor(page, "Recipe 6");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6", { timeout: 15_000 });

      await page.getByRole("listitem").first().getByRole("heading").click();

      await expect(
        page.getByRole("heading", { name: /Ingredients/ }),
      ).toBeVisible();

      await page.goBack();

      await expect(searchField(page)).toHaveValue("Recipe 6");
      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6");
    });

    test("should be able to find a single recipe by name", async ({ page }) => {
      await searchFor(page, "Recipe 6");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6", { timeout: 15_000 });

      await searchFor(page, "6 Recipe");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6");

      await searchFor(page, "recipe 6");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6");

      await searchFor(page, "6");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 6");

      await searchFor(page, "5");

      await expect(
        page.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Recipe 5");
    });

    test("should be able to find a recipe by ingredient", async ({ page }) => {
      await searchFor(page, "sal");

      await expect(page.getByRole("heading", { name: "Recipe 6" })).toBeVisible(
        { timeout: 15_000 },
      );

      await expect(
        page.getByText(/^1 1\/2 tsp.*t$/).getByText("sal"),
      ).toBeVisible();
    });
  });
});
