import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

test.describe("New Recipe Duplicate Slug Detection", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("one-recipe");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
  });

  test("should show an error when submitting a recipe with a duplicate slug (auto-generated)", async ({
    page,
  }) => {
    await page.locator('[name="name"]').fill("Existing Recipe");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Overwrite" })).toBeVisible();
  });

  test("should show an error when submitting a recipe with a manually entered duplicate slug", async ({
    page,
  }) => {
    await page.locator('[name="name"]').fill("Something Different");
    await page.getByLabel("Slug").clear();
    await page.getByLabel("Slug").fill("existing-recipe");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Overwrite" })).toBeVisible();
  });

  test("should overwrite an existing recipe when clicking Overwrite", async ({
    page,
  }) => {
    await page.locator('[name="name"]').fill("Existing Recipe");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await page.getByRole("button", { name: "Overwrite" }).click();

    await expect(page).toHaveURL(/\/recipe\/existing-recipe/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Existing Recipe" }),
    ).toBeVisible();
  });

  test("should successfully create a recipe with a unique slug (no error)", async ({
    page,
  }) => {
    await page.locator('[name="name"]').fill("Brand New Recipe");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(/\/recipe\/brand-new-recipe/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Brand New Recipe" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Overwrite" })).toHaveCount(
      0,
    );
  });
});
