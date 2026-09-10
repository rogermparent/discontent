import { test, expect } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  openMarkdownSource,
} from "../support/helpers";
import { snapshotLocator } from "../support/visual";

test.describe("Yield Feature", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
  });

  test.describe("when authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await fillSignInForm(page);
      // Wait for the recipe-form island to hydrate before the tests fill
      // fields — a controlled input filled mid-hydration gets reset to empty.
      await markdownEditorReady(page, "description");
    });

    test("should be able to set a yield with multiplyable number", async ({
      page,
    }) => {
      const newRecipeTitle = "Recipe with Yield";
      const yieldValue = '<Multiplyable baseNumber="12" /> cookies';

      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(newRecipeTitle);

      // The scaler now lives in the Ingredients header, so the recipe needs at
      // least one ingredient for the Multiply control to render.
      await page.getByText("Paste Ingredients", { exact: true }).click();
      await page.getByTitle("Ingredients Paste Area").fill("2 cups flour");
      await page.getByText("Import Ingredients", { exact: true }).click();

      // The yield field is a Lexical editor; enter raw markdown via Source mode.
      const yieldSource = await openMarkdownSource(page, "recipeYield");
      await yieldSource.fill(yieldValue);

      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(
        page.getByRole("heading", { name: newRecipeTitle }),
      ).toBeVisible();

      await expect(
        page
          .getByText("Yield", { exact: true })
          .locator("xpath=ancestor::div[1]")
          .getByText("12 cookies"),
      ).toBeVisible();

      await page.getByLabel("Multiply").clear();
      await page.getByLabel("Multiply").fill("2");
      await expect(
        page
          .getByText("Yield", { exact: true })
          .locator("xpath=ancestor::div[1]")
          .getByText("24 cookies"),
      ).toBeVisible();

      await page.getByLabel("Multiply").clear();
      await page.getByLabel("Multiply").fill("0.5");
      await expect(
        page
          .getByText("Yield", { exact: true })
          .locator("xpath=ancestor::div[1]")
          .getByText("6 cookies"),
      ).toBeVisible();
      await snapshotLocator(
        page
          .getByText("Yield", { exact: true })
          .locator("xpath=ancestor::div[1]"),
        "yield-multiplied-half.png",
      );
    });

    test("should allow using the Multiplyable button in Yield input", async ({
      page,
    }) => {
      const newRecipeTitle = "Recipe with Yield Button";

      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(newRecipeTitle);

      const yieldField = page
        .getByLabel("Yield")
        .locator("xpath=ancestor::*[contains(@class,'border')][1]");

      // Wait for the editor to hydrate, then type "12", select it, and turn it
      // into a Multiplyable via the toolbar. (Typing before hydration drops the
      // keys and yields an empty baseNumber.)
      const yieldEditor = await markdownEditorReady(page, "recipeYield");
      await yieldEditor.click();
      await page.keyboard.type("12");
      await page.keyboard.press("ControlOrMeta+a");
      await yieldField.getByRole("button", { name: "Scaling number" }).click();

      // Verify the serialized markdown via Source mode.
      const yieldSource = await openMarkdownSource(page, "recipeYield");
      await expect(yieldSource).toHaveValue('<Multiplyable baseNumber="12" />');
    });
  });
});
