import { test, expect } from "../support/test";
import { searchFor } from "../support/helpers";
import { snapshotPage } from "../support/visual";

test.describe("Empty States", () => {
  test("homepage shows empty message when there are no recipes", async ({
    page,
    resetData,
  }) => {
    await resetData();
    await page.goto("/");

    await expect(page.getByText("There are no recipes yet.")).toBeVisible();
    await snapshotPage(page, "homepage-empty.png");
  });

  test("bookmarks page shows empty state when nothing is saved @visual", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("recipe_bookmarks"));
    await page.goto("/bookmarks");

    await expect(
      page.getByText("You have not bookmarked any recipes yet."),
    ).toBeVisible();
    await snapshotPage(page, "bookmarks-empty.png");
  });

  test("search returns no results for an unmatchable query", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/search");
    await searchFor(page, "zzzzzzz-no-matches-zzzzz");

    await expect(page.getByTestId("recipe-list")).toHaveCount(0);
    await expect(page.getByText("No matches")).toBeVisible();
    await snapshotPage(page, "search-no-results.png");
  });

  test("featured recipes page is empty when none are featured", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/featured-recipes");

    await expect(page.getByRole("listitem")).toHaveCount(0);
    await snapshotPage(page, "featured-recipes-empty.png");
  });
});
