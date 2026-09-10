import { readFileSync } from "node:fs";
import { test, expect } from "../support/test";
import {
  checkNamesInOrder,
  fillSignInForm,
  markdownEditorReady,
} from "../support/helpers";
import { fixturePath } from "../support/tasks";

test.describe("Recipe Edit View", () => {
  test.describe("with seven items", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("two-pages");
      await page.goto("/recipe/recipe-6/edit");
    });

    test("should need authorization", async ({ page }) => {
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should require authorization even when recipe doesn't exist", async ({
      page,
    }) => {
      await page.goto("/recipe/non-existent-recipe/edit");
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
        // Gate on the recipe-form island hydrating so early field interactions
        // aren't dropped/reset mid-hydration (dev-mode flake).
        await markdownEditorReady(page, "description");
      });

      test("should be able to add a video to an existing recipe", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        await page.getByLabel("Video").setInputFiles({
          name: "sample-video.mp4",
          mimeType: "video/mp4",
          buffer: readFileSync(fixturePath("videos", "sample-video.mp4")),
        });

        await expect(page.locator("video")).toHaveAttribute("src", /^blob:/);

        await page.getByText("Paste Instructions", { exact: true }).click();
        await page
          .getByTitle("Instructions Paste Area")
          .fill(`Do the first step like <VideoTime time={10}>10s</VideoTime>`);

        await page.getByText("Import Instructions", { exact: true }).click();

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: "Recipe 6" }),
        ).toBeVisible();
        await expect(page.locator("video")).toBeAttached();
      });

      test("should be able to edit a recipe", async ({ page }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        const editedRecipeTitle = "Edited Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(editedRecipeTitle);

        const recipeDate = "2023-12-08T01:16:12.622";
        await expect(page.getByLabel("Date (UTC)")).toHaveValue(recipeDate);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: editedRecipeTitle }),
        ).toBeVisible();

        await page.goto("/");
        await expect(page.getByText(editedRecipeTitle)).toBeVisible();
        await checkNamesInOrder(page, [
          "Recipe 7",
          editedRecipeTitle,
          "Recipe 5",
          "Recipe 4",
          "Recipe 3",
          "Recipe 2",
        ]);

        const dateText = new Date(recipeDate + "Z").toLocaleString(undefined, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
        });
        await expect(
          page
            .getByText("Recipe 2", { exact: true })
            .locator("xpath=ancestor::*[1]")
            .getByText(dateText),
        ).toBeVisible();
      });

      test("should be able to edit a recipe with prep and cook times", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        const editedRecipeTitle = "Edited Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(editedRecipeTitle);

        const recipeDate = "2023-12-08T01:16:12.622";
        await expect(page.getByLabel("Date (UTC)")).toHaveValue(recipeDate);

        await expect(page.getByTitle("Prep Time Minutes")).toHaveValue("");
        await expect(page.getByTitle("Prep Time Hours")).toHaveValue("");
        await expect(page.getByTitle("Cook Time Minutes")).toHaveValue("");
        await expect(page.getByTitle("Cook Time Hours")).toHaveValue("");
        await expect(page.getByTitle("Total Time Minutes")).toHaveValue("");
        await expect(page.getByTitle("Total Time Hours")).toHaveValue("");

        await page.getByTitle("Prep Time Minutes").fill("10");
        await page.getByTitle("Cook Time Minutes").fill("20");
        await page.getByTitle("Cook Time Hours").fill("1");
        await expect(page.getByTitle("Total Time Hours")).toHaveAttribute(
          "placeholder",
          "1",
        );
        await expect(page.getByTitle("Total Time Minutes")).toHaveAttribute(
          "placeholder",
          "30",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: editedRecipeTitle }),
        ).toBeVisible();

        await expect(
          page
            .getByText("Prep", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("10 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Cook", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("1 hr 20 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Total", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("1 hr 30 min"),
        ).toBeVisible();

        await page.goto("/");
        await expect(page.getByText(editedRecipeTitle)).toBeVisible();
        await checkNamesInOrder(page, [
          "Recipe 7",
          editedRecipeTitle,
          "Recipe 5",
          "Recipe 4",
          "Recipe 3",
          "Recipe 2",
        ]);

        const dateText = new Date(recipeDate + "Z").toLocaleString(undefined, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
        });
        await expect(
          page
            .getByText("Recipe 2", { exact: true })
            .locator("xpath=ancestor::*[1]")
            .getByText(dateText),
        ).toBeVisible();
      });

      test("should be able to edit a recipe with prep, cook, and total times", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        const editedRecipeTitle = "Edited Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(editedRecipeTitle);

        const recipeDate = "2023-12-08T01:16:12.622";
        await expect(page.getByLabel("Date (UTC)")).toHaveValue(recipeDate);

        await expect(page.getByTitle("Prep Time Minutes")).toHaveValue("");
        await expect(page.getByTitle("Prep Time Hours")).toHaveValue("");
        await expect(page.getByTitle("Cook Time Minutes")).toHaveValue("");
        await expect(page.getByTitle("Cook Time Hours")).toHaveValue("");
        await expect(page.getByTitle("Total Time Minutes")).toHaveValue("");
        await expect(page.getByTitle("Total Time Hours")).toHaveValue("");

        await page.getByTitle("Prep Time Minutes").fill("10");
        await page.getByTitle("Cook Time Minutes").fill("20");
        await page.getByTitle("Cook Time Hours").fill("1");
        await page.getByTitle("Total Time Minutes").fill("30");
        await page.getByTitle("Total Time Hours").fill("3");

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: editedRecipeTitle }),
        ).toBeVisible();

        await expect(
          page
            .getByText("Prep", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("10 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Cook", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("1 hr 20 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Total", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("3 hr 30 min"),
        ).toBeVisible();

        await page.goto("/");
        await expect(page.getByText(editedRecipeTitle)).toBeVisible();
        await checkNamesInOrder(page, [
          "Recipe 7",
          editedRecipeTitle,
          "Recipe 5",
          "Recipe 4",
          "Recipe 3",
          "Recipe 2",
        ]);

        const dateText = new Date(recipeDate + "Z").toLocaleString(undefined, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
        });
        await expect(
          page
            .getByText("Recipe 2", { exact: true })
            .locator("xpath=ancestor::*[1]")
            .getByText(dateText),
        ).toBeVisible();
      });

      test("should be able to toggle an ingredient into a heading", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        await page.evaluate(
          () => new Promise((resolve) => requestIdleCallback(resolve)),
        );

        const ingredientInput = page
          .locator("input,textarea")
          .and(
            page.locator(
              `[value='<Multiplyable baseNumber="1 1/2" /> tsp salt']`,
            ),
          );

        await ingredientInput
          .locator("xpath=ancestor::li[1]")
          .getByText("Ingredient", { exact: true })
          .click();

        await expect(
          ingredientInput
            .locator("xpath=ancestor::li[1]")
            .getByText("Heading", { exact: true }),
        ).toBeAttached();

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: "Recipe 6" }),
        ).toBeVisible();

        await expect(
          page.getByText("1 1/2 tsp salt").locator("xpath=ancestor::h3[1]"),
        ).toBeAttached();
      });

      test("should be able to set a recipe image over another image", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-6/uploads/recipe-6-test-image.png/recipe-6-test-image-w3840q75.webp",
        );

        await page.getByLabel("Image", { exact: true }).setInputFiles({
          name: "recipe-6-test-image-alternate.png",
          mimeType: "image/png",
          buffer: readFileSync(
            fixturePath("images", "recipe-6-test-image-alternate.png"),
          ),
        });

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          /^blob:/,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-6/uploads/recipe-6-test-image-alternate.png/recipe-6-test-image-alternate-w3840q75.webp",
        );

        await page.goto("/");
        await expect(
          page
            .getByText("Recipe 6", { exact: true })
            .locator("xpath=ancestor::li[1]")
            .getByRole("img", { name: "Recipe thumbnail" }),
        ).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-6/uploads/recipe-6-test-image-alternate.png/recipe-6-test-image-alternate-w3840q75.webp",
        );
      });

      test("should be able to set a recipe image on a recipe without an image", async ({
        page,
      }) => {
        await page.goto("/recipe/recipe-5/edit");
        await expect(page.getByText("Editing Recipe: Recipe 5")).toBeVisible();

        await expect(
          page.getByRole("img", {
            name: /Image to upload|Existing Recipe Image|Direct link to image/,
          }),
        ).toHaveCount(0);
        await expect(page.getByLabel("Remove Image")).toHaveCount(0);

        await page.getByLabel("Image", { exact: true }).setInputFiles({
          name: "recipe-6-test-image-alternate.png",
          mimeType: "image/png",
          buffer: readFileSync(
            fixturePath("images", "recipe-6-test-image-alternate.png"),
          ),
        });

        await expect(
          page
            .getByRole("img", {
              name: /Image to upload|Existing Recipe Image|Direct link to image/,
            })
            .first(),
        ).toHaveAttribute("src", /^blob:/, { timeout: 10_000 });

        await expect(page.getByLabel("Remove Image")).toHaveCount(0);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: "Recipe 5" }),
        ).toBeVisible();
        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-5/uploads/recipe-6-test-image-alternate.png/recipe-6-test-image-alternate-w3840q75.webp",
        );

        await page.goto("/");
        await expect(
          page
            .getByText("Recipe 5", { exact: true })
            .locator("xpath=ancestor::li[1]")
            .getByRole("img", { name: "Recipe thumbnail" }),
        ).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-5/uploads/recipe-6-test-image-alternate.png/recipe-6-test-image-alternate-w3840q75.webp",
        );
      });

      test("should be able to remove an image", async ({ page }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        await expect(page.getByRole("img").first()).toBeAttached();

        await page.getByLabel("Remove Image").click();

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(
          page.getByRole("img", {
            name: /Image to upload|Existing Recipe Image|Direct link to image/,
          }),
        ).toHaveCount(0);
        await expect(page.getByLabel("Remove Image")).toHaveCount(0);
      });

      test("should be able to preserve an image when editing", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        await expect(page.getByRole("img").first()).toBeAttached();

        const editedRecipeTitle = "Edited Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(editedRecipeTitle);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { level: 1, name: editedRecipeTitle }),
        ).toBeVisible();
        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-6/uploads/recipe-6-test-image.png/recipe-6-test-image-w3840q75.webp",
        );

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(
          page.getByText("Editing Recipe: Edited Recipe"),
        ).toBeVisible();

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          "/image/uploads/recipe/recipe-6/uploads/recipe-6-test-image.png/recipe-6-test-image-w3840q75.webp",
        );
        await expect(page.getByLabel("Remove Image")).toBeAttached();
      });

      test("should have status 404 when recipe doesn't exist", async ({
        page,
      }) => {
        const response = await page.goto("/recipe/non-existent-recipe/edit");
        expect(response?.status()).toBe(404);
      });

      test("should replace ingredients when pasting multiple times", async ({
        page,
      }) => {
        await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
* 1 cup water
* 2 tsp sugar
* 3 Tbsp oil
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup water`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp sugar`);
        await expect(
          page.locator('[name="ingredients[2].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="3" /> Tbsp oil`);
        await expect(
          page.locator('[name="ingredients[3].ingredient"]'),
        ).toHaveCount(0);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").clear();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
* 4 eggs
* 5 slices of bread
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="4" /> eggs`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="5" /> slices of bread`);
        await expect(
          page.locator('[name="ingredients[2].ingredient"]'),
        ).toHaveCount(0);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").clear();
        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveCount(0);

        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Recipe 6" }),
        ).toBeVisible();
        await expect(page.getByText("1 cup water")).toHaveCount(0);
      });
    });
  });
});
