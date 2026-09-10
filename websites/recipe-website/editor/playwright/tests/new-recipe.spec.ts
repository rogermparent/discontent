import { readFileSync } from "node:fs";
import { test, expect } from "../support/test";
import {
  checkNamesInOrder,
  fillSignInForm,
  fillMarkdownField,
  markdownEditorReady,
} from "../support/helpers";
import { fixturePath } from "../support/tasks";

test.describe("New Recipe View", () => {
  test.describe("with the importable uploads fixture", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("importable-uploads");
      await page.goto("/new-recipe");
    });

    test("should need authentication", async ({ page }) => {
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
        // Gate on the recipe-form island hydrating so early field interactions
        // aren't dropped/reset mid-hydration (dev-mode flake).
        await markdownEditorReady(page, "description");
      });

      test("should import a recipe with prep, cook, and total time", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/naan.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Naan");
        await expect(form.getByTitle("Prep Time Minutes")).toHaveValue("30");
        await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("15");
        await expect(form.getByTitle("Total Time Hours")).toHaveValue("2");
        await expect(form.getByTitle("Total Time Minutes")).toHaveValue("0");

        // Provenance (22a): the JSON-LD's publisher names the citation and its
        // author supplies the byline, filled into the Advanced source block.
        await expect(form.locator('[name="source.url"]')).toHaveValue(
          fullTestURL.href,
        );
        await expect(form.locator('[name="source.name"]')).toHaveValue(
          "King Arthur Baking",
        );
        await expect(form.locator('[name="source.author"]')).toHaveValue(
          "Pooja Makhijani",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(page.getByLabel("Multiply")).toBeVisible();

        // …and survives the write, rendered as the citation under the
        // description rather than as an "Imported from" line inside it (D7).
        const source = page.getByTestId("recipe-source");
        await expect(source).toContainText("King Arthur Baking");
        await expect(source).toContainText("Pooja Makhijani");
        await expect(
          source.getByRole("link", { name: "King Arthur Baking" }),
        ).toHaveAttribute("href", fullTestURL.href);
        await expect(page.getByText("Imported from")).toHaveCount(0);

        await expect(
          page
            .getByText("Prep", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("30 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Cook", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("15 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Total", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("2 hr"),
        ).toBeVisible();
      });

      test("should import a recipe with only prep and cook time, calculating total time", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/naan_prep_cook.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Naan");
        await expect(form.getByTitle("Prep Time Minutes")).toHaveValue("30");
        await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("15");
        await expect(form.getByTitle("Total Time Hours")).toHaveAttribute(
          "placeholder",
          "0",
        );
        await expect(form.getByTitle("Total Time Minutes")).toHaveAttribute(
          "placeholder",
          "45",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(page.getByLabel("Multiply")).toBeVisible();

        await expect(
          page
            .getByText("Prep", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("30 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Cook", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("15 min"),
        ).toBeVisible();
        await expect(
          page
            .getByText("Total", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("45 min"),
        ).toBeVisible();
      });

      test("should import a recipe with no time fields specified", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/naan_no_times.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Naan");
        await expect(form.getByTitle("Prep Time Minutes")).toHaveValue("");
        await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("");
        await expect(form.getByTitle("Total Time Hours")).toHaveValue("");
        await expect(form.getByTitle("Total Time Minutes")).toHaveValue("");

        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(page.getByLabel("Multiply")).toBeVisible();

        await expect(page.getByText("Prep", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Cook", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Total", { exact: true })).toHaveCount(0);
      });

      test("should import a recipe with only total time specified", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/naan_total_only.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Naan");
        await expect(form.getByTitle("Prep Time Minutes")).toHaveValue("");
        await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("");
        await expect(form.getByTitle("Total Time Hours")).toHaveValue("2");
        await expect(form.getByTitle("Total Time Minutes")).toHaveValue("0");

        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(page.getByLabel("Multiply")).toBeVisible();

        // The meta strip drops zero-valued prep/cook (no "0 min" noise) and
        // shows just the total that was specified.
        await expect(page.getByText("Prep", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Cook", { exact: true })).toHaveCount(0);
        await expect(
          page
            .getByText("Total", { exact: true })
            .locator("xpath=ancestor::div[1]")
            .getByText("2 hr"),
        ).toBeVisible();
      });

      test("should resize the image in an imported recipe", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL(
          "/uploads/blackstone-nachos.html",
          baseURL!,
        );
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByLabel("Multiply")).toBeVisible({
          timeout: 10_000,
        });

        const expectedSrc =
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w3840q75.webp";
        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          expectedSrc,
        );
        const expectedSrcset = [
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w640q75.webp 640w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w750q75.webp 750w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w828q75.webp 828w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w1080q75.webp 1080w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w1200q75.webp 1200w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w1920q75.webp 1920w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w2048q75.webp 2048w",
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w3840q75.webp 3840w",
        ].join(", ");
        await expect(page.getByRole("img").first()).toHaveAttribute(
          "srcset",
          expectedSrcset,
        );
      });

      test("should be able to import a recipe with HTML entities and tags", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/matzo-ball-soup.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue(
          "Matzoh Balls & Matzoh Ball Soup",
        );

        // No "Imported from" prefix any more (D7) — the citation is a `source`
        // field now, not a line glued onto the user's description.
        await expect(form.locator('[name="description"]')).toHaveValue(
          `“This is the best way to introduce someone to classic Jewish food,” says chef and cookbook author Joshua Weissman. “It has a special place in my heart.”

Serve this matzoh ball soup as part of a Hanukkah menu or whenever you need a warm and comforting meal.`,
        );
        await expect(form.locator('[name="source.url"]')).toHaveValue(
          fullTestURL.href,
        );

        await expect(
          form.locator('[name="ingredients[11].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="4" /> bone-in & skin-on chicken thighs`,
        );

        await expect(form.locator('[name="instructions[0].name"]')).toHaveValue(
          "",
        );
        await expect(form.locator('[name="instructions[0].text"]')).toHaveValue(
          "To make the homemade matzoh meal, preheat an oven to 475°F (245°C). Line two baking sheets with parchment paper.",
        );

        await expect(form.locator('[name="instructions[4].name"]')).toHaveValue(
          "Make & Cool Matzo Balls",
        );
        await expect(form.locator('[name="instructions[4].text"]')).toHaveValue(
          "To make the matzoh ball soup, in a medium bowl, whisk together the eggs and melted chicken fat. (Make sure the fat isn’t so hot that it cooks the eggs.) Whisk in the kosher salt and baking powder. Whisk in the homemade matzoh meal until completely smooth. Add the water and stir until smooth. Cover the bowl with plastic wrap and refrigerate for 30 minutes.",
        );

        await expect(
          form.locator('[name="instructions[12].name"]'),
        ).toHaveValue("Credits & Attribution Section");

        await expect(
          form.locator('[name="instructions[12].instructions[0].name"]'),
        ).toHaveValue("Book & Author");
        await expect(
          form.locator('[name="instructions[12].instructions[0].text"]'),
        ).toHaveValue(
          "Adapted from *Texture Over Taste* by Joshua Weissman (DK 2023)",
        );

        await expect(
          form.locator('[name="instructions[12].instructions[1].name"]'),
        ).toHaveValue("");
        await expect(
          form.locator('[name="instructions[12].instructions[1].text"]'),
        ).toHaveValue(
          "Find Joshua's YouTube Channel @ [joshuaweissman.com](https://www.joshuaweissman.com/)",
        );
      });

      test("should be able to add a new ingredient", async ({ page }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Ingredient";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Ingredient", exact: true })
          .click();

        await page
          .locator('[name="ingredients[0].ingredient"]')
          .fill("1 cup of water");

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1 cup of water")).toBeVisible();
      });

      test("should be able to add a new ingredient heading", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Ingredient";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Ingredient", exact: true })
          .click();
        await page.getByText("Ingredient", { exact: true }).click();
        await page
          .locator('[name="ingredients[0].ingredient"]')
          .fill("My Ingredient Heading");

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();
        await expect(page.getByText("My Ingredient Heading")).toBeVisible();
      });

      test("should not create a recipe with an empty ingredient", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Ingredient";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Ingredient", exact: true })
          .click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toBeAttached();

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Error parsing recipe")).toBeVisible();
        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toHaveCount(0);
      });

      test("should be able to add a new instruction", async ({ page }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Instruction";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Instruction", exact: true })
          .click();

        await page
          .locator('[name="instructions[0].name"]')
          .fill("Instruction 1");
        await fillMarkdownField(
          page,
          "instructions[0].text",
          "This is the first instruction",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();
        await expect(page.getByText("Instruction 1")).toBeVisible();
        await expect(
          page.getByText("This is the first instruction"),
        ).toBeVisible();
      });

      test("should be able to add a new instruction group", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Instruction";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Instruction", exact: true })
          .click();

        await page
          .getByRole("button", { name: "Convert to instruction group" })
          .click();
        await page
          .locator('[name="instructions[0].name"]')
          .fill("Instruction Group 1");

        await expect(
          page.getByRole("button", { name: "Add Instruction", exact: true }),
        ).toHaveCount(2);
        await page
          .getByRole("button", { name: "Add Instruction", exact: true })
          .first()
          .click();

        await page
          .locator('[name="instructions[0].instructions[0].name"]')
          .fill("Child Instruction 1");
        await fillMarkdownField(
          page,
          "instructions[0].instructions[0].text",
          "This is the first instruction",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        const groupItem = page
          .getByRole("heading", { name: "Instruction Group 1" })
          .locator("xpath=ancestor::li[1]");
        await expect(groupItem.getByText("Child Instruction 1")).toBeVisible();
        await expect(
          groupItem.getByText("This is the first instruction"),
        ).toBeVisible();
      });

      test("should not create a recipe with an empty instruction", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Instruction";

        await page.getByLabel("Name").first().clear();
        await expect(page.getByLabel("Name").first()).toBeEnabled();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Instruction", exact: true })
          .click();

        await expect(
          page.locator('[name="instructions[0].name"]'),
        ).toBeAttached();
        await expect(
          page.locator('[name="instructions[0].text"]'),
        ).toBeAttached();

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Error parsing recipe")).toBeVisible();
        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toHaveCount(0);
      });

      test("should not create an instruction group without a name", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Instruction";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page
          .getByRole("button", { name: "Add Instruction", exact: true })
          .click();

        await page
          .getByRole("button", { name: "Convert to instruction group" })
          .click();

        await expect(
          page.getByRole("button", { name: "Add Instruction", exact: true }),
        ).toHaveCount(2);
        await page
          .getByRole("button", { name: "Add Instruction", exact: true })
          .first()
          .click();

        await page
          .locator('[name="instructions[0].instructions[0].name"]')
          .fill("Child Instruction 1");
        await fillMarkdownField(
          page,
          "instructions[0].instructions[0].text",
          "This is the first instruction",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Error parsing recipe")).toBeVisible();
        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toHaveCount(0);
      });

      test("should be able to add a new recipe with a video", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe with Video";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

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
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();
        await expect(page.locator("video")).toBeAttached();
      });

      test("should be able to create a new recipe with prep and cook times", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

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
          page.getByRole("heading", { name: newRecipeTitle }),
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
        await expect(
          page.getByTestId("recipe-list").getByText(newRecipeTitle),
        ).toBeVisible();
        await checkNamesInOrder(page, [newRecipeTitle]);
      });

      test("should be able to create a new recipe with prep, cook, and total times", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByTitle("Prep Time Minutes").fill("10");
        await page.getByTitle("Cook Time Minutes").fill("20");
        await page.getByTitle("Cook Time Hours").fill("1");
        await page.getByTitle("Total Time Minutes").fill("30");
        await page.getByTitle("Total Time Hours").fill("3");

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
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
        await expect(
          page.getByTestId("recipe-list").getByText(newRecipeTitle),
        ).toBeVisible();
        await checkNamesInOrder(page, [newRecipeTitle]);
      });

      test("should be able to create a new recipe", async ({ page }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await page.goto("/");
        await expect(
          page.getByTestId("recipe-list").getByText(newRecipeTitle),
        ).toBeVisible();
        await checkNamesInOrder(page, [newRecipeTitle]);
      });

      test("should trim pasted instructions", async ({ page }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Instructions", { exact: true }).click();
        await page.getByTitle("Instructions Paste Area").fill(
          `
1. Do the first step
    2. Do the second step with whitespace
Have no number on three


        4. Have whitespace at the beginning and end
`,
        );

        await page.getByText("Import Instructions", { exact: true }).click();

        await expect(page.locator('[name="instructions[0].text"]')).toHaveValue(
          `Do the first step`,
        );
        await expect(page.locator('[name="instructions[1].text"]')).toHaveValue(
          `Do the second step with whitespace`,
        );
        await expect(page.locator('[name="instructions[2].text"]')).toHaveValue(
          `Have no number on three`,
        );
        await expect(page.locator('[name="instructions[3].text"]')).toHaveValue(
          `Have whitespace at the beginning and end`,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText(`Do the first step`)).toBeVisible();
        await expect(
          page.getByText(`Do the second step with whitespace`),
        ).toBeVisible();
        await expect(page.getByText(`Have no number on three`)).toBeVisible();
        await expect(
          page.getByText(`Have whitespace at the beginning and end`),
        ).toBeVisible();
      });

      test("should group pasted instructions under detected headings", async ({
        page,
      }) => {
        const newRecipeTitle = "My Grouped Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Instructions", { exact: true }).click();
        await page.getByTitle("Instructions Paste Area").fill(
          `For the dough:
1. Mix
2. Knead
Bake:
Cool`,
        );
        await page.getByText("Import Instructions", { exact: true }).click();

        await expect(page.locator('[name="instructions[0].name"]')).toHaveValue(
          "For the dough",
        );
        await expect(
          page.locator('[name="instructions[0].instructions[0].text"]'),
        ).toHaveValue("Mix");
        await expect(
          page.locator('[name="instructions[0].instructions[1].text"]'),
        ).toHaveValue("Knead");
        await expect(page.locator('[name="instructions[1].name"]')).toHaveValue(
          "Bake",
        );
        await expect(
          page.locator('[name="instructions[1].instructions[0].text"]'),
        ).toHaveValue("Cool");

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "For the dough" }),
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: "Bake" })).toBeVisible();
        await expect(page.getByText("Mix", { exact: true })).toBeVisible();
        await expect(page.getByText("Knead", { exact: true })).toBeVisible();
        await expect(page.getByText("Cool", { exact: true })).toBeVisible();
      });

      test("should recognize ALL-CAPS and 'For the' headings on paste", async ({
        page,
      }) => {
        const newRecipeTitle = "My Caps Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Instructions", { exact: true }).click();
        await page.getByTitle("Instructions Paste Area").fill(
          `DOUGH
1. Mix
For your topping
Sprinkle`,
        );
        await page.getByText("Import Instructions", { exact: true }).click();

        await expect(page.locator('[name="instructions[0].name"]')).toHaveValue(
          "DOUGH",
        );
        await expect(
          page.locator('[name="instructions[0].instructions[0].text"]'),
        ).toHaveValue("Mix");
        await expect(page.locator('[name="instructions[1].name"]')).toHaveValue(
          "For your topping",
        );
        await expect(
          page.locator('[name="instructions[1].instructions[0].text"]'),
        ).toHaveValue("Sprinkle");
      });

      test("should keep pasted instructions flat when there are no headings", async ({
        page,
      }) => {
        const newRecipeTitle = "My Flat Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Instructions", { exact: true }).click();
        await page.getByTitle("Instructions Paste Area").fill(
          `1. Mix well
2. Bake
3. Cool`,
        );
        await page.getByText("Import Instructions", { exact: true }).click();

        // No group is created: top-level entries carry text, not nested arrays.
        await expect(page.locator('[name="instructions[0].text"]')).toHaveValue(
          "Mix well",
        );
        await expect(page.locator('[name="instructions[1].text"]')).toHaveValue(
          "Bake",
        );
        await expect(page.locator('[name="instructions[2].text"]')).toHaveValue(
          "Cool",
        );
        await expect(
          page.locator('[name="instructions[0].instructions[0].text"]'),
        ).toHaveCount(0);
      });

      test("should display pasted multiplyable numbers as their original format before multiplying", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
- 20/10 cup flour
- 1 cup water
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="20/10" /> cup flour`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup water`);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("20/10 cup flour")).toBeVisible();
        await expect(page.getByText("1 cup water")).toBeVisible();
      });

      test("should be able to paste ingredients with different indentation levels", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
- 1 cup flour
  - 1 cup water
  - 2 tsp sugar
   - 2 tsp baking powder
 - 1 tsp salt
    - 1 tsp pepper
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup flour`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup water`);
        await expect(
          page.locator('[name="ingredients[2].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp sugar`);
        await expect(
          page.locator('[name="ingredients[3].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp baking powder`);
        await expect(
          page.locator('[name="ingredients[4].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> tsp salt`);
        await expect(
          page.locator('[name="ingredients[5].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> tsp pepper`);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1 cup flour")).toBeVisible();
        await expect(page.getByText("1 cup water")).toBeVisible();
        await expect(page.getByText("2 tsp sugar")).toBeVisible();
        await expect(page.getByText("2 tsp baking powder")).toBeVisible();
        await expect(page.getByText("1 tsp salt")).toBeVisible();
        await expect(page.getByText("1 tsp pepper")).toBeVisible();
      });

      test("should be able to paste ingredients with trailing whitespace", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
- 1 cup flour
- 1 cup water
- 2 tsp sugar
   - 2 tsp baking powder
- 1 tsp salt
    - 1 tsp pepper
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup flour`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup water`);
        await expect(
          page.locator('[name="ingredients[2].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp sugar`);
        await expect(
          page.locator('[name="ingredients[3].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp baking powder`);
        await expect(
          page.locator('[name="ingredients[4].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> tsp salt`);
        await expect(
          page.locator('[name="ingredients[5].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> tsp pepper`);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1 cup flour")).toBeVisible();
        await expect(page.getByText("1 cup water")).toBeVisible();
        await expect(page.getByText("2 tsp sugar")).toBeVisible();
        await expect(page.getByText("2 tsp baking powder")).toBeVisible();
        await expect(page.getByText("1 tsp salt")).toBeVisible();
        await expect(page.getByText("1 tsp pepper")).toBeVisible();
      });

      test("should be able to paste ingredients with multiple multiplyable amounts", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
- 1/2 large onion (100g)
- 400g or 1 1/2 cups chicken broth
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="1/2" /> large onion (<Multiplyable baseNumber="100" />g)`,
        );
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="400" />g or <Multiplyable baseNumber="1 1/2" /> cups chicken broth`,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1/2 large onion (100g)")).toBeVisible();
        await expect(
          page.getByText("400g or 1 1/2 cups chicken broth"),
        ).toBeVisible();
      });

      test("should be able to paste ingredients with normal fractions", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
- 1/2 onion
- 1 1/2 cups chicken broth
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1/2" /> onion`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1 1/2" /> cups chicken broth`);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1/2 onion")).toBeVisible();
        await expect(page.getByText("1 1/2 cups chicken broth")).toBeVisible();
      });

      test("should be able to paste ingredients with different bullet styles", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
* 1 cup flour
- 1 cup water
• 2 tsp sugar
▪ 2 tsp baking powder
-- 1 tsp salt
- - 1 tsp pepper
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup flour`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup water`);
        await expect(
          page.locator('[name="ingredients[2].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp sugar`);
        await expect(
          page.locator('[name="ingredients[3].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="2" /> tsp baking powder`);
        await expect(
          page.locator('[name="ingredients[4].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> tsp salt`);
        await expect(
          page.locator('[name="ingredients[5].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> tsp pepper`);

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1 cup flour")).toBeVisible();
        await expect(page.getByText("1 cup water")).toBeVisible();
        await expect(page.getByText("2 tsp sugar")).toBeVisible();
        await expect(page.getByText("2 tsp baking powder")).toBeVisible();
        await expect(page.getByText("1 tsp salt")).toBeVisible();
        await expect(page.getByText("1 tsp pepper")).toBeVisible();
      });

      test("should be able to paste ingredients with percentages without automatically multiplying", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "My New Recipe";
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

        await page.getByText("Paste Ingredients", { exact: true }).click();
        await page.getByTitle("Ingredients Paste Area").fill(
          `
 * 1 cup 2% milk
 * 200g 100 % whole wheat flour
 * 400g bread flour (11.7% - 13.5 % protein)
`,
        );

        await page.getByText("Import Ingredients", { exact: true }).click();

        await expect(
          page.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(`<Multiplyable baseNumber="1" /> cup 2% milk`);
        await expect(
          page.locator('[name="ingredients[1].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="200" />g 100 % whole wheat flour`,
        );
        await expect(
          page.locator('[name="ingredients[2].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="400" />g bread flour (11.7% - 13.5 % protein)`,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(
          page.getByRole("heading", { name: newRecipeTitle }),
        ).toBeVisible();

        await expect(page.getByText("1 cup 2% milk")).toBeVisible();
        await expect(
          page.getByText("200g 100 % whole wheat flour"),
        ).toBeVisible();
        await expect(
          page.getByText("400g bread flour (11.7% - 13.5 % protein)"),
        ).toBeVisible();
      });

      test("should be able to import a recipe", async ({ page, baseURL }) => {
        const fullTestURL = new URL("/uploads/katsudon.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();
        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Katsudon");
        await expect(form.locator('[name="description"]')).toHaveValue(
          `Katsudon is a Japanese pork cutlet rice bowl made with tonkatsu, eggs, and sautéed onions simmered in a sweet and savory sauce. It‘s a one-bowl wonder and true comfort food!`,
        );
        await expect(
          form.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="1" /> cup water ((for the dashi packet))`,
        );
        await expect(
          form.locator('[name="ingredients[5].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="1/2" /> onion ((<Multiplyable baseNumber="4" /> oz, <Multiplyable baseNumber="113" /> g))`,
        );

        await expect(form.locator('[name="instructions[0].name"]')).toHaveValue(
          "",
        );
        await expect(form.locator('[name="instructions[0].text"]')).toHaveValue(
          "Before You Start: Gather all the ingredients. For the steamed rice, please note that 1½ cups (300 g, 2 rice cooker cups) of uncooked Japanese short-grain rice yield 4⅓ cups (660 g) of cooked rice, enough for 2 donburi servings (3⅓ cups, 500 g). See how to cook short-grain rice with a rice cooker, pot over the stove, Instant Pot, or donabe.",
        );

        await expect(form.locator('[name="instructions[1].name"]')).toHaveValue(
          "To Make the Dashi",
        );
        await expect(form.locator('[name="instructions[1].text"]')).toHaveCount(
          0,
        );
      });

      test("should trim hash from imported URL", async ({ page, baseURL }) => {
        const fullTestURL = new URL(
          "/uploads/katsudon.html#section1",
          baseURL!,
        );

        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();

        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Katsudon");
        await expect(form.locator('[name="description"]')).toHaveValue(
          `Katsudon is a Japanese pork cutlet rice bowl made with tonkatsu, eggs, and sautéed onions simmered in a sweet and savory sauce. It‘s a one-bowl wonder and true comfort food!`,
        );
        await expect(
          form.locator('[name="ingredients[0].ingredient"]'),
        ).toHaveValue(
          `<Multiplyable baseNumber="1" /> cup water ((for the dashi packet))`,
        );
        // The citation is the fetched URL, so it loses the hash too.
        await expect(form.locator('[name="source.url"]')).toHaveValue(
          `${baseURL}/uploads/katsudon.html`,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByLabel("Multiply")).toBeVisible({
          timeout: 10_000,
        });

        await expect(
          page.getByRole("heading", { name: "Katsudon", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("1 cup water ((for the dashi packet))"),
        ).toBeVisible();
      });

      test("should be able to import a recipe with an image with GET params", async ({
        page,
        baseURL,
        request,
      }) => {
        const fullTestURL = new URL(
          "/uploads/blackstone-nachos-with-params.html",
          baseURL!,
        );
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();
        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue(
          "Blackstone Griddle Grilled Nachos",
        );

        await expect(form.getByRole("img").first()).toHaveAttribute(
          "src",
          new URL(
            "/uploads/recipe-imported-image-566x566.png?param=value",
            baseURL!,
          ).href,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByLabel("Multiply")).toBeVisible({
          timeout: 10_000,
        });

        const processedImagePath =
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w3840q75.webp";

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          processedImagePath,
        );

        const response = await request.get(processedImagePath);
        expect(response.status()).toBe(200);

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(
          page.getByText("Editing Recipe: Blackstone Griddle Grilled Nachos"),
        ).toBeVisible({ timeout: 10_000 });

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          processedImagePath,
        );
      });

      test("should be able to import a recipe with an image", async ({
        page,
        baseURL,
        request,
      }) => {
        const fullTestURL = new URL(
          "/uploads/blackstone-nachos.html",
          baseURL!,
        );
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();
        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue(
          "Blackstone Griddle Grilled Nachos",
        );

        await expect(form.getByRole("img").first()).toHaveAttribute(
          "src",
          new URL("/uploads/recipe-imported-image-566x566.png", baseURL!).href,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByLabel("Multiply")).toBeVisible({
          timeout: 10_000,
        });

        const processedImagePath =
          "/image/uploads/recipe/blackstone-griddle-grilled-nachos/uploads/recipe-imported-image-566x566.png/recipe-imported-image-566x566-w3840q75.webp";

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          processedImagePath,
        );

        const response = await request.get(processedImagePath);
        expect(response.status()).toBe(200);

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(
          page.getByText("Editing Recipe: Blackstone Griddle Grilled Nachos"),
        ).toBeVisible();

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          processedImagePath,
        );
      });

      test("should be able to import a recipe with a singular image", async ({
        page,
        baseURL,
        request,
      }) => {
        const fullTestURL = new URL("/uploads/pork-carnitas.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();
        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue(
          "Pork Carnitas",
        );

        await expect(form.getByRole("img").first()).toHaveAttribute(
          "src",
          new URL("/uploads/pork-carnitas.webp", baseURL!).href,
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByLabel("Multiply")).toBeVisible();

        const processedImagePath =
          "/image/uploads/recipe/pork-carnitas/uploads/pork-carnitas.webp/pork-carnitas-w3840q75.webp";

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          processedImagePath,
        );

        const response = await request.get(processedImagePath);
        expect(response.status()).toBe(200);

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(
          page.getByText("Editing Recipe: Pork Carnitas"),
        ).toBeVisible();

        await expect(page.getByRole("img").first()).toHaveAttribute(
          "src",
          processedImagePath,
        );
      });

      test("should be able to import a recipe with the slug placeholder pre-filled", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/pork-carnitas.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();
        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        await expect(page.locator('[name="name"]')).toHaveValue(
          "Pork Carnitas",
        );
        await expect(page.getByLabel("Slug")).toHaveAttribute(
          "placeholder",
          "pork-carnitas",
        );

        await page.locator('[name="name"]').fill("Pork Carnitas 2");
        await expect(page.getByLabel("Slug")).toHaveAttribute(
          "placeholder",
          "pork-carnitas-2",
        );

        await page.locator('[name="name"]').clear();
        await expect(page.getByLabel("Slug")).toHaveAttribute(
          "placeholder",
          "",
        );

        await page.locator('[name="name"]').fill("Pulled");
        await expect(page.getByLabel("Slug")).toHaveAttribute(
          "placeholder",
          "pulled",
        );

        await page.locator('[name="name"]').fill("Pulled Pork");
        await expect(page.getByLabel("Slug")).toHaveAttribute(
          "placeholder",
          "pulled-pork",
        );

        await page.locator('[name="name"]').clear();
        await expect(page.getByLabel("Slug")).toHaveAttribute(
          "placeholder",
          "",
        );
      });

      test("should be able to import a recipe with string list instructions", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/naan.html", baseURL!);
        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import", exact: true }).click();
        await expect(page.getByLabel("Name").first()).not.toHaveValue("");

        const form = page.locator("#recipe-form");
        await expect(form.locator('[name="name"]')).toHaveValue("Naan");
        await expect(form.locator('[name="description"]')).toHaveValue(
          `South Asia's classic yeasted flatbread, naan, is traditionally baked in a super-hot tandoor oven, which gives it gentle puffiness and a hint of smoke. In the absence of a tandoor, we find home bakers can replicate those qualities pretty closely with a cast iron pan or electric griddle. Our thanks to author Pooja Makhijani for sharing this recipe with us.`,
        );

        await expect(form.locator('[name="instructions[0].name"]')).toHaveValue(
          "",
        );
        await expect(form.locator('[name="instructions[0].text"]')).toHaveValue(
          "Weigh your flour; or measure it by gently spooning it into a cup, then sweeping off any excess. In a large bowl or the bowl of a stand mixer, combine all the dough ingredients and mix until shaggy. Knead the dough until it’s smooth, bouncy, and slightly tacky.",
        );
        await expect(form.locator('[name="instructions[1].name"]')).toHaveValue(
          "",
        );
        await expect(form.locator('[name="instructions[1].text"]')).toHaveValue(
          "Place the dough in a greased bowl, cover, and let it rise until doubled, about 50 to 60 minutes.",
        );
        await expect(form.locator('[name="instructions[2].name"]')).toHaveValue(
          "",
        );
        await expect(form.locator('[name="instructions[2].text"]')).toHaveValue(
          "Divide the dough into eight equal pieces (about 65g each). Shape each into a ball, cover, and let rest for 20 minutes.",
        );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByLabel("Multiply")).toBeVisible();
      });

      test("should replace ingredients when pasting multiple times", async ({
        page,
      }) => {
        await expect(
          page.getByRole("heading", { name: "New Recipe" }),
        ).toBeVisible();

        const newRecipeTitle = "Multiple Ingredient Imports Recipe";

        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill(newRecipeTitle);

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
      });
    });
  });
});
