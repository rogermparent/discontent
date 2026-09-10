import { test, expect } from "../support/test";
import { searchFor } from "../support/helpers";
import { snapshotPage } from "../support/visual";

test.describe("Mobile @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("homepage renders on a small viewport @visual", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await snapshotPage(page, "homepage-mobile.png");
  });

  test("recipe view reflows ingredients on mobile @visual", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
    await snapshotPage(page, "recipe-mobile.png");
  });

  test("search input is reachable on mobile", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByLabel("Search recipes")).toBeVisible();
    await searchFor(page, "Second");
    await expect(
      page.getByRole("listitem").first().getByRole("heading"),
    ).toContainText("Second");
  });

  test("featured recipes grid collapses on mobile", async ({
    page,
    resetData,
  }) => {
    await resetData("many-featured-recipes");
    await page.goto("/featured-recipes");
    await expect(page.getByRole("listitem").first()).toBeVisible();
  });
});
