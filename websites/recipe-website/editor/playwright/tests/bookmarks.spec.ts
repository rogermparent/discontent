import { test, expect } from "../support/test";

test.describe("Bookmarks", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("two-pages");
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("recipe_bookmarks");
    });
  });

  test.describe("Bookmarks Page", () => {
    test("should show empty state when no bookmarks exist", async ({
      page,
    }) => {
      await page.goto("/bookmarks");

      await expect(page.getByText("My Bookmarks")).toBeVisible();
      await expect(
        page.getByText("You have not bookmarked any recipes yet."),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Browse Recipes", exact: true }),
      ).toHaveAttribute("href", "/recipes");
    });

    test("should navigate to recipes from empty state", async ({ page }) => {
      await page.goto("/bookmarks");

      await page
        .getByRole("link", { name: "Browse Recipes", exact: true })
        .click();
      await expect(page).toHaveURL(/\/recipes$/);
    });
  });

  test.describe("Bookmarking from Recipe Detail", () => {
    test("should bookmark a recipe", async ({ page }) => {
      await page.goto("/recipe/recipe-6");

      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 6" }),
      ).toBeVisible();

      await expect(page.getByTitle("Bookmark", { exact: true })).toBeVisible();
      await expect(page.getByTitle("Remove Bookmark")).toHaveCount(0);

      await page.getByTitle("Bookmark", { exact: true }).click();

      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();
      await expect(page.getByTitle("Bookmark", { exact: true })).toHaveCount(0);
    });

    test("should remove a bookmark", async ({ page }) => {
      await page.goto("/recipe/recipe-6");

      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.getByTitle("Remove Bookmark").click();

      await expect(page.getByTitle("Bookmark", { exact: true })).toBeVisible();
      await expect(page.getByTitle("Remove Bookmark")).toHaveCount(0);
    });

    test("should persist bookmark after page reload", async ({ page }) => {
      await page.goto("/recipe/recipe-6");

      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.reload();

      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();
    });

    test("should persist bookmark when navigating between recipes", async ({
      page,
    }) => {
      await page.goto("/recipe/recipe-6");

      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/recipe/recipe-5");
      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 5" }),
      ).toBeVisible();

      await expect(page.getByTitle("Bookmark", { exact: true })).toBeVisible();

      await page.goto("/recipe/recipe-6");

      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();
    });
  });

  test.describe("Bookmarks Page with Bookmarked Recipes", () => {
    test("should display bookmarked recipes", async ({ page }) => {
      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/bookmarks");

      await expect(page.getByText("My Bookmarks")).toBeVisible();
      await expect(page.getByText("Recipe 6", { exact: true })).toBeVisible();
      await expect(
        page.getByText("You have not bookmarked any recipes yet."),
      ).toHaveCount(0);
    });

    test("should display multiple bookmarked recipes", async ({ page }) => {
      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/recipe/recipe-3");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/bookmarks");

      await expect(page.getByText("My Bookmarks")).toBeVisible();
      await expect(page.getByText("Recipe 6", { exact: true })).toBeVisible();
      await expect(page.getByText("Recipe 3", { exact: true })).toBeVisible();
    });

    test("should navigate to recipe detail from bookmarks page", async ({
      page,
    }) => {
      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/bookmarks");
      await page.getByText("Recipe 6", { exact: true }).click();

      await expect(page).toHaveURL(/\/recipe\/recipe-6/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 6" }),
      ).toBeVisible();
    });

    test("should update bookmarks page when recipe is unbookmarked", async ({
      page,
    }) => {
      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/recipe/recipe-3");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/bookmarks");
      await expect(page.getByText("Recipe 6", { exact: true })).toBeVisible();
      await expect(page.getByText("Recipe 3", { exact: true })).toBeVisible();

      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Remove Bookmark").click();
      await expect(page.getByTitle("Bookmark", { exact: true })).toBeVisible();

      await page.goto("/bookmarks");
      await expect(page.getByText("Recipe 3", { exact: true })).toBeVisible();
      await expect(page.getByText("Recipe 6", { exact: true })).toHaveCount(0);
    });

    test("should show empty state after removing all bookmarks", async ({
      page,
    }) => {
      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Bookmark", { exact: true }).click();
      await expect(page.getByTitle("Remove Bookmark")).toBeVisible();

      await page.goto("/bookmarks");
      await expect(page.getByText("Recipe 6", { exact: true })).toBeVisible();

      await page.goto("/recipe/recipe-6");
      await page.getByTitle("Remove Bookmark").click();
      await expect(page.getByTitle("Bookmark", { exact: true })).toBeVisible();

      await page.goto("/bookmarks");
      await expect(
        page.getByText("You have not bookmarked any recipes yet."),
      ).toBeVisible();
      await expect(page.getByText("Recipe 6", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("Bookmark Button on Recipe Lists", () => {
    test("should show bookmark button on hover in recipe list", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(
        page
          .getByText("Recipe 6", { exact: true })
          .locator("xpath=ancestor::li[1]")
          .getByTitle("Bookmark", { exact: true }),
      ).toBeAttached();
    });
  });

  test.describe("Header Navigation", () => {
    test("should have Bookmarks link in header", async ({ page }) => {
      await page.goto("/");

      // Scope to the banner: "Bookmarks" now also appears in the footer's
      // Browse column, so an unscoped query would match two links.
      await expect(
        page.getByRole("banner").getByRole("link", { name: "Bookmarks" }),
      ).toBeVisible();
    });

    test("should navigate to bookmarks page from header", async ({ page }) => {
      await page.goto("/");

      await page
        .getByRole("banner")
        .getByRole("link", { name: "Bookmarks" })
        .click();

      await expect(page).toHaveURL(/\/bookmarks/);
      await expect(page.getByText("My Bookmarks")).toBeVisible();
    });
  });
});
