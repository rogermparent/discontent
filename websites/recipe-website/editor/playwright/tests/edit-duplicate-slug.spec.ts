import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

test.describe("Edit Recipe Duplicate Slug Detection", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6/edit");
    await fillSignInForm(page);
    await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible();
    await markdownEditorReady(page, "description");
  });

  test("should show an error when changing slug to an existing recipe's slug", async ({
    page,
  }) => {
    await page.getByLabel("Slug").clear();
    await page.getByLabel("Slug").fill("recipe-5");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Overwrite" })).toBeVisible();
  });

  test("should overwrite an existing recipe when clicking Overwrite", async ({
    page,
  }) => {
    const editedName = "Recipe 6 Renamed";
    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill(editedName);

    await page.getByLabel("Slug").clear();
    await page.getByLabel("Slug").fill("recipe-5");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await page.getByRole("button", { name: "Overwrite" }).click();

    await expect(page).toHaveURL(/\/recipe\/recipe-5/);
    await expect(
      page.getByRole("heading", { level: 1, name: editedName }),
    ).toBeVisible();
  });

  test("should successfully edit a recipe with a unique slug (no conflict)", async ({
    page,
  }) => {
    await page.getByLabel("Slug").clear();
    await page.getByLabel("Slug").fill("recipe-6-unique");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(/\/recipe\/recipe-6-unique/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Overwrite" })).toHaveCount(
      0,
    );
  });
});
