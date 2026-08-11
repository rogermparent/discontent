import { test, expect } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  openMarkdownSource,
  searchFor,
  signIn,
} from "../support/helpers";
import { snapshotLocator, snapshotPage } from "../support/visual";

test.describe("Visual baselines @visual", () => {
  test("homepage with three recipes", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await snapshotPage(page, "homepage-three-recipes.png");
  });

  test("homepage with two-page recipe set shows 'More Latest Recipes'", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "More Latest Recipes", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "homepage-two-pages.png");
  });

  test("recipe detail page (signed-out)", async ({ page, resetData }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
    await snapshotPage(page, "recipe-detail-signed-out.png");
  });

  test("recipe detail page (signed-in)", async ({ page, resetData }) => {
    await resetData("two-pages");
    await page.goto("/");
    await signIn(page);
    await page.goto("/recipe/recipe-6");
    await expect(
      page.getByRole("link", { name: "Edit", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "recipe-detail-signed-in.png");
  });

  test("featured recipe detail page (signed-in)", async ({
    page,
    resetData,
  }) => {
    await resetData("one-featured-recipe");
    await page.goto("/");
    await signIn(page);
    await page.goto("/featured-recipes");
    await page
      .getByRole("link", { name: /Featured Recipe/i })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Delete", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "featured-recipe-detail-signed-in.png");
  });

  test("new-recipe form", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/new-recipe");
    await expect(page.getByLabel("Name").first()).toBeVisible();
    // Wait for the Lexical editors to register so the snapshot captures the
    // hydrated form (toolbars/editor chrome), not a mid-hydration frame.
    await markdownEditorReady(page, "description");
    await snapshotPage(page, "new-recipe-form.png");
  });

  test("new-recipe form with slug conflict shows Overwrite", async ({
    page,
    resetData,
  }) => {
    await resetData("one-recipe");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    await page.locator('[name="name"]').fill("Existing Recipe");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Overwrite", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "new-recipe-form-overwrite.png");
  });

  test("edit form populated", async ({ page, resetData }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6/edit");
    await fillSignInForm(page);
    await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible({
      timeout: 10_000,
    });
    await markdownEditorReady(page, "description");
    await snapshotPage(page, "edit-form-populated.png");
  });

  test("edit form with slug conflict shows Overwrite", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6/edit");
    await fillSignInForm(page);
    await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible({
      timeout: 10_000,
    });
    await markdownEditorReady(page, "description");
    await page.getByLabel("Slug").clear();
    await page.getByLabel("Slug").fill("recipe-5");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Overwrite", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "edit-form-overwrite.png");
  });

  test("markdown editor source mode active", async ({ page, resetData }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6/edit");
    await fillSignInForm(page);
    await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible({
      timeout: 10_000,
    });
    // The Lexical editor exposes a raw-markdown Source toggle (helper waits for
    // hydration so the toggle click isn't swallowed mid-hydration).
    await openMarkdownSource(page, "description");
    await expect(page.getByLabel("Description source")).toBeVisible();
    await snapshotPage(page, "markdown-source-mode.png");
  });

  test("git page with branches and remotes", async ({
    page,
    resetData,
    initializeContentGit,
  }) => {
    await resetData();
    await initializeContentGit();
    await page.goto("/git");
    await fillSignInForm(page);
    await page.getByText("Advanced: branches", { exact: true }).click();
    await page.getByText("Advanced: remotes", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Checkout", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "git-page.png");
  });

  test("page view with edit/delete actions (signed-in)", async ({
    page,
    resetData,
  }) => {
    await resetData("about-page");
    await page.goto("/");
    await signIn(page);
    await page.goto("/about");
    await expect(
      page.getByRole("button", { name: "Delete", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "page-view-signed-in.png");
  });

  test("layout footer signed out", async ({ page, resetData }) => {
    await resetData();
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "layout-footer-signed-out.png");
  });

  test("layout footer signed in", async ({ page, resetData }) => {
    await resetData();
    await page.goto("/");
    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await snapshotPage(page, "layout-footer-signed-in.png");
  });

  test("featured-recipes page with many items", async ({ page, resetData }) => {
    await resetData("many-featured-recipes");
    await page.goto("/featured-recipes");
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await snapshotPage(page, "featured-recipes-page1.png");
  });

  test("search page with no query", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/search");
    await expect(page.getByLabel("Search recipes")).toBeVisible();
    // Idle is now a browse view (instrument → ticker → tag rail → whole
    // corpus), so wait for the corpus to land before shooting.
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 3 RECIPES/i,
    );
    await snapshotPage(page, "search-page-empty.png");
  });

  test("search page with hits", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/search");
    await searchFor(page, "Recipe");
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await snapshotPage(page, "search-page-with-hits.png");
  });

  // The three-recipes fixture is too small to show the RECENT row alongside a
  // populated tag rail, or the reveal control at all. Shot against the larger
  // search-corpus fixture and clipped to the instrument stack (field → ticker →
  // recents → rail), so a 60-card grid doesn't make the baseline enormous.
  test("search page instrument stack with recents", async ({
    page,
    resetData,
  }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 67 RECIPES/i,
      { timeout: 20_000 },
    );

    // Commit a query, then clear it, so the idle view has a RECENT chip.
    await searchFor(page, "creme");
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await searchFor(page, "");
    await expect(page.getByLabel("Search again for creme")).toBeVisible();

    await snapshotPage(page, "search-page-recents.png", {
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 480 },
    });
  });

  // The chip preview line (PR 21b). Locator-scoped, both because the line is the
  // subject and because a 60-card grid behind it would make the baseline
  // enormous and unstable. Nothing above moves to accommodate it: the line
  // renders *nothing* without advanced syntax, which is what keeps
  // `search-page-empty` and `search-page-with-hits` where they were.
  test("search page query chips", async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 67 RECIPES/i,
      { timeout: 20_000 },
    );

    // One of each kind of chip: an include, an exclude, and a comparison.
    await searchFor(page, "tag:dessert -tag:baked time:<30");
    const chips = page.getByTestId("query-chips");
    await expect(chips.getByTestId("query-chip-face")).toHaveCount(3);
    await snapshotLocator(chips, "search-query-chips.png");
  });

  // The suggestion list (PR 21c). Locator-scoped for the chips' reasons, and
  // because the list is *portaled* — it is not inside the field it hangs under,
  // so a clip would have to be computed rather than named. Nothing above moves
  // for it either: closed, the field renders exactly the markup it did before,
  // which is what keeps the four `/search` baselines where they are.
  test("search page autocomplete list", async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 67 RECIPES/i,
      { timeout: 20_000 },
    );

    // A field list rather than a tag one: seven rows with hints is the denser
    // of the two states, and the one whose two-column row is worth pinning.
    const field = page.getByLabel("Search recipes");
    await field.click();
    await field.pressSequentially("t");
    const list = page.getByTestId("query-autocomplete");
    await expect(list).toBeVisible();
    await field.press("ArrowDown"); // one row active, so the highlight is in shot
    await snapshotLocator(list, "search-autocomplete.png");
  });

  test("search page reveal control", async ({ page, resetData }) => {
    await resetData("search-corpus");
    await page.goto("/search");
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 67 RECIPES/i,
      { timeout: 20_000 },
    );

    const showMore = page.getByRole("button", { name: /Show \d+ more/ });
    await showMore.scrollIntoViewIfNeeded();
    await snapshotLocator(showMore, "search-reveal-control.png");
  });
});
