import { test, expect, type Page } from "../support/test";
import {
  fillMarkdownField,
  fillSignInForm,
  markdownEditorReady,
} from "../support/helpers";

/*
 * F19's payoff for recipes: the surfaces that render one recipe's **whole
 * record** at a URL that is not that recipe's.
 *
 * `description` is the field every assertion below edits, and it is chosen
 * rather than convenient: no index value carries it, no pagination projection
 * carries it, and no featured recipe borrows it. So a description edit dirties
 * no page and moves no aggregate — every other derived kind reports nothing —
 * and `revalidatePath("/recipe/" + slug)` reaches only `/recipe/<slug>`. If
 * these pages update, it is because `item:recipes:<slug>` reached them.
 *
 * Both routes involved declare `force-dynamic` today, so nothing here is
 * *stale* on the current deployment. What the cached read changes is that the
 * record now persists in the data cache across requests — `unstable_cache` is
 * not the route cache — which is precisely what makes these assertions able to
 * fail if the write path stops firing the tag.
 */

const DESCRIPTION = "Rewritten by the item-record spec.";

async function editDescription(
  page: Page,
  slug: string,
  description: string,
): Promise<void> {
  await page.goto(`/recipe/${slug}/edit`);
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
  await fillMarkdownField(page, "description", description);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  /*
   * Wait for the *redirect*, not just for a heading — the edit page has a
   * level-1 heading of its own, so gating on one returns while the URL is
   * still `/recipe/<slug>/edit` and the next `goto` aborts the write in
   * flight. The commit is the last thing a write does, so that leaves the
   * content on disk with no tag fired and reads exactly like a broken
   * invalidation.
   */
  await page.waitForURL((url) => url.pathname === `/recipe/${slug}`);
  await expect(page.getByText(description)).toBeVisible();
}

test.describe("item records — recipes", () => {
  test("the homepage hero shows a description edit, which no index projects", async ({
    page,
    resetData,
  }) => {
    await resetData("one-featured-recipe");

    /* Prime the cache, so a stale entry would have something to serve. */
    await page.goto("/");
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);

    await editDescription(page, "featured-recipe", DESCRIPTION);

    /*
     * The hero renders `getRecipeBySlug`'s whole record at `/`. This is the
     * case that blocked `paginationOnly`: an item-page dependency embedded in
     * a page whose URL is `/`.
     */
    await page.goto("/");
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
  });

  test("/featured-recipe/<slug> shows an edit to the recipe it references", async ({
    page,
    resetData,
  }) => {
    await resetData("one-featured-recipe");
    const featureSlug = "2026-01-06-16-19-07";

    await page.goto(`/featured-recipe/${featureSlug}`);
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);

    await editDescription(page, "featured-recipe", DESCRIPTION);

    /*
     * The sharpest case in F19, and the one that fixes the design. This URL is
     * a function of the *feature's* slug, not the recipe's, so no amount of
     * `dependentItemBasePaths` configuration derived from the recipe write
     * could name it — and `DependentWriteResult.updatedSlugs` stays empty here
     * because `description` is not a borrowed field, so the dependent path
     * cannot carry it either. Only a tag keyed by the item reaches this.
     */
    await page.goto(`/featured-recipe/${featureSlug}`);
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
  });

  test("a missing recipe is a 404 rather than a 500, now that the read returns null", async ({
    page,
    request,
    resetData,
  }) => {
    await resetData("one-recipe");

    const page404 = await page.goto("/recipe/does-not-exist");
    expect(page404?.status()).toBeGreaterThanOrEqual(400);

    /*
     * `api/recipe/[slug]` has always had an `if (!recipe)` 404 branch, but the
     * read threw ENOENT and the surrounding `catch` turned a missing recipe
     * into a 500. The branch is reachable for the first time.
     */
    const response = await request.get("/api/recipe/does-not-exist");
    expect(response.status()).toBe(404);
  });

  test("the API route still serves a recipe that exists", async ({
    request,
    resetData,
  }) => {
    await resetData("one-recipe");
    const response = await request.get("/api/recipe/existing-recipe");
    expect(response.status()).toBe(200);
    expect((await response.json()).name).toBeTruthy();
  });

  test("a fixture rollback drops cached records, via the type-wide catch-all", async ({
    page,
    resetData,
  }) => {
    await resetData("one-recipe");
    await page.goto("/recipe/existing-recipe");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    /*
     * A rollback is not a write and fires no tag of its own, and the cached
     * item entries are keyed by whatever slugs the suite happened to visit —
     * so there is no enumerable set to expire one by one. Without the
     * catch-all in `test-invalidate-cache`, this URL would go on serving the
     * previous fixture's recipe and the suite would become order-dependent.
     */
    await resetData("many-recipes");

    const response = await page.goto("/recipe/existing-recipe");
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });
});
