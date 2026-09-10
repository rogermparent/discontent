import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { snapshotLocator } from "../support/visual";

test.describe("Paste Field Replace Feature", () => {
  test.describe("with the one-recipe fixture", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-recipe");
      await page.goto("/new-recipe");
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
        // Gate on the recipe-form island hydrating so early interactions
        // aren't dropped/reset mid-hydration (dev-mode flake).
        await markdownEditorReady(page, "description");
      });

      test.describe("Ingredients", () => {
        test("should replace text in pasted ingredients (case-insensitive)", async ({
          page,
        }) => {
          await page.getByText("Paste Ingredients", { exact: true }).click();

          const scope = page
            .getByText("Paste Ingredients")
            .locator("xpath=ancestor::details[1]");

          await scope.getByTitle("Ingredients Paste Area").fill(
            `1 Cup flour
2 cups sugar
3 CUP water`,
          );

          await scope.getByTitle("Find text").fill("cup");
          await scope.getByTitle("Replace with").fill("tablespoon");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Ingredients Paste Area")).toHaveValue(
            `1 tablespoon flour
2 tablespoons sugar
3 tablespoon water`,
          );

          await scope.getByText("Import Ingredients", { exact: true }).click();

          await expect(
            page.locator('[name="ingredients[0].ingredient"]'),
          ).toHaveValue(/tablespoon flour/);
          await expect(
            page.locator('[name="ingredients[1].ingredient"]'),
          ).toHaveValue(/tablespoons sugar/);
          await expect(
            page.locator('[name="ingredients[2].ingredient"]'),
          ).toHaveValue(/tablespoon water/);

          await snapshotLocator(
            page.locator('[name="ingredients[0].ingredient"]').locator(".."),
            "paste-replace-imported-ingredients.png",
          );
        });

        test("should replace all occurrences on a single line", async ({
          page,
        }) => {
          await page.getByText("Paste Ingredients", { exact: true }).click();

          const scope = page
            .getByText("Paste Ingredients")
            .locator("xpath=ancestor::details[1]");

          await scope
            .getByTitle("Ingredients Paste Area")
            .fill(`1 cup flour and 1 cup water`);

          await scope.getByTitle("Find text").fill("cup");
          await scope.getByTitle("Replace with").fill("tbsp");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Ingredients Paste Area")).toHaveValue(
            `1 tbsp flour and 1 tbsp water`,
          );
        });

        test("should do nothing when find field is empty", async ({ page }) => {
          await page.getByText("Paste Ingredients", { exact: true }).click();

          const scope = page
            .getByText("Paste Ingredients")
            .locator("xpath=ancestor::details[1]");

          await scope.getByTitle("Ingredients Paste Area").fill(`1 cup flour`);

          await scope.getByTitle("Replace with").fill("tablespoon");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Ingredients Paste Area")).toHaveValue(
            `1 cup flour`,
          );
        });

        test("should replace with empty string (delete matches)", async ({
          page,
        }) => {
          await page.getByText("Paste Ingredients", { exact: true }).click();

          const scope = page
            .getByText("Paste Ingredients")
            .locator("xpath=ancestor::details[1]");

          await scope
            .getByTitle("Ingredients Paste Area")
            .fill(`1 cup (about 120g) flour`);

          await scope.getByTitle("Find text").fill("(about 120g) ");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Ingredients Paste Area")).toHaveValue(
            `1 cup flour`,
          );
        });

        test("should handle special regex characters in find text", async ({
          page,
        }) => {
          await page.getByText("Paste Ingredients", { exact: true }).click();

          const scope = page
            .getByText("Paste Ingredients")
            .locator("xpath=ancestor::details[1]");

          await scope.getByTitle("Ingredients Paste Area").fill(
            `flour (1 cup)
sugar (2 cups)`,
          );

          await scope.getByTitle("Find text").fill("(");
          await scope.getByTitle("Replace with").fill("[");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Ingredients Paste Area")).toHaveValue(
            `flour [1 cup)
sugar [2 cups)`,
          );
        });
      });

      test.describe("Instructions", () => {
        test("should replace text in pasted instructions (case-insensitive)", async ({
          page,
        }) => {
          await page.getByText("Paste Instructions", { exact: true }).click();

          const scope = page
            .getByText("Paste Instructions")
            .locator("xpath=ancestor::details[1]");

          await scope.getByTitle("Instructions Paste Area").fill(
            `1. Mix the flour
2. Add FLOUR to the bowl
3. Stir Flour until smooth`,
          );

          await scope.getByTitle("Find text").fill("flour");
          await scope.getByTitle("Replace with").fill("sugar");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Instructions Paste Area")).toHaveValue(
            `1. Mix the sugar
2. Add sugar to the bowl
3. Stir sugar until smooth`,
          );

          await scope.getByText("Import Instructions", { exact: true }).click();

          await expect(
            page.locator('[name="instructions[0].text"]'),
          ).toHaveValue("Mix the sugar");
          await expect(
            page.locator('[name="instructions[1].text"]'),
          ).toHaveValue("Add sugar to the bowl");
          await expect(
            page.locator('[name="instructions[2].text"]'),
          ).toHaveValue("Stir sugar until smooth");
        });

        test("should replace all occurrences in instructions", async ({
          page,
        }) => {
          await page.getByText("Paste Instructions", { exact: true }).click();

          const scope = page
            .getByText("Paste Instructions")
            .locator("xpath=ancestor::details[1]");

          await scope
            .getByTitle("Instructions Paste Area")
            .fill(`Mix and mix and mix again`);

          await scope.getByTitle("Find text").fill("mix");
          await scope.getByTitle("Replace with").fill("stir");
          await scope
            .getByRole("button", { name: "Replace All", exact: true })
            .click();

          await expect(scope.getByTitle("Instructions Paste Area")).toHaveValue(
            `stir and stir and stir again`,
          );
        });
      });
    });
  });
});
