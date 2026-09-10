import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  signIn,
  fillMarkdownField,
  markdownEditorReady,
  searchFor,
  deleteWithConfirm,
} from "../support/helpers";

test.describe("Featured Recipes", () => {
  test.describe("homepage display", () => {
    test("should not show featured recipes section when there are none", async ({
      page,
      resetData,
    }) => {
      await resetData();
      await page.goto("/");
      await expect(page.getByText("Latest Recipes")).toBeVisible();
      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toHaveCount(0);
    });

    test("should show featured recipes on homepage", async ({
      page,
      resetData,
    }) => {
      await resetData("one-featured-recipe");
      await page.goto("/");

      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .locator("h2", { hasText: "Featured Recipes" })
          .locator("xpath=ancestor::*[1]")
          .getByText("Featured Recipe", { exact: true }),
      ).toBeVisible();
    });

    test("should show first 6 featured recipes on homepage", async ({
      page,
      resetData,
    }) => {
      await resetData("many-featured-recipes");
      await page.goto("/");

      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toBeVisible();
      const featuredSection = page
        .locator("h2", { hasText: "Featured Recipes" })
        .locator("xpath=ancestor::*[1]");
      for (let i = 15; i >= 10; i--) {
        await expect(
          featuredSection.getByText(`Recipe ${i}`, { exact: true }),
        ).toBeVisible();
      }
      await expect(
        featuredSection.getByText("Recipe 9", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not show View Feature link on homepage", async ({
      page,
      resetData,
    }) => {
      await resetData("one-featured-recipe");
      await page.goto("/");

      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toBeVisible();
      const featuredSection = page
        .locator("h2", { hasText: "Featured Recipes" })
        .locator("xpath=ancestor::*[1]");
      await expect(
        featuredSection.getByText("Featured Recipe", { exact: true }),
      ).toBeVisible();

      await expect(
        page.getByRole("link", { name: "View Feature", exact: true }),
      ).toHaveCount(0);
    });

    test("should not show note on homepage", async ({ page, resetData }) => {
      await resetData("one-featured-recipe");
      await page.goto("/");

      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toBeVisible();
      const featuredSection = page
        .locator("h2", { hasText: "Featured Recipes" })
        .locator("xpath=ancestor::*[1]");
      await expect(
        featuredSection.getByText("Featured Recipe", { exact: true }),
      ).toBeVisible();
      await expect(
        featuredSection.getByText("This recipe is featured for testing."),
      ).toHaveCount(0);
    });
  });

  test.describe("index page", () => {
    test("should show all featured recipes on index page", async ({
      page,
      resetData,
    }) => {
      await resetData("many-featured-recipes");
      await page.goto("/featured-recipes");

      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Recipe 15", { exact: true })).toBeVisible();
      await expect(page.getByText("Recipe 4", { exact: true })).toBeVisible();
    });

    test("should show note on index page", async ({ page, resetData }) => {
      await resetData("one-featured-recipe");
      await page.goto("/featured-recipes");

      await expect(
        page.getByText("This recipe is featured for testing."),
      ).toBeVisible();
    });

    test("should show View Feature link on featured recipes index page", async ({
      page,
      resetData,
    }) => {
      await resetData("one-featured-recipe");
      await page.goto("/featured-recipes");

      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toBeVisible();

      await expect(
        page.getByRole("link", { name: "View Feature", exact: true }),
      ).toBeVisible();

      await page
        .getByRole("link", { name: "View Feature", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Featured Recipe" }),
      ).toBeVisible();
    });
  });

  test.describe("creation", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-recipe");
      await page.goto("/recipe/existing-recipe");
      await signIn(page);
    });

    test("should allow recipes to be featured multiple times", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await fillMarkdownField(page, "note", "First feature");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page.getByRole("listitem")).toHaveCount(2);

      await page.goto("/recipe/existing-recipe");
      await expect(
        page.getByRole("heading", { name: "Existing Recipe" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await fillMarkdownField(page, "note", "Second feature");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page.getByRole("listitem")).toHaveCount(3);

      await page.goto("/featured-recipes");
      await expect(
        page.getByText("Existing Recipe", { exact: true }),
      ).toHaveCount(2);
      await expect(page.getByText("First feature")).toBeVisible();
      await expect(page.getByText("Second feature")).toBeVisible();
    });

    test("should sort featured recipes by feature date", async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes");

      await page.goto("/recipe/third-recipe");
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.waitForTimeout(1100);

      await page.goto("/recipe/first-recipe");
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.waitForTimeout(1100);

      await page.goto("/recipe/second-recipe");
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);

      await page.goto("/featured-recipes");
      const featuredItems = page.getByRole("listitem");
      await expect(
        featuredItems.nth(0).getByText(/Second Recipe/),
      ).toBeVisible();
      await expect(
        featuredItems.nth(1).getByText(/First Recipe/),
      ).toBeVisible();
      await expect(
        featuredItems.nth(2).getByText(/Third Recipe/),
      ).toBeVisible();
    });
  });

  test.describe("deletion", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-featured-recipe");
      await page.goto("/featured-recipes");
      await page
        .getByRole("link", { name: "View Feature", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Featured Recipe" }),
      ).toBeVisible();
      await signIn(page);
    });

    test("should be able to delete a featured recipe", async ({
      page,
      baseURL,
      request,
    }) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Featured Recipe" }),
      ).toBeVisible();

      const featuredRecipeUrl = new URL(page.url()).pathname;

      await deleteWithConfirm(page, "feature");

      await expect(page).toHaveURL(baseURL + "/");
      await expect(
        page.getByText("Featured Recipes", { exact: true }),
      ).toHaveCount(0);

      const response = await request.get(featuredRecipeUrl);
      expect(response.status()).toBe(404);
    });
  });

  test.describe("Feature button", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-recipe");
      await page.goto("/recipe/existing-recipe");
      await signIn(page);
    });

    test("should have a Feature button on recipe pages", async ({ page }) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Existing Recipe" }),
      ).toBeVisible();

      await expect(
        page.getByRole("link", { name: "Feature", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Edit", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Copy", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Delete", exact: true }),
      ).toBeVisible();
    });

    test("should navigate to featured recipe form with recipe pre-selected when clicking Feature button", async ({
      page,
      baseURL,
    }) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Existing Recipe" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Feature", exact: true }).click();

      await expect(page).toHaveURL(
        /\/featured-recipe\/new\?.*recipe=existing-recipe/,
      );

      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/");
      await expect(
        page
          .locator("h2", { hasText: "Featured Recipes" })
          .locator("xpath=ancestor::*[1]")
          .getByText("Existing Recipe", { exact: true }),
      ).toBeVisible();
    });

    test("should allow adding a note when featuring from Feature button", async ({
      page,
      baseURL,
    }) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Existing Recipe" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Feature", exact: true }).click();

      await fillMarkdownField(
        page,
        "note",
        "This recipe was featured from the Feature button",
      );
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/");
      await page.goto("/featured-recipes");
      await expect(
        page.getByText("This recipe was featured from the Feature button"),
      ).toBeVisible();
    });
  });

  test.describe("new page", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-recipe");
      await page.goto("/featured-recipe/new?recipe=existing-recipe");
    });

    test("should require authentication", async ({ page }) => {
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
      });

      test("should be able to create a featured recipe", async ({
        page,
        baseURL,
      }) => {
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page).toHaveURL(baseURL + "/");
        await expect(
          page
            .locator("h2", { hasText: "Featured Recipes" })
            .locator("xpath=ancestor::*[1]")
            .getByText("Existing Recipe", { exact: true }),
        ).toBeVisible();
      });

      test("should allow adding a note when creating a featured recipe", async ({
        page,
        baseURL,
      }) => {
        await fillMarkdownField(
          page,
          "note",
          "This is a test note for the feature",
        );
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page).toHaveURL(baseURL + "/");
        await page.goto("/featured-recipes");
        await expect(
          page.getByText("This is a test note for the feature"),
        ).toBeVisible();
      });
    });
  });

  test.describe("edit page", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-featured-recipe");
      await page.goto("/featured-recipes");
      await page
        .getByRole("link", { name: "View Feature", exact: true })
        .click();
      await page.getByRole("link", { name: "Edit", exact: true }).click();
    });

    test("should require authentication", async ({ page }) => {
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
        // The featured-recipe edit form's "note" is a Lexical field; gate on it
        // hydrating so the first Slug/note interaction isn't dropped/reset.
        await markdownEditorReady(page, "note");
      });

      test("should be able to edit a featured recipe note", async ({
        page,
        baseURL,
      }) => {
        await fillMarkdownField(page, "note", "This message is edited!");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page).toHaveURL(baseURL + "/");

        await page.goto("/featured-recipes");
        await expect(page.getByText("This message is edited!")).toBeVisible();
      });

      test("should be able to change a featured recipe slug", async ({
        page,
        baseURL,
        request,
      }) => {
        const featuredRecipeUrl = new URL(page.url()).pathname.replace(
          /\/edit$/,
          "",
        );

        await expect(page.getByLabel("Slug")).toBeVisible();
        await page.getByLabel("Slug").clear();
        const newSlug = "custom-featured-slug";
        await page.getByLabel("Slug").fill(newSlug);
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page).toHaveURL(baseURL + "/");

        await page.goto("/featured-recipes");
        await page
          .getByRole("link", { name: "View Feature", exact: true })
          .click();
        await expect(page).toHaveURL(baseURL + `/featured-recipe/${newSlug}`);

        const response = await request.get(featuredRecipeUrl);
        expect(response.status()).toBe(404);
      });
    });
  });

  test.describe("recipe selection modal", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("three-recipes");
      await page.goto("/featured-recipe/new");
      await fillSignInForm(page);
      // Select-Recipe button + note editor share one client island; gate on the
      // note editor hydrating so the Select Recipe click isn't swallowed.
      await markdownEditorReady(page, "note");
    });

    test("should open recipe selection modal when clicking select button", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();

      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByLabel("Search recipes")).toBeVisible();
    });

    test("should search for recipes in modal", async ({ page }) => {
      await expect(page.getByText("New Featured Recipe")).toBeVisible();
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();

      const dialog = page.getByRole("dialog");
      await searchFor(page, "First Recipe", dialog);

      // `suggest` keeps partial matches, so "First Recipe" also surfaces the
      // other "… Recipe" entries — ranked below. What matters is that the exact
      // match sorts to the top, not that the others are excluded.
      await expect(
        dialog.getByRole("button", { name: /First Recipe/ }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("First Recipe");
    });

    test("should select recipe from modal and close", async ({ page }) => {
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();

      await expect(page.getByRole("dialog")).toBeAttached();
      const dialog = page.getByRole("dialog");
      await searchFor(page, "Second Recipe", dialog);
      // Top-ranked hit — `suggest` leaves the weaker "… Recipe" matches below it.
      await expect(
        dialog.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Second Recipe");
      await dialog.getByRole("listitem").first().getByRole("button").click();

      await expect(page.getByRole("dialog")).toHaveCount(0);

      await expect(page.getByText("Selected: Second Recipe")).toBeVisible();
    });

    test("should create featured recipe with modal-selected recipe", async ({
      page,
      baseURL,
    }) => {
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await searchFor(page, "First Recipe", dialog);
      await expect(
        dialog.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("First Recipe");
      await dialog.getByRole("listitem").first().getByRole("button").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await fillMarkdownField(page, "note", "Featured via modal selection");
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page).toHaveURL(baseURL + "/");
      await expect(
        page
          .locator("h2", { hasText: "Featured Recipes" })
          .locator("xpath=ancestor::*[1]")
          .getByText(/First Recipe/),
      ).toBeVisible();
    });

    test("should close modal on overlay click", async ({ page }) => {
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("should clear selected recipe", async ({ page }) => {
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await searchFor(page, "Third Recipe", dialog);
      await expect(
        dialog.getByRole("listitem").first().getByRole("heading"),
      ).toHaveText("Third Recipe");
      await dialog.getByRole("listitem").first().getByRole("button").click();
      await expect(page.getByText("Selected: Third Recipe")).toBeVisible();

      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(page.getByText("Selected: Third Recipe")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Select Recipe", exact: true }),
      ).toBeVisible();
    });

    test("should show the latest recipes in the modal by default", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: "Select Recipe", exact: true })
        .click();

      // With no query the modal browses the corpus latest-first, so all three
      // fixture recipes are listed. toHaveCount auto-retries, waiting out the
      // async allRecipes load.
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("listitem")).toHaveCount(3);
      await expect(
        dialog.getByRole("button", { name: /First Recipe/ }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: /Second Recipe/ }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: /Third Recipe/ }),
      ).toBeVisible();
    });
  });

  /*
   * The featured index reads through a pagination keyspace (D2b), so it has
   * the same page identity the recipe index gained in P3 — and none of the
   * offset semantics these tests used to assert. `aria-current="page"`, "Go to
   * next page" and `/featured-recipes/1` redirecting to the landing are all
   * gone; a URL number is now the *stable* page id plus one, so
   * `/featured-recipes/1` is the oldest page and 404s when there is no such
   * page rather than redirecting.
   *
   * `many-featured-recipes-paged` is 40 features of `many-recipes`' 40
   * recipes, "feature-01" … "feature-40", dated one per day from 2024-03-01.
   * At `FEATURED_RECIPES_PER_PAGE` = 12 that lays out as:
   *
   *   page 0: feature-01..12   page 1: feature-13..24
   *   page 2: feature-25..36   page 3: feature-37..40  ← head, partial
   *
   * so `headPage` is 3, the landing folds pages 3 and 2 into sixteen cards,
   * and the numbered routes are exactly `/featured-recipes/1` and `/2`.
   *
   * The 15-item `many-featured-recipes` is left alone: four other specs read
   * it, and at 15 items its landing fold covers the whole corpus, so it has no
   * numbered pages to test.
   */
  test.describe("pagination", () => {
    /** "feature-40", "feature-39", … — newest first, the display order. */
    function descendingFeatures(from: number, to: number): string[] {
      const slugs: string[] = [];
      for (let i = from; i >= to; i--)
        slugs.push(`feature-${String(i).padStart(2, "0")}`);
      return slugs;
    }

    function list(page: Page) {
      return page.locator('[data-testid="recipe-list"]');
    }

    /**
     * By the "View Feature" href rather than the card href: the card links to
     * the *recipe*, and it is the feature's own identity that the page ids are
     * anchored to.
     */
    async function featureSlugs(page: Page): Promise<string[]> {
      const hrefs = await list(page)
        .locator('a[href^="/featured-recipe/"]')
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
      return hrefs.map((href) => href.replace("/featured-recipe/", ""));
    }

    async function listHtml(page: Page): Promise<string> {
      await expect(list(page)).toBeVisible();
      return list(page).innerHTML();
    }

    test.describe("Layout", () => {
      test.beforeEach(async ({ resetData }) => {
        await resetData("many-featured-recipes-paged");
      });

      test("landing folds the head with the page below it", async ({
        page,
      }) => {
        await page.goto("/featured-recipes");
        await expect(
          page.getByText("Featured Recipes", { exact: true }),
        ).toBeVisible();
        expect(await featureSlugs(page)).toEqual(descendingFeatures(40, 25));
      });

      test("numbered pages hold exactly perPage features, newest first", async ({
        page,
      }) => {
        await page.goto("/featured-recipes/2");
        expect(await featureSlugs(page)).toEqual(descendingFeatures(24, 13));

        await page.goto("/featured-recipes/1");
        expect(await featureSlugs(page)).toEqual(descendingFeatures(12, 1));
      });

      test("the landing and the numbered routes cover the corpus exactly once", async ({
        page,
      }) => {
        const seen: string[] = [];
        for (const path of [
          "/featured-recipes",
          "/featured-recipes/2",
          "/featured-recipes/1",
        ]) {
          await page.goto(path);
          seen.push(...(await featureSlugs(page)));
        }
        expect(seen).toHaveLength(40);
        expect(new Set(seen).size).toBe(40);
      });

      test("does not serve the head, the folded page, or a page zero", async ({
        request,
      }) => {
        // headPage is 3 and page 2 is folded into the landing, so the numbered
        // routes stop at `/featured-recipes/2`. There is no page 0 under
        // 1-based URLs.
        expect((await request.get("/featured-recipes/3")).status()).toBe(404);
        expect((await request.get("/featured-recipes/4")).status()).toBe(404);
        expect((await request.get("/featured-recipes/0")).status()).toBe(404);
        expect((await request.get("/featured-recipes/99")).status()).toBe(404);
        expect((await request.get("/featured-recipes/nonsense")).status()).toBe(
          404,
        );
      });

      /*
       * Where this used to redirect to the landing. A corpus that fits inside
       * the fold has no numbered pages at all, so page 1 is not an alias for
       * anything — it does not exist.
       */
      test("404s a numbered page a small corpus does not have", async ({
        request,
        resetData,
      }) => {
        await resetData("one-featured-recipe");
        expect((await request.get("/featured-recipes/1")).status()).toBe(404);
      });
    });

    test.describe("Navigation", () => {
      test.beforeEach(async ({ resetData }) => {
        await resetData("many-featured-recipes-paged");
      });

      test("walks from the landing down to the oldest page and back", async ({
        page,
        baseURL,
      }) => {
        await page.goto("/featured-recipes");
        // The landing is the newest surface, so it offers no way further up.
        await expect(page.getByRole("link", { name: "Newer" })).toHaveCount(0);

        await page.getByRole("link", { name: "Older" }).click();
        await expect(page).toHaveURL(baseURL + "/featured-recipes/2");

        await page.getByRole("link", { name: "Older" }).click();
        await expect(page).toHaveURL(baseURL + "/featured-recipes/1");
        await expect(page.getByRole("link", { name: "Older" })).toHaveCount(0);

        await page.getByRole("link", { name: "Newer" }).click();
        await expect(page).toHaveURL(baseURL + "/featured-recipes/2");

        // A null `newerPage` on the newest numbered page means the landing.
        await page.getByRole("link", { name: "Newer" }).click();
        await expect(page).toHaveURL(baseURL + "/featured-recipes");
      });

      test("numbers a page by its stable id, and never the landing", async ({
        page,
      }) => {
        await page.goto("/featured-recipes/1");
        await expect(page.getByTestId("pagination-page-number")).toHaveText(
          "1",
        );
        await page.goto("/featured-recipes/2");
        await expect(page.getByTestId("pagination-page-number")).toHaveText(
          "2",
        );

        /*
         * The landing sits on the head, whose id moves every time the head
         * seals, so it is the one surface with no number — just the Home link.
         */
        await page.goto("/featured-recipes");
        await expect(page.getByTestId("pagination-page-number")).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Go to home" }),
        ).toBeVisible();
      });

      test("shows the Home link on the landing of a single-page corpus", async ({
        page,
        resetData,
      }) => {
        await resetData("one-featured-recipe");
        await page.goto("/featured-recipes");

        await expect(
          page.getByRole("link", { name: "Go to home" }),
        ).toBeVisible();
        await expect(page.getByRole("link", { name: "Newer" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Older" })).toHaveCount(0);
      });
    });

    test.describe("The thesis: featuring a recipe dirties only the head", () => {
      test("leaves every sealed page byte-identical", async ({
        page,
        resetData,
      }) => {
        await resetData("many-featured-recipes-paged");

        await page.goto("/featured-recipes/1");
        const oldestBefore = await listHtml(page);
        await page.goto("/featured-recipes/2");
        const middleBefore = await listHtml(page);

        // A 41st feature, of a recipe already in the corpus, dated after every
        // existing one so it lands on the head.
        //
        // `signIn` rather than `fillSignInForm`: a recipe detail page is
        // public, so it renders the footer's Sign In button, not the form.
        await page.goto("/recipe/recipe-01");
        await signIn(page);
        await page.getByRole("link", { name: "Feature", exact: true }).click();
        await page.getByLabel("Slug").clear();
        await page.getByLabel("Slug").fill("feature-41");
        await page.getByLabel("Date (UTC)").fill("2024-04-10T12:00");
        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });

        /*
         * This is the whole point of anchoring page ids at the oldest end.
         * Under the offset scheme every one of these pages shifted by one
         * card.
         */
        await page.goto("/featured-recipes/1");
        expect(await listHtml(page)).toBe(oldestBefore);
        await page.goto("/featured-recipes/2");
        expect(await listHtml(page)).toBe(middleBefore);

        // The landing is the one surface that did change.
        await page.goto("/featured-recipes");
        expect(await featureSlugs(page)).toEqual([
          "feature-41",
          ...descendingFeatures(40, 25),
        ]);
      });
    });
  });

  /*
   * A featured recipe's index value borrows `name` and `image` from the recipe
   * it points at (§6.1), so a card renders from one index read and a retitle
   * reaches every card that shows it.
   *
   * Nothing above this describe changed: the cards render the same markup from
   * the same props. What changed is where the props come from, and these are
   * the four properties that only hold now — the two halves the absence of a
   * `references` declaration was breaking, plus the covering property that
   * proves the per-card `recipe.json` read is gone.
   */
  test.describe("borrowed fields", () => {
    /*
     * Featured on the homepage strip (which shows the newest six, 15 down to
     * 10) *and* on the first page of /featured-recipes — so one retitle can be
     * checked on both surfaces.
     */
    const FEATURED_ON_BOTH = "recipe-12";
    const RETITLED = "Retitled Twelve";

    function featuredSection(page: Page) {
      return page
        .locator("h2", { hasText: "Featured Recipes" })
        .locator("xpath=ancestor::*[1]");
    }

    async function retitle(page: Page, slug: string, name: string) {
      await page.goto(`/recipe/${slug}/edit`);
      await fillSignInForm(page);
      // Gate on the form island hydrating before touching a field, as
      // edit.spec.ts does — an early fill is dropped mid-hydration.
      await markdownEditorReady(page, "description");

      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(name);
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      // The redirect, awaited before anything navigates away. Widening the
      // write path is what tipped the demo's git spec over in D1.
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    }

    test("retitling a recipe updates every featured card that shows it", async ({
      page,
      baseURL,
      resetData,
      readFeaturedRecipeIndexDigest,
    }) => {
      await resetData("many-featured-recipes");
      const before = await readFeaturedRecipeIndexDigest();

      await retitle(page, FEATURED_ON_BOTH, RETITLED);
      // No rename: the slug is untouched, which is exactly the write that used
      // to reach the featured-recipes index not at all.
      await expect(page).toHaveURL(baseURL + `/recipe/${FEATURED_ON_BOTH}`);

      expect(await readFeaturedRecipeIndexDigest()).not.toBe(before);

      await page.goto("/featured-recipes");
      await expect(page.getByText(RETITLED, { exact: true })).toBeVisible();
      await expect(page.getByText("Recipe 12", { exact: true })).toHaveCount(0);

      await page.goto("/");
      await expect(
        featuredSection(page).getByText(RETITLED, { exact: true }),
      ).toBeVisible();
      await expect(
        featuredSection(page).getByText("Recipe 12", { exact: true }),
      ).toHaveCount(0);
    });

    test("retitling a recipe updates the feature's own page", async ({
      page,
      resetData,
    }) => {
      await resetData("many-featured-recipes");

      await retitle(page, FEATURED_ON_BOTH, RETITLED);

      /*
       * The `dependentItemBasePaths` seat. This page renders the recipe's name
       * through its own `getRecipeBySlug`, so the borrowed values on the index
       * do not cover it — the write path has to name the URL its dependents
       * are served at.
       *
       * Reached by clicking through rather than by building the URL: the
       * feature's slug is a capture timestamp in the fixture, and the card's
       * own link is the thing that knows it.
       */
      await page.goto("/featured-recipes");
      await page
        .getByRole("listitem")
        .filter({ hasText: RETITLED })
        .getByRole("link", { name: "View Feature", exact: true })
        .click();

      await expect(page).toHaveURL(/\/featured-recipe\//);
      await expect(
        page.getByRole("heading", { level: 1, name: RETITLED }),
      ).toBeVisible();
    });

    test("editing a field nobody borrows leaves the featured index untouched", async ({
      page,
      resetData,
      readFeaturedRecipeIndexDigest,
    }) => {
      await resetData("one-featured-recipe");
      const before = await readFeaturedRecipeIndexDigest();
      expect(before).not.toBe("");

      await page.goto("/recipe/featured-recipe/edit");
      await fillSignInForm(page);
      await markdownEditorReady(page, "description");
      await fillMarkdownField(
        page,
        "description",
        "A description no featured recipe borrows.",
      );
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Featured Recipe" }),
      ).toBeVisible();

      /*
       * Asserted on the index rather than on markup, which would not have
       * moved either way. `description` is not in the `references`
       * declaration, so the gate never opens and this environment is never
       * even opened — LMDB advances its meta page on any commit, so an
       * identical digest means no write happened, not that one wrote the same
       * bytes back.
       */
      expect(await readFeaturedRecipeIndexDigest()).toBe(before);
    });

    test("a featured card survives its recipe becoming unreadable", async ({
      page,
      baseURL,
      resetData,
      makeRecipeUnreadable,
    }) => {
      // `linked-recipes` for its uploads: the borrowed `image` is only worth
      // asserting where an image file actually exists to render.
      await resetData("linked-recipes");

      await page.goto("/recipe/kefir");
      await page.getByRole("link", { name: "Feature", exact: true }).click();
      await fillSignInForm(page);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      /*
       * Awaited on rendered content, not on the URL alone — a bare `toHaveURL`
       * samples mid-navigation and sees `""`.
       *
       * The long timeout is the same allowance `markdownEditorReady` makes:
       * this is the suite's first hit on `/` for this fixture, so a dev server
       * compiles the route inside the wait, and the default 5s lost twice
       * against the container before passing on the second retry. Featuring a
       * recipe also scans for dependents now, which does not help.
       */
      await expect(
        page.locator("h2", { hasText: "Featured Recipes" }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(baseURL + "/");

      await makeRecipeUnreadable("kefir");

      /*
       * The covering property, and the direct proof the N+1 is gone: the card
       * renders a name and an image out of the featured index alone. The old
       * enrichment pass would have thrown here and been swallowed by its
       * `catch`, degrading to an unnamed, imageless card.
       */
      await page.goto("/featured-recipes");
      const card = page.getByRole("listitem").filter({ hasText: "Kefir" });
      await expect(card.getByText("Kefir", { exact: true })).toBeVisible();
      await expect(
        card.getByRole("img", { name: "Recipe thumbnail" }),
      ).toBeVisible();
    });
  });
});

