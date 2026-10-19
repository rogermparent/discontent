import { test, expect } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  openMarkdownSource,
  searchFor,
  signIn,
} from "../support/helpers";
import { snapshotLocator, snapshotPage } from "../support/visual";

/*
 * The edit form's preview of Recipe 6's image is a downscaled raster, and
 * Chromium resamples it a little differently from run to run: 42b measured up
 * to 206 px (build) and 599 px (dev) of difference there, and nowhere else on
 * these pages, against the config's 100 px. A 1 500 px allowance for the three
 * pages that show it, still far under the ~19 000 px the edit form moved
 * between July's baselines and 41d2's.
 */
const EDIT_FORM_IMAGE = { maxDiffPixels: 1_500 };

test.describe("Visual baselines @visual", () => {
  test("homepage with three recipes", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await snapshotPage(page, "homepage-three-recipes.png");
  });

  test("homepage with two-page recipe set shows 'All 7 recipes'", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "All 7 recipes", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "homepage-two-pages.png");
  });

  /*
   * 42f: the season and the rail, which no other baseline has. `drinks-bar`
   * has Halloween and Christmas; a feature of Halloween (shown once, as its
   * row) and of a recipe (the featured list). The dates are `<time>`s,
   * masked; the clock fixes the countdowns.
   */
  test("homepage with a season and the featured rail", async ({
    page,
    request,
    resetData,
    createApiToken,
  }) => {
    await resetData("drinks-bar");
    const token = await createApiToken();
    for (const data of [
      { term: "halloween", slug: "featured-halloween" },
      { recipe: "daiquiri", slug: "featured-daiquiri" },
    ]) {
      const created = await request.post("/api/featured", {
        headers: { authorization: `Bearer ${token}` },
        data,
      });
      expect(created.status()).toBe(201);
    }
    await page.clock.setFixedTime(new Date(2026, 9, 18, 12));
    await page.goto("/");
    await expect(page.getByTestId("season-countdown")).toHaveCount(2);
    await expect(
      page.getByRole("region", { name: "Featured", exact: true }),
    ).toContainText("Daiquiri");
    await snapshotPage(page, "homepage-season-rail.png");
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
    await snapshotPage(page, "edit-form-populated.png", EDIT_FORM_IMAGE);
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
    await snapshotPage(page, "edit-form-overwrite.png", EDIT_FORM_IMAGE);
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
    await snapshotPage(page, "markdown-source-mode.png", EDIT_FORM_IMAGE);
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
    // No allowance of its own since 42b: the 5 % this had (#132) covered
    // host-drawn baselines against CI's fonts, and baselines are drawn in
    // CI's image now; the config's 100 px is 2.4 % of this 118×36 element.
    await snapshotLocator(showMore, "search-reveal-control.png");
  });

  // `/make` with a few items in: the question, the shelf of tape labels,
  // quick picks, ticker, "Buy next" and the bucketed grids, all in one shot
  // (25c, redesigned in 41h).
  test("make page with an inventory", async ({ page, resetData }) => {
    await resetData("make-drinks");
    await page.goto("/make");
    await expect(page.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = page.getByTestId("inventory-input");
    await input.fill("vodka, simple syrup, gin, tonic, Gnista");
    await input.press("Enter");
    await expect(page.getByTestId("make-can")).toContainText("Gin and Tonic");
    /* The "Added 5 items." toast has gone. */
    await expect(page.getByTestId("make-toast")).toBeEmpty({
      timeout: 5_000,
    });
    await snapshotPage(page, "make-page.png");
  });

  // 42m2: the results at 1920 px — a matcher on the shelf, photo cards at
  // most four across with their tapes as buttons, further away as rows.
  test("make page results, wide", async ({ page, resetData }) => {
    await resetData("make-beans");
    /* Tall enough that the page fits: a shot of an element taller than the
     * window drew the sticky header over it (Th5). */
    await page.setViewportSize({ width: 1920, height: 2800 });
    await page.goto("/make");
    await expect(page.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = page.getByTestId("inventory-input");
    await input.fill("any bean, cucumber");
    await input.press("Enter");
    await page.getByTestId("make-further").locator("summary").click();
    await expect(page.getByTestId("make-rows")).toContainText("Black Bean");
    await expect(page.getByTestId("make-toast")).toBeEmpty({
      timeout: 5_000,
    });
    await snapshotLocator(
      page.getByTestId("make-results"),
      "make-results-wide.png",
    );
  });

  // 41h: the spec cards, a featured ingredient in the question and on its
  // labels, and Buy next for the featured scope.
  test("make page, spec cards with a feature", async ({ page, resetData }) => {
    await resetData("make-drinks");
    await page.goto("/make?q=tag:drink ingredient:tonic");
    await expect(page.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = page.getByTestId("inventory-input");
    await input.fill("vodka, simple syrup, gin, tonic water, lime");
    await input.press("Enter");
    /* A viewport the page fits in: a full-page shot of a page taller than
     * the window drew the sticky header mid-page here (Th5). */
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page
      .getByRole("group", { name: "Cards" })
      .getByRole("radio", { name: "Specs" })
      .check();
    await expect(page.getByTestId("make-spec-cards").first()).toContainText(
      "Gin and Tonic",
    );
    await expect(page.getByTestId("make-toast")).toBeEmpty({
      timeout: 5_000,
    });
    await snapshotPage(page, "make-page-specs.png");
  });
});
