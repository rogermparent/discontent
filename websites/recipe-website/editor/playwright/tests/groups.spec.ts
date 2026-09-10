import { test, expect } from "../support/test";
import {
  fillSignInForm,
  signIn,
  deleteWithConfirm,
  markdownEditorReady,
} from "../support/helpers";

/**
 * Groups: meal plans and collections (22b).
 *
 * The `three-recipes-groups` fixture is `three-recipes` plus two seeded groups,
 * one of which deliberately lists a recipe that does not exist — nothing
 * rewrites `items[].recipe` when a recipe moves (D3), so a dangling item is an
 * ordinary state and the fixture carries one rather than making each test
 * manufacture it.
 */
test.describe("Groups", () => {
  test.describe("reading", () => {
    test("lists both seeded groups with their kind and count", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/groups");

      await expect(
        page.getByRole("heading", { name: "Groups", exact: true }),
      ).toBeVisible();

      const cards = page.getByTestId("group-list").getByRole("listitem");
      await expect(cards).toHaveCount(2);

      // Newest first: May 4 before May 1.
      await expect(cards.nth(0).getByText("Week of May 4")).toBeVisible();
      await expect(cards.nth(0).getByText("Meal plan")).toBeVisible();
      await expect(cards.nth(0).getByTestId("group-item-count")).toHaveText(
        "3 recipes",
      );

      await expect(
        cards.nth(1).getByText("Weeknight Favourites"),
      ).toBeVisible();
      await expect(cards.nth(1).getByText("Collection")).toBeVisible();
      await expect(cards.nth(1).getByTestId("group-item-count")).toHaveText(
        "2 recipes",
      );
    });

    test("shows a group's items in order, dangling one included", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/group/week-of-may-4");

      await expect(
        page.getByRole("heading", { name: "Week of May 4" }),
      ).toBeVisible();
      await expect(page.getByTestId("group-kind")).toHaveText("Meal plan");

      const items = page.getByTestId("group-item");
      await expect(items).toHaveCount(3);
      await expect(items.nth(0)).toContainText("Mon · Dinner");
      await expect(items.nth(0)).toContainText("First Recipe");
      await expect(items.nth(0)).toContainText("Leftovers for lunch");
      await expect(items.nth(1)).toContainText("Second Recipe");

      /*
       * The dangling row. It renders rather than disappearing: losing a day out
       * of a meal plan silently would be the worse failure, and there is no
       * write that could have repaired the slug.
       */
      await expect(page.getByTestId("group-item-missing")).toHaveText(
        "Recipe not found: missing-recipe",
      );

      await page.getByRole("link", { name: "First Recipe" }).click();
      await expect(page).toHaveURL(/\/recipe\/first-recipe$/);
    });

    test("shows Appears in on a recipe, newest group first, with its label", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/recipe/first-recipe");

      const appearsIn = page.getByTestId("appears-in");
      await expect(appearsIn).toBeVisible();

      const entries = appearsIn.getByTestId("appears-in-item");
      await expect(entries).toHaveCount(2);
      await expect(entries.nth(0)).toContainText("Week of May 4");
      await expect(entries.nth(0)).toContainText("Mon · Dinner");
      await expect(entries.nth(1)).toContainText("Weeknight Favourites");

      await appearsIn.getByRole("link", { name: "Week of May 4" }).click();
      await expect(page).toHaveURL(/\/group\/week-of-may-4$/);
    });

    test("renders no Appears in when the aggregate has never been folded", async ({
      page,
      resetData,
    }) => {
      /*
       * `three-recipes` predates groups entirely, so the read answers `null`
       * rather than an empty map — the state every existing content directory
       * is in until something writes a group. It has to read as "in no group",
       * not as an empty section with a heading and nothing under it.
       */
      await resetData("three-recipes");
      await page.goto("/recipe/second-recipe");
      await expect(page.getByTestId("appears-in")).toHaveCount(0);
      await expect(page.getByText("Appears in")).toHaveCount(0);
    });

    test("shows an empty state for a corpus with no groups", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes");
      await page.goto("/groups");

      await expect(page.getByText("No groups yet")).toBeVisible();
      await expect(page.getByTestId("group-list")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Browse all recipes" }),
      ).toBeVisible();
    });
  });

  test.describe("creating from a recipe", () => {
    test("carries the recipe through sign-in and into the first row", async ({
      page,
      resetData,
      baseURL,
    }) => {
      await resetData("three-recipes");
      await page.goto("/recipe/first-recipe");

      await page.getByRole("link", { name: "Group", exact: true }).click();
      // Signed out, so the button lands on the sign-in form — with the
      // preselection preserved in `redirectTo`, which is the whole point.
      await fillSignInForm(page);

      await expect(page).toHaveURL(baseURL + "/group/new?recipe=first-recipe");
      await expect(page.getByText("Selected: First Recipe")).toBeVisible();

      // The description is a Lexical island; gate on it before typing anywhere
      // in the form, so the first keystroke is not swallowed mid-hydration.
      await markdownEditorReady(page, "description");

      await page.getByLabel("Name").fill("My Week");
      await page.getByLabel("Kind").selectOption("meal-plan");
      await page
        .getByTestId("group-item-row")
        .first()
        .getByLabel("Label")
        .fill("Mon · Dinner");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/group/my-week");
      await expect(
        page.getByRole("heading", { name: "My Week" }),
      ).toBeVisible();
      await expect(page.getByTestId("group-kind")).toHaveText("Meal plan");
      await expect(page.getByTestId("group-item")).toHaveCount(1);

      // And the inverse index the recipe view reads is already right.
      await page.goto("/recipe/first-recipe");
      await expect(page.getByTestId("appears-in")).toContainText("My Week");
      await expect(page.getByTestId("appears-in")).toContainText(
        "Mon · Dinner",
      );
    });

    test("adds and removes item rows", async ({ page, resetData, baseURL }) => {
      await resetData("three-recipes");
      await page.goto("/recipe/first-recipe");
      await page.getByRole("link", { name: "Group", exact: true }).click();
      await fillSignInForm(page);
      await expect(page.getByText("Selected: First Recipe")).toBeVisible();
      await markdownEditorReady(page, "description");

      await page.getByRole("button", { name: "Add recipe" }).click();
      await page.getByRole("button", { name: "Add recipe" }).click();
      await expect(page.getByTestId("group-item-row")).toHaveCount(3);

      // Removing the *middle* row is the case a positional key would get wrong:
      // it renumbers the rows below it, and a remount would drop the first
      // row's fetched "Selected: First Recipe".
      await page.getByRole("button", { name: "Remove recipe 2" }).click();
      await expect(page.getByTestId("group-item-row")).toHaveCount(2);
      await expect(page.getByText("Selected: First Recipe")).toBeVisible();

      /*
       * The surviving added row is left empty, and the parse drops it rather
       * than failing: the picker starts empty and "Add recipe" appends another
       * empty one, so a blank row is a user who changed their mind, not an
       * error. `FormData` cannot carry an empty array either (T11), which is
       * what `items: z.array(...).default([])` is for.
       */
      await page.getByLabel("Name").fill("Just One");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/group/just-one");
      await expect(page.getByTestId("group-item")).toHaveCount(1);
      await expect(page.getByTestId("group-item").first()).toContainText(
        "First Recipe",
      );
    });
  });

  test.describe("editing", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("three-recipes-groups");
      await page.goto("/group/week-of-may-4/edit");
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");
    });

    test("re-labels an item, and the detail page shows it", async ({
      page,
      baseURL,
    }) => {
      const firstRow = page.getByTestId("group-item-row").first();
      await expect(firstRow.getByText("Selected: First Recipe")).toBeVisible();

      await firstRow.getByLabel("Label").clear();
      await firstRow.getByLabel("Label").fill("Sun · Lunch");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/group/week-of-may-4");
      await expect(page.getByTestId("group-item").first()).toContainText(
        "Sun · Lunch",
      );

      // The aggregate moved, so the recipe view's label moved with it.
      await page.goto("/recipe/first-recipe");
      await expect(page.getByTestId("appears-in")).toContainText("Sun · Lunch");
    });

    test("names the dangling slug in the picker rather than looking empty", async ({
      page,
    }) => {
      /*
       * Before 22b the field rendered its empty "Select Recipe" state while the
       * hidden input went on submitting the slug — so an edit that touched
       * nothing looked like it had cleared the row.
       */
      await expect(
        page
          .getByTestId("group-item-row")
          .nth(2)
          .getByTestId("recipe-select-missing"),
      ).toHaveText("Selected: missing-recipe (recipe not found)");
    });
  });

  test.describe("deleting", () => {
    test("removes the group, its page, and its Appears in entries", async ({
      page,
      resetData,
      request,
      baseURL,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/group/week-of-may-4");
      await expect(
        page.getByRole("heading", { name: "Week of May 4" }),
      ).toBeVisible();
      await signIn(page);

      await deleteWithConfirm(page, "group");

      await expect(page).toHaveURL(baseURL + "/groups");
      await expect(page.getByText("Week of May 4")).toHaveCount(0);

      const response = await request.get("/group/week-of-may-4");
      expect(response.status()).toBe(404);

      await page.goto("/recipe/first-recipe");
      const appearsIn = page.getByTestId("appears-in");
      await expect(appearsIn).toContainText("Weeknight Favourites");
      await expect(appearsIn).not.toContainText("Week of May 4");

      // Second Recipe was only in the deleted plan, so its block goes entirely.
      await page.goto("/recipe/second-recipe");
      await expect(page.getByTestId("appears-in")).toHaveCount(0);
    });
  });
});
