import { readFileSync } from "node:fs";
import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  signIn,
  deleteWithConfirm,
  markdownEditorReady,
} from "../support/helpers";
import { fixturePath } from "../support/tasks";

/** The client search pipeline has to fetch and index before a query resolves. */
const SEARCH_TIMEOUT = 20_000;

// Direct-child cards only, matching the search specs — a card's matched
// ingredient lines would otherwise be counted as extra list items.
const searchCards = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

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

    test("renders a group's items as recipe cards, in order", async ({
      page,
      resetData,
    }) => {
      /*
       * 22f turned the item list into a grid of the same cards the recipe grids
       * draw — a collection is something you read, and a column of blue names
       * carries no image, date or tags to recognise a recipe by. What must not
       * change is the markup the rest of the suite counts on: the cards live in
       * a `group-item` list of their own and the page still does not answer to
       * `recipe-list`, which a dozen specs resolve unscoped.
       */
      await resetData("three-recipes-groups");
      await page.goto("/group/week-of-may-4");

      await expect(page.getByTestId("recipe-list")).toHaveCount(0);

      const items = page.getByTestId("group-item");
      await expect(items).toHaveCount(3);

      // Each resolved row is a card whose one link opens the recipe.
      await expect(items.nth(0).getByTestId("group-item-label")).toHaveText(
        "Mon · Dinner",
      );
      await expect(items.nth(0).getByRole("link")).toHaveAttribute(
        "href",
        "/recipe/first-recipe",
      );
      await expect(items.nth(1).getByRole("link")).toHaveAttribute(
        "href",
        "/recipe/second-recipe",
      );
      // …and the dangling one keeps its slot rather than leaving a hole.
      await expect(items.nth(2).getByTestId("group-item-missing")).toHaveText(
        "Recipe not found: missing-recipe",
      );
      await expect(items.nth(2).getByRole("link")).toHaveCount(0);
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

  /**
   * 22f: the ways a reader *arrives* at a group. Groups shipped in 22b with no
   * entry point but the raw URL, a ⌘K row and a member recipe's "Appears in".
   */
  test.describe("discovery", () => {
    test("the masthead links to Groups on every page", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/");

      const link = page
        .getByRole("banner")
        .getByRole("link", { name: "Groups", exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/groups$/);

      // It is a *default* nav item, so it is there with no menu configured and
      // on a corpus that has no groups in it at all.
      await resetData("three-recipes");
      await page.goto("/recipe/first-recipe");
      await expect(
        page.getByRole("banner").getByRole("link", { name: "Groups" }),
      ).toBeVisible();
    });

    test("the homepage lists the newest groups and links to the rest", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/");

      await expect(
        page.getByRole("heading", { name: "Groups", exact: true }),
      ).toBeVisible();

      const cards = page.getByTestId("group-list").getByRole("listitem");
      await expect(cards).toHaveCount(2);
      // Newest first, the same order `/groups` uses — both read the head page
      // of `pagination:groups:by-date`.
      await expect(cards.nth(0)).toContainText("Week of May 4");
      await expect(cards.nth(1)).toContainText("Weeknight Favourites");

      await page.getByRole("link", { name: "More groups" }).click();
      await expect(page).toHaveURL(/\/groups$/);
    });

    test("the homepage shows no Groups section when there are none", async ({
      page,
      resetData,
    }) => {
      /*
       * The promise that keeps `three-recipes`' visual baselines still: every
       * surface this phase adds renders *nothing* on a corpus with no groups,
       * so the only thing that moved in those shots is the masthead link.
       */
      await resetData("three-recipes");
      await page.goto("/");

      await expect(page.getByTestId("group-list")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Groups", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("link", { name: "More groups" })).toHaveCount(
        0,
      );
    });

    test("'Search within this group' narrows the search to its members", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/group/weeknight-favourites");

      await page.getByTestId("group-search-link").click();
      await expect(page).toHaveURL(/\?q=group%3Aweeknight-favourites/);

      // Exactly the collection's two members, and nothing else in the corpus.
      await expect(searchCards(page)).toHaveCount(2, {
        timeout: SEARCH_TIMEOUT,
      });
      const names = await searchCards(page)
        .getByRole("heading")
        .allTextContents();
      expect(names.map((name) => name.trim()).sort()).toEqual([
        "First Recipe",
        "Third Recipe",
      ]);

      // The term is visible in the field and as a chip — a `group:` search is
      // an ordinary query the reader can go on editing, not a hidden mode.
      await expect(page.getByLabel("Search recipes")).toHaveValue(
        "group:weeknight-favourites",
      );
      await expect(
        page.getByTestId("query-chips").getByTestId("query-chip-face"),
      ).toHaveText(["group:weeknight-favourites"]);
    });
  });

  /**
   * Group thumbnails (22g): *pre-defined group image › first usable member
   * thumbnail › placeholder icon*, with the first rung landing in 22h.
   *
   * The fallback is a render-time read rather than a borrowed index value,
   * because borrowing it would mean following `items[].recipe` — the array
   * reference the engine cannot address (D3/F32). No fixture recipe has a
   * photo, so these upload one through the form: it is the only way to prove
   * the invalidation as well as the render, since the write that has to reach
   * these cards is a *recipe* write, not a group one.
   */
  test.describe("thumbnails", () => {
    const MEMBER_IMAGE =
      /^\/image\/uploads\/recipe\/third-recipe\/uploads\/recipe-6-test-image\.png\/.*\.webp$/;

    /** Cards on `/groups` and in the homepage section, newest first. */
    const groupCards = (page: Page) =>
      page.getByTestId("group-list").getByRole("listitem");

    async function uploadImageToThirdRecipe(page: Page) {
      await page.goto("/recipe/third-recipe/edit");
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");

      await page.getByLabel("Image", { exact: true }).setInputFiles({
        name: "recipe-6-test-image.png",
        mimeType: "image/png",
        buffer: readFileSync(fixturePath("images", "recipe-6-test-image.png")),
      });
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      /*
       * Wait for the *redirect*, not for a heading — the edit page's own
       * "Editing Recipe: Third Recipe" satisfies a substring name match, so
       * gating on the heading returns while the URL is still `/edit` and the
       * next `goto` aborts the write in flight. The commit and the tag calls
       * are the last thing a write does, so that leaves the image on disk with
       * `item:recipes:third-recipe` never fired — which reads exactly like a
       * broken invalidation. `recipe-item-records.spec.ts` documents the same
       * trap, and this is the second seat to fall into it.
       */
      await page.waitForURL((url) => url.pathname === "/recipe/third-recipe");
      await expect(
        page.getByRole("heading", { level: 1, name: "Third Recipe" }),
      ).toBeVisible();
    }

    test("falls back to the placeholder while no member has a photo", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.goto("/groups");

      await expect(groupCards(page)).toHaveCount(2);
      await expect(
        page
          .getByTestId("group-list")
          .getByTestId("group-thumbnail-placeholder"),
      ).toHaveCount(2);
      await expect(
        page.getByTestId("group-list").getByTestId("group-thumbnail"),
      ).toHaveCount(0);

      await page.goto("/");
      await expect(
        page
          .getByTestId("group-list")
          .getByTestId("group-thumbnail-placeholder"),
      ).toHaveCount(2);
    });

    test("a member's photo becomes the group's thumbnail everywhere", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await uploadImageToThirdRecipe(page);

      /*
       * `weeknight-favourites` lists first-recipe then third-recipe, so the walk
       * passes the imageless one and stops at this. `week-of-may-4` lists first,
       * second and a slug that does not exist — none with a photo — so it keeps
       * the placeholder, which is what makes this a *precedence* assertion
       * rather than "some card gained an image".
       */
      await page.goto("/groups");
      await expect(groupCards(page).nth(0)).toContainText("Week of May 4");
      await expect(
        groupCards(page).nth(0).getByTestId("group-thumbnail-placeholder"),
      ).toBeVisible();
      await expect(
        groupCards(page).nth(1).getByTestId("group-thumbnail").getByRole("img"),
      ).toHaveAttribute("src", MEMBER_IMAGE);

      // The homepage Groups section reads the same head page.
      await page.goto("/");
      await expect(
        groupCards(page).nth(1).getByTestId("group-thumbnail").getByRole("img"),
      ).toHaveAttribute("src", MEMBER_IMAGE);
      await expect(
        groupCards(page).nth(0).getByTestId("group-thumbnail-placeholder"),
      ).toBeVisible();

      /*
       * And the featured group card, which is the surface with no group write
       * behind it at all: nothing about `featured-weeknight` changed, and the
       * card is fresh because the read is tagged `item:recipes:third-recipe`.
       */
      await expect(
        page
          .getByTestId("featured-group-card")
          .getByTestId("group-thumbnail")
          .getByRole("img"),
      ).toHaveAttribute("src", MEMBER_IMAGE);
    });

    test("the group page itself is unchanged — recipe cards, no group image", async ({
      page,
      resetData,
    }) => {
      // 22h gives a group an image of its own and puts it here; until then this
      // page is exactly what 22f shipped.
      await resetData("three-recipes-groups");
      await uploadImageToThirdRecipe(page);

      await page.goto("/group/weeknight-favourites");
      await expect(page.getByTestId("group-item")).toHaveCount(2);
      await expect(page.getByTestId("group-thumbnail")).toHaveCount(0);
      await expect(page.getByTestId("group-thumbnail-placeholder")).toHaveCount(
        0,
      );
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

test.describe("Groups @mobile", () => {
  test("the hamburger sheet lists Groups too", async ({ page, resetData }) => {
    // The sheet renders the same `defaultHeaderItems` the desktop row does, so
    // this is the one assertion that proves the mobile half did not get left
    // behind when a default item was added.
    await resetData("three-recipes-groups");
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    const sheet = page.getByRole("dialog");
    const link = sheet.getByRole("link", { name: "Groups", exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/groups$/);
  });
});
