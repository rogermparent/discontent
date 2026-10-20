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

    await expect(page.getByText("Nothing saved yet")).toBeVisible();
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
    // 43s: what was searched, and where it looked.
    await expect(
      page.getByRole("heading", {
        name: "Nothing mentions zzzzzzz-no-matches-zzzzz",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("search-no-results")).toContainText(
      "Not a name, tag, ingredient or description in 3 recipes.",
    );
    // A reader is offered no import; Clear is there.
    await expect(
      page.getByRole("link", { name: "Import a recipe" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByTestId("search-no-results")
        .getByRole("button", { name: "Clear search" }),
    ).toBeVisible();
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
