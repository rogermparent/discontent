import { test, expect } from "../support/test";
import {
  checkNamesInOrder,
  fillSignInForm,
  markdownEditorReady,
  deleteWithConfirm,
} from "../support/helpers";

test.describe("Index Page", () => {
  test.describe("when empty", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/");
    });

    test("should not need authorization", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: "Sign In", exact: true }),
      ).toBeVisible();
    });

    test("should inform the user if there are no recipes", async ({ page }) => {
      await expect(page.getByText("There are no recipes yet.")).toBeVisible();
    });

    test("should be able to create and delete a recipe", async ({
      page,
      request,
    }) => {
      const testRecipe = "Test Recipe";

      await expect(page.getByText("There are no recipes yet.")).toBeVisible();

      await page.getByRole("link", { name: "New Recipe", exact: true }).click();
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      await page.getByLabel("Name").fill(testRecipe);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: testRecipe }),
      ).toBeVisible();

      await page.goto("/");
      await page
        .getByRole("link", { name: new RegExp(`^${testRecipe}`) })
        .click();

      await deleteWithConfirm(page, "recipe");
      await expect(page.getByText("There are no recipes yet.")).toBeVisible();

      const response = await request.get("/recipe/test-page");
      expect(response.status()).toBe(404);
    });

    test("should be able to create recipes and see them in chronological order", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await fillSignInForm(page);

      const testNames = ["c", "a", "1"].map((x) => `Recipe ${x}`);
      for (const testRecipe of testNames) {
        await page.goto("/new-recipe");
        await markdownEditorReady(page, "description");
        await page.getByLabel("Name").fill(testRecipe);
        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(
          page.getByRole("heading", { level: 1, name: testRecipe }),
        ).toBeVisible();
      }

      await page.goto("/");
      await checkNamesInOrder(page, testNames.reverse());
    });
  });

  test.describe("with just enough items for the front page", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("front-page-only");
      await page.goto("/");
    });

    test("should not display a link to the index", async ({ page }) => {
      const allNames = [3, 2, 1].map((x) => `Recipe ${x}`);

      await checkNamesInOrder(page, allNames);

      await expect(
        page.getByRole("link", { name: "More Latest Recipes", exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("with seven items", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("two-pages");
      await page.goto("/");
    });

    test("should display the latest six recipes", async ({ page }) => {
      const allNames = [7, 6, 5, 4, 3, 2, 1].map((x) => `Recipe ${x}`);

      await checkNamesInOrder(page, allNames.slice(0, 6));

      await page
        .getByRole("link", { name: "More Latest Recipes", exact: true })
        .click();
      await checkNamesInOrder(page, allNames.slice(0, 7));
    });
  });
});
