import { test, expect } from "../support/test";
import {
  checkNamesInOrder,
  fillSignInForm,
  markdownEditorReady,
  deleteWithConfirm,
} from "../support/helpers";
import { snapshotPage } from "../support/visual";

test.describe("Single Recipe View", () => {
  test.describe("with seven items", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("two-pages");
      await page.goto("/recipe/recipe-6");
    });

    test("should display a recipe", async ({ page }) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 6" }),
      ).toBeVisible();
      await expect(page).toHaveTitle(/Recipe 6/);
    });

    test("should not need authorization", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: "Sign In", exact: true }),
      ).toBeVisible();
    });

    test("should be able to multiply ingredient amounts", async ({ page }) => {
      await expect(page.getByText("1 1/2 tsp salt")).toBeVisible();
      await expect(
        page.getByText("Sprinkle 1/2 tsp salt in water"),
      ).toBeVisible();

      // The ½× · 1× · 2× presets scale in place, and each writes its value into
      // the custom "Multiply" field (one source of truth).
      await page.getByRole("button", { name: "Double batch" }).click();
      await expect(page.getByText("3 tsp salt")).toBeVisible();
      await expect(
        page.getByText("Sprinkle 1 tsp salt in water"),
      ).toBeVisible();
      await expect(page.getByLabel("Multiply")).toHaveValue("2");

      await page.getByRole("button", { name: "Half batch" }).click();
      await expect(page.getByText("3/4 tsp salt")).toBeVisible();
      await expect(page.getByLabel("Multiply")).toHaveValue("1/2");

      // Typing a custom multiplier still works (and drives the snapshot at 2×).
      await page.getByLabel("Multiply").fill("2");
      await expect(page.getByText("3 tsp salt")).toBeVisible();
      await snapshotPage(page, "recipe-6-multiplied.png");
    });

    test("hosts the scaler in a sticky Ingredients header", async ({
      page,
    }) => {
      // The scaler moved from the old full-width sticky bar into the Ingredients
      // section header (where recipe sites put servings/scale).
      const section = page.locator("section", {
        has: page.getByRole("heading", { level: 2, name: "Ingredients" }),
      });
      await expect(section.getByLabel("Multiply")).toBeVisible();
      await expect(
        section.getByRole("button", { name: "Double batch" }),
      ).toBeVisible();

      // Its header container is `position: sticky`, so it stays reachable while
      // scrolling the column — the reachability the old bar aimed for, contained
      // to the column instead of spanning the page.
      const stickyPosition = await section
        .getByLabel("Multiply")
        .evaluate((el) => {
          let node: HTMLElement | null = el as HTMLElement;
          while (node && getComputedStyle(node).position !== "sticky") {
            node = node.parentElement;
          }
          return node && getComputedStyle(node).position;
        });
      expect(stickyPosition).toBe("sticky");
    });

    test("prints a clean recipe: ingredients shown, screen controls hidden", async ({
      page,
    }) => {
      await page.emulateMedia({ media: "print" });

      // The ingredient list is part of the printout.
      await expect(page.getByText("1 1/2 tsp salt")).toBeVisible();

      // The sticky scale bar and the checklist Reset buttons are screen-only.
      await expect(page.getByLabel("Multiply")).toBeHidden();
      await expect(page.getByRole("button", { name: "Reset" })).toHaveCount(0);

      await page.emulateMedia({ media: "screen" });
    });

    test("should be able to edit a recipe", async ({ page }) => {
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await fillSignInForm(page);

      await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible({
        timeout: 10_000,
      });
      await markdownEditorReady(page, "description");

      const editedRecipe = "Edited Recipe";

      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(editedRecipe);

      const recipeDate = "2023-12-08T01:16:12.622";
      await expect(page.getByLabel("Date (UTC)")).toHaveValue(recipeDate);

      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(
        page.getByRole("heading", { level: 1, name: editedRecipe }),
      ).toBeVisible();

      await page.goto("/");
      await expect(page.getByText(editedRecipe)).toBeVisible();
      await checkNamesInOrder(page, [
        "Recipe 7",
        editedRecipe,
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
          .getByText(editedRecipe)
          .locator("xpath=ancestor::*[1]")
          .getByText(dateText),
      ).toBeVisible();
    });

    test("should be able to delete the recipe", async ({ page, request }) => {
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await fillSignInForm(page);

      await deleteWithConfirm(page, "recipe");

      await expect(page.getByText("Recipe 4")).toBeVisible();
      await checkNamesInOrder(page, [
        "Recipe 7",
        "Recipe 5",
        "Recipe 4",
        "Recipe 3",
        "Recipe 2",
        "Recipe 1",
      ]);
      const response = await request.get("/recipe/recipe-6");
      expect(response.status()).toBe(404);
    });
  });

  test("should have status 404 when recipe doesn't exist", async ({
    request,
  }) => {
    const response = await request.get("/recipe/non-existent-recipe");
    expect(response.status()).toBe(404);
  });

  test.describe("provenance", () => {
    // 22a. A source typed by hand into the Advanced block is the manual twin of
    // what an import fills in, and the round trip through *edit* is the part
    // that can quietly regress: the edit form has to be prefilled from the
    // stored `source`, or saving an untouched form would drop the citation.
    test("keeps a hand-entered source through an edit that never touches it", async ({
      page,
      resetData,
    }) => {
      await resetData("one-recipe");
      await page.goto("/new-recipe");
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      const form = page.locator("#recipe-form");
      await page.getByLabel("Name").first().fill("Cited Recipe");
      await form
        .locator('[name="source.url"]')
        .fill("https://example.com/naan");
      await form.locator('[name="source.name"]').fill("Example Kitchen");
      await form.locator('[name="source.author"]').fill("A. Cook");

      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Cited Recipe" }),
      ).toBeVisible();

      const source = page.getByTestId("recipe-source");
      await expect(source).toContainText("Example Kitchen");
      await expect(source).toContainText("A. Cook");
      const link = source.getByRole("link", { name: "Example Kitchen" });
      await expect(link).toHaveAttribute("href", "https://example.com/naan");
      await expect(link).toHaveAttribute("rel", "nofollow noopener");

      // Edit and save without going near the source block.
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByText("Editing Recipe: Cited Recipe")).toBeVisible({
        timeout: 10_000,
      });
      await markdownEditorReady(page, "description");
      await expect(
        page.locator('#recipe-form [name="source.url"]'),
      ).toHaveValue("https://example.com/naan");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(
        page.getByRole("heading", { level: 1, name: "Cited Recipe" }),
      ).toBeVisible();
      await expect(page.getByTestId("recipe-source")).toContainText(
        "Example Kitchen",
      );
      await expect(page.getByTestId("recipe-source")).toContainText("A. Cook");
    });

    test("renders no citation for a recipe without a source", async ({
      page,
      resetData,
    }) => {
      await resetData("two-pages");
      await page.goto("/recipe/recipe-6");
      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 6" }),
      ).toBeVisible();
      await expect(page.getByTestId("recipe-source")).toHaveCount(0);
    });
  });

  test.describe("hero meta bar", () => {
    test("renders Prep · Cook · Total in the hero", async ({
      page,
      resetData,
    }) => {
      // baked-potatoes carries prep 10 / cook 60, so the canonical meta strip
      // (which replaced the loose InfoCards and fills the hero's right column)
      // has real data to show.
      await resetData("linked-recipes");
      await page.goto("/recipe/baked-potatoes");
      await expect(
        page.getByRole("heading", { level: 1, name: /baked potatoes/i }),
      ).toBeVisible();

      const meta = page.getByRole("term");
      await expect(meta.filter({ hasText: "Prep" })).toBeVisible();
      await expect(page.getByText("10 min", { exact: true })).toBeVisible();
      await expect(meta.filter({ hasText: "Cook" })).toBeVisible();
      await expect(page.getByText("1 hr", { exact: true })).toBeVisible();
      await expect(meta.filter({ hasText: "Total" })).toBeVisible();
      await expect(
        page.getByText("1 hr 10 min", { exact: true }),
      ).toBeVisible();
    });
  });
});
