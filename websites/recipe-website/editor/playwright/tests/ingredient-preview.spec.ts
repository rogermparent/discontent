import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { snapshotLocator } from "../support/visual";

/*
 * Ingredient rows (43e2, edit form B): each line is a row — its amount in a
 * mono column, the rest as plain text with the asides muted — and a click
 * opens it for typing, as plain text. Typed amounts are marked up for the
 * scaler on the way in (`createIngredient`); an untouched row posts its
 * stored markup back unchanged. Replaces the old input-and-preview pair.
 */

function rows(page: Page): Locator {
  return page.getByTestId("ingredient-row");
}

function stored(page: Page, index: number): Locator {
  return page.locator(
    `input[type="hidden"][name="ingredients[${index}].ingredient"]`,
  );
}

/** Open row `n` (1-based) for typing and replace its text. */
async function typeIntoRow(page: Page, n: number, text: string) {
  await rows(page)
    .nth(n - 1)
    .getByRole("button", { name: new RegExp(`^Ingredient ${n}: `) })
    .click();
  const field = page.getByLabel(`Ingredient ${n}`, { exact: true });
  await expect(field).toBeFocused();
  await field.fill(text);
  await field.press("Enter");
}

test.describe("Ingredient rows", () => {
  test.describe("with two-pages fixture", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("two-pages");
      await page.goto("/recipe/recipe-6/edit");
      await fillSignInForm(page);
      // Gate on the recipe-form island hydrating so early field interactions
      // aren't dropped/reset mid-hydration (dev-mode flake).
      await markdownEditorReady(page, "description");
    });

    test("shows each line as a row: the amount in its column, the rest as text", async ({
      page,
    }) => {
      await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();
      await expect(rows(page)).toHaveCount(2);
      const first = rows(page).first();
      await expect(first).toContainText("1 1/2 tsp");
      await expect(first).toContainText("salt");
      /* No markup on the page; the stored line keeps it. */
      await expect(first).not.toContainText("Multiplyable");
      await expect(stored(page, 0)).toHaveValue(
        '<Multiplyable baseNumber="1 1/2" /> tsp salt',
      );
    });

    test("a row opens as plain text, and what is typed is marked up to scale", async ({
      page,
    }) => {
      await rows(page)
        .first()
        .getByRole("button", { name: /^Ingredient 1: / })
        .click();
      await expect(
        page.getByLabel("Ingredient 1", { exact: true }),
      ).toHaveValue("1 1/2 tsp salt");
      await page
        .getByLabel("Ingredient 1", { exact: true })
        .fill("2 cups sugar");
      await page.getByLabel("Ingredient 1", { exact: true }).press("Enter");

      await expect(stored(page, 0)).toHaveValue(
        '<Multiplyable baseNumber="2" /> cups sugar',
      );
      await expect(rows(page).first()).toContainText("2 cups");
      await expect(rows(page).first()).toContainText("sugar");
      await snapshotLocator(
        rows(page).first(),
        "ingredient-row-2-cups-sugar.png",
      );
    });

    test("renders the line's markdown in the row", async ({ page }) => {
      await typeIntoRow(page, 1, "1 cup **strong** coffee");
      await expect(rows(page).first().locator("strong")).toHaveText("strong");
      await expect(stored(page, 0)).toHaveValue(
        '<Multiplyable baseNumber="1" /> cup **strong** coffee',
      );
    });

    test("an emptied row says so, and the save reports it", async ({
      page,
    }) => {
      await typeIntoRow(page, 1, "");
      await expect(rows(page).first()).toContainText("(empty — type the line)");
      await expect(stored(page, 0)).toHaveValue("");
    });

    test("a new line opens for typing", async ({ page }) => {
      await page
        .getByRole("button", { name: "Add ingredient", exact: true })
        .click();
      const field = page.getByLabel("Ingredient 3", { exact: true });
      await expect(field).toBeFocused();
      await field.fill("3 eggs");
      await field.press("Enter");
      await expect(stored(page, 2)).toHaveValue(
        '<Multiplyable baseNumber="3" /> eggs',
      );
    });

    test("the row's menu turns a line into a heading and back", async ({
      page,
    }) => {
      const first = rows(page).first();
      await first.getByRole("button", { name: "Ingredient 1 actions" }).click();
      await page
        .getByRole("button", { name: "Make it a heading", exact: true })
        .click();
      await expect(first).toHaveAttribute("data-heading", "true");
      await expect(
        page.locator('input[name="ingredients[0].type"][value="heading"]'),
      ).toHaveCount(1);

      await first.getByRole("button", { name: "Ingredient 1 actions" }).click();
      await page
        .getByRole("button", { name: "Make it an ingredient", exact: true })
        .click();
      await expect(first).not.toHaveAttribute("data-heading", "true");
      await expect(
        page.locator('input[name="ingredients[0].type"]'),
      ).toHaveCount(0);
    });

    test("a * that points at a note is flagged, and the rail counts it", async ({
      page,
    }) => {
      await typeIntoRow(page, 2, "coarse sugar* — for rolling");
      await expect(rows(page).nth(1)).toContainText(
        "points at a note on the page that did not come in",
      );
      await expect(page.getByTestId("recipe-form-rail")).toContainText(
        "1 check",
      );
    });

    test("an edited line is saved marked up, the rest as they were", async ({
      page,
    }) => {
      await typeIntoRow(page, 1, "2 tsp pepper");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 6" }),
      ).toBeVisible();
      await expect(page.getByText("2 tsp pepper")).toBeVisible();

      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await markdownEditorReady(page, "description");
      await expect(stored(page, 0)).toHaveValue(
        '<Multiplyable baseNumber="2" /> tsp pepper',
      );
      await expect(stored(page, 1)).toHaveValue(
        '<Multiplyable baseNumber="1" /> cup water',
      );
    });
  });

  test.describe("Edit as text", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("two-pages");
      await page.goto("/recipe/recipe-6/edit");
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");
    });

    test("shows the list as text, and a pasted list becomes the rows", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: "Edit as text", exact: true })
        .click();
      await expect(page.getByTitle("Ingredients Paste Area")).toHaveValue(
        "1 1/2 tsp salt\n1 cup water",
      );
      await page.getByTitle("Ingredients Paste Area").fill(
        `
* 1 cup water
* 2 tsp **sugar**
* 3 Tbsp oil
`,
      );
      await page.getByRole("button", { name: "Rows", exact: true }).click();

      await expect(stored(page, 0)).toHaveValue(
        '<Multiplyable baseNumber="1" /> cup water',
      );
      await expect(stored(page, 1)).toHaveValue(
        '<Multiplyable baseNumber="2" /> tsp **sugar**',
      );
      await expect(rows(page).nth(1).locator("strong")).toHaveText("sugar");
      await expect(stored(page, 2)).toHaveValue(
        '<Multiplyable baseNumber="3" /> Tbsp oil',
      );
    });
  });
});
