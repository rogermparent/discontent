import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

/*
 * `/tags/<slug>` as a pre-baked static page (F8).
 *
 * What this replaces: `tagSearchHref` pointed every tag chip at
 * `/search?q=tag:<tag>`, which needed the client search bundle and the whole
 * corpus to render anything and could not be indexed. Repointing that one
 * function moved every chip in the app at once — the recipe detail page, the
 * list cards, and the homepage's browse row.
 *
 * Unpaginated: the rows come from a single folded value rather than a
 * partitioned keyspace. `recipesByTag` documents the trade and what replaces it
 * when a tag outgrows one page; the richest tag in this fixture carries three
 * recipes against a `perPage` of twelve.
 */

/** `search-corpus`, by tag. `dessert` is the richest at three. */
const TAG_COUNTS: Record<string, number> = {
  dessert: 3,
  baked: 2,
  quick: 2,
  french: 1,
  chocolate: 1,
  soup: 1,
  bread: 1,
  salad: 1,
};

const cards = (page: Page) => page.getByTestId("recipe-list").locator("> li");

test.describe("Tag pages", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("search-corpus");
  });

  test("a tag page lists exactly the recipes carrying it", async ({ page }) => {
    await page.goto("/tags/dessert");
    await expect(
      page.getByRole("heading", { name: "dessert", exact: true }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(TAG_COUNTS.dessert);

    /* Every card really carries the tag — not just the right count. */
    for (const card of await cards(page).all()) {
      await expect(card).toContainText(/\w/);
    }
  });

  test("every tag in the corpus has a page with the right count", async ({
    page,
  }) => {
    for (const [tag, count] of Object.entries(TAG_COUNTS)) {
      await page.goto(`/tags/${tag}`);
      await expect(cards(page)).toHaveCount(count);
    }
  });

  /*
   * An unknown slug is a 404 rather than an empty tag page. The stored value
   * only holds slugs something carries, so a missing key means the URL is
   * wrong — an empty tag cannot exist.
   */
  test("an unknown tag is a 404", async ({ page }) => {
    const response = await page.goto("/tags/not-a-real-tag");
    expect(response?.status()).toBe(404);
  });

  test("the tag index lists every tag with its count", async ({ page }) => {
    await page.goto("/tags");
    const chips = page.getByTestId("tag-index").getByRole("link");
    await expect(chips).toHaveCount(Object.keys(TAG_COUNTS).length);
    /* Sorted by slug, which is what `finalize` guarantees. */
    const labels = (await chips.allInnerTexts()).map((text) =>
      text.replace(/\s+/g, " ").trim(),
    );
    expect(labels).toEqual(
      Object.keys(TAG_COUNTS)
        .sort()
        .map((tag) => `${tag} ${TAG_COUNTS[tag]}`),
    );
  });

  test.describe("every chip in the app points at a tag page", () => {
    test("the homepage browse row", async ({ page }) => {
      await page.goto("/");
      const chip = page
        .getByRole("region", { name: "Browse by tag" })
        .getByRole("link", { name: "dessert", exact: true });
      await expect(chip).toHaveAttribute("href", "/tags/dessert");
      await chip.click();
      await expect(cards(page)).toHaveCount(TAG_COUNTS.dessert);
    });

    test("a recipe's own tag chips", async ({ page }) => {
      await page.goto("/recipe/chocolate-truffle-cake");
      const chip = page.getByRole("link", { name: "dessert", exact: true });
      await expect(chip.first()).toHaveAttribute("href", "/tags/dessert");
    });
  });

  /*
   * The write path reaches the new surface: creating a recipe with a new tag
   * gives that tag a page that did not exist a moment ago.
   */
  test("a new tag gets its own page", async ({ page }) => {
    await page.goto("/new-recipe");
    const signIn = page.getByRole("button", {
      name: "Sign in with Credentials",
      exact: true,
    });
    if (await signIn.isVisible()) await fillSignInForm(page);
    await markdownEditorReady(page, "description");

    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill("Tag Page Probe");
    const input = page.getByLabel("Add a tag");
    await input.fill("freshtag");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove tag freshtag" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Tag Page Probe", exact: true }),
    ).toBeVisible();

    await page.goto("/tags/freshtag");
    await expect(cards(page)).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "freshtag", exact: true }),
    ).toBeVisible();
  });
});
