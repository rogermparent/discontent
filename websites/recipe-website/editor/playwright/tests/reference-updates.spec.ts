import { test, expect } from "../support/test";
import {
  fillSignInForm,
  fillMarkdownField,
  markdownEditorReady,
} from "../support/helpers";

test.describe("Reference Updates", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData();
    await page.goto("/");
  });

  test.describe("when recipe slug changes", () => {
    test("should update featured recipe reference when recipe slug changes", async ({
      page,
      baseURL,
    }) => {
      await page.getByRole("link", { name: "New Recipe", exact: true }).click();
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      const testRecipe = "Original Recipe Name";
      await page.getByLabel("Name").fill(testRecipe);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: testRecipe }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/");

      await expect(
        page
          .locator("h2", { hasText: "Featured Recipes" })
          .locator("xpath=ancestor::*[1]")
          .getByText(testRecipe),
      ).toBeVisible();

      await page.goto("/recipe/original-recipe-name");
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByLabel("Slug")).toBeVisible();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("renamed-recipe-slug");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/recipe/renamed-recipe-slug");
      await expect(
        page.getByRole("heading", { level: 1, name: testRecipe }),
      ).toBeVisible();

      await page.goto("/");
      await expect(
        page
          .locator("h2", { hasText: "Featured Recipes" })
          .locator("xpath=ancestor::*[1]")
          .getByText(testRecipe),
      ).toBeVisible();

      await page
        .getByText("Featured Recipes", { exact: true })
        .locator("xpath=ancestor::*[1]")
        .getByText(testRecipe)
        .click();
      await expect(page).toHaveURL(baseURL + "/recipe/renamed-recipe-slug");
    });

    test("should update multiple featured recipes when recipe slug changes", async ({
      page,
      baseURL,
    }) => {
      await page.getByRole("link", { name: "New Recipe", exact: true }).click();
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      const testRecipe = "Multi-Featured Recipe";
      await page.getByLabel("Name").fill(testRecipe);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: testRecipe }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await fillMarkdownField(page, "note", "First feature");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/");

      await page.goto("/recipe/multi-featured-recipe");
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await fillMarkdownField(page, "note", "Second feature");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/");

      await page.goto("/recipe/multi-featured-recipe");
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByLabel("Slug")).toBeVisible();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("new-multi-featured");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/recipe/new-multi-featured");

      await page.goto("/featured-recipes");
      await expect(page.getByText(testRecipe)).toHaveCount(2);
      await expect(page.getByText("First feature")).toBeVisible();
      await expect(page.getByText("Second feature")).toBeVisible();

      await page.getByText(testRecipe).first().click();
      await expect(page).toHaveURL(baseURL + "/recipe/new-multi-featured");
    });

    test("should not affect featured recipes for other recipes", async ({
      page,
      baseURL,
    }) => {
      await page.getByRole("link", { name: "New Recipe", exact: true }).click();
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      await page.getByLabel("Name").fill("Recipe A");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/");

      await page.goto("/new-recipe");
      await page.getByLabel("Name").fill("Recipe B");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/");

      await page.goto("/recipe/recipe-a");
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByLabel("Slug")).toBeVisible();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("recipe-a-renamed");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/recipe/recipe-a-renamed");

      await page.goto("/featured-recipes");
      await expect(page.getByText("Recipe A", { exact: true })).toBeVisible();
      await expect(page.getByText("Recipe B", { exact: true })).toBeVisible();

      await page.getByText("Recipe A", { exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/recipe/recipe-a-renamed");

      await page.goto("/featured-recipes");
      await page.getByText("Recipe B", { exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/recipe/recipe-b");
    });

    test("should handle recipe slug change when no featured recipes exist", async ({
      page,
      baseURL,
    }) => {
      await page.getByRole("link", { name: "New Recipe", exact: true }).click();
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      await page.getByLabel("Name").fill("Lonely Recipe");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Lonely Recipe" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByLabel("Slug")).toBeVisible();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("still-lonely");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/recipe/still-lonely");
      await expect(
        page.getByRole("heading", { level: 1, name: "Lonely Recipe" }),
      ).toBeVisible();
    });

    test("should preserve featured recipe note after reference update", async ({
      page,
      baseURL,
    }) => {
      await page.getByRole("link", { name: "New Recipe", exact: true }).click();
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      const testRecipe = "Recipe with Note";
      await page.getByLabel("Name").fill(testRecipe);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: testRecipe }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await fillMarkdownField(
        page,
        "note",
        "This is an important note about the feature",
      );
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/");

      await page.goto("/recipe/recipe-with-note");
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByLabel("Slug")).toBeVisible();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("renamed-with-note");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/recipe/renamed-with-note");

      await page.goto("/featured-recipes");
      await expect(page.getByText(testRecipe)).toBeVisible();
      await expect(
        page.getByText("This is an important note about the feature"),
      ).toBeVisible();

      await page.getByText(testRecipe).click();
      await expect(page).toHaveURL(baseURL + "/recipe/renamed-with-note");
    });
  });
});
