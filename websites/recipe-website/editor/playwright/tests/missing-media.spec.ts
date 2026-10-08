import { test, expect } from "../support/test";
import { removeRecipeUpload } from "../support/tasks";

/*
 * Epic 28, D10: a recipe whose photo is named but not on this editor — not
 * copied to a mirror yet, or dropped — renders a monogram, never an empty
 * frame or a broken image. `two-pages`' Recipe 6 has the one upload; each
 * test deletes it behind the app's back.
 */
test.describe("Missing media", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("two-pages");
    await removeRecipeUpload("recipe-6", "recipe-6-test-image.png");
  });

  test("the recipe page shows a monogram where the photo was", async ({
    page,
  }) => {
    await page.goto("/recipe/recipe-6");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
    await expect(page.getByTestId("recipe-image-missing")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Photo of Recipe 6" }),
    ).toHaveCount(0);
  });

  test("the original answers 404", async ({ request }) => {
    const response = await request.get(
      "/uploads/recipe/recipe-6/uploads/recipe-6-test-image.png",
    );
    expect(response.status()).toBe(404);
  });

  test("a client-rendered card falls back instead of a broken image", async ({
    page,
  }) => {
    await page.goto("/search?q=%22Recipe%206%22");
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Recipe 6" }) })
      .first();
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("img", { name: "Recipe thumbnail" }),
    ).toHaveCount(0);
  });
});