/**
 * A featured entry that points at a **group** (22g).
 *
 * `three-recipes-groups` carries one in the fixture — `featured-weeknight`,
 * pinning the `weeknight-favourites` collection — because the strip is where
 * this phase's whole point lands and a fixture is the only way to assert it
 * without featuring something first in every test.
 *
 * The heading over the mixed strip is still "Featured Recipes". That was
 * decided with the user: the strip is the place things are featured, and
 * renaming it would make a page that mostly shows recipes read as though the
 * section had changed subject.
 */
test.describe("Featured groups", () => {
  const featuredSection = (page: Page) =>
    page
      .locator("h2", { hasText: "Featured Recipes" })
      .locator("xpath=ancestor::*[1]");

  test("shows the featured group in the homepage strip", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/");

    const card = featuredSection(page).getByTestId("featured-group-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByText("Weeknight Favourites")).toBeVisible();
    await expect(card.getByText("Collection")).toBeVisible();

    // The card is a way *into* the group, not into the feature — the feature's
    // own page is reached from `/featured-recipes`, which is where the "View
    // Feature" line lives.
    await expect(card.getByRole("link").first()).toHaveAttribute(
      "href",
      "/group/weeknight-favourites",
    );

    /*
     * No bookmark button. Bookmarks are a per-recipe store keyed by slug, and a
     * group is not a recipe — a bookmark control here would write a row nothing
     * could ever render.
     */
    await expect(card.getByRole("button", { name: /bookmark/i })).toHaveCount(
      0,
    );

    // Neither fixture recipe in the collection has a photo, so the card falls
    // all the way through to the placeholder.
    await expect(card.getByTestId("group-thumbnail-placeholder")).toBeVisible();
  });

  test("shows it on the index page with its View Feature link and note", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/featured-recipes");

    const card = page.getByTestId("featured-group-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByText("Weeknight Favourites")).toBeVisible();
    await expect(
      card.getByText("A featured collection for testing."),
    ).toBeVisible();

    await card.getByRole("link", { name: "View Feature", exact: true }).click();
    await expect(page).toHaveURL(/\/featured-recipe\/featured-weeknight$/);
  });

  test("the feature's own page shows the group and its members", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/featured-recipe/featured-weeknight");

    await expect(
      page.getByRole("heading", { name: "Weeknight Favourites" }),
    ).toBeVisible();
    await expect(page.getByTestId("group-kind")).toHaveText("Collection");

    // The members, as the same cards the group page uses.
    const items = page.getByTestId("group-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("First Recipe");
    await expect(items.nth(1)).toContainText("Third Recipe");

    // Everything this page deliberately leaves out is one click away.
    await page.getByRole("link", { name: "Open group", exact: true }).click();
    await expect(page).toHaveURL(/\/group\/weeknight-favourites$/);
  });

  test("features a group from the group page's Feature button", async ({
    page,
    baseURL,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/group/week-of-may-4");
    await signIn(page);

    await page.getByRole("link", { name: "Feature", exact: true }).click();
    await expect(page).toHaveURL(/\/featured-recipe\/new\?group=week-of-may-4/);

    // The toggle opens on Group, and the picker is already on this group —
    // the slug rode along in the query string.
    await expect(
      page.getByTestId("featured-target").locator('[data-state="on"]'),
    ).toHaveText("Group");
    await expect(page.getByLabel("Group", { exact: true })).toHaveValue(
      "week-of-may-4",
    );

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(baseURL + "/");
    await expect(
      featuredSection(page).getByText("Week of May 4"),
    ).toBeVisible();
  });

  test("toggling back to Recipe features a recipe from the same form", async ({
    page,
    baseURL,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/featured-recipe/new?group=week-of-may-4");
    await fillSignInForm(page);
    await markdownEditorReady(page, "note");

    await page
      .getByTestId("featured-target")
      .getByText("Recipe", { exact: true })
      .click();

    /*
     * The inactive input is *unmounted*, not hidden. The parser requires
     * exactly one of `recipe`/`group`, so a group field left in the DOM would
     * be submitting a slug the reader has just navigated away from.
     */
    await expect(page.getByLabel("Group", { exact: true })).toHaveCount(0);

    await page
      .getByRole("button", { name: "Select Recipe", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await searchFor(page, "Second Recipe", dialog);
    await expect(
      dialog.getByRole("listitem").first().getByRole("heading"),
    ).toHaveText("Second Recipe");
    await dialog.getByRole("listitem").first().getByRole("button").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(baseURL + "/");
    await expect(
      featuredSection(page).getByText("Second Recipe", { exact: true }),
    ).toBeVisible();
    // The group it *started* on was not featured as a side effect.
    await expect(featuredSection(page).getByText("Week of May 4")).toHaveCount(
      0,
    );
  });

  test("the edit form opens on Group with the group still selected", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/featured-recipe/featured-weeknight/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "note");

    await expect(
      page.getByTestId("featured-target").locator('[data-state="on"]'),
    ).toHaveText("Group");
    await expect(page.getByLabel("Group", { exact: true })).toHaveValue(
      "weeknight-favourites",
    );
  });

  test("retitling the group retitles the featured card", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/group/weeknight-favourites/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");

    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill("Renamed Collection");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    /*
     * The *redirect*, not a heading: the edit page's own title satisfies a
     * substring name match, so gating on the heading returns while the write is
     * still in flight and the next `goto` aborts it — the trap
     * `recipe-item-records.spec.ts` documents.
     */
    await page.waitForURL(
      (url) => url.pathname === "/group/weeknight-favourites",
    );
    await expect(
      page.getByRole("heading", { name: "Renamed Collection" }),
    ).toBeVisible();

    /*
     * The borrowed value moving, end to end: `name` is in the featured config's
     * `references` declaration, so this write opened the dependent gate,
     * rebuilt the feature's index value and dirtied the page it is projected
     * onto. Nothing rewrote the feature.
     */
    await page.goto("/featured-recipes");
    await expect(
      page.getByTestId("featured-group-card").getByText("Renamed Collection"),
    ).toBeVisible();
    await expect(page.getByText("Weeknight Favourites")).toHaveCount(0);
  });

  test("deleting the group leaves a 'Group not found' card", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/group/weeknight-favourites");
    await signIn(page);
    await deleteWithConfirm(page, "group");
    await expect(page).toHaveURL(/\/groups$/);

    /*
     * A delete clears the borrowed values and leaves the reference, which is
     * what lets the card say *which* group has gone. A card that vanished
     * instead would make deleting a group look like it had taken the feature
     * with it — and the feature is still there, on disk, for a curator to
     * remove or repoint.
     */
    await page.goto("/featured-recipes");
    await expect(
      page.getByTestId("featured-group-card").getByText("Group not found"),
    ).toBeVisible();
  });
});
