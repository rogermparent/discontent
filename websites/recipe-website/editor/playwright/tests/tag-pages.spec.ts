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

  /*
   * The 24b claim, end to end: one vocabulary, two carriers. The
   * `three-recipes-groups` fixture tags one recipe and one group `midweek`,
   * so the term's page lists both — and the tag index counts both.
   */
  test.describe("a tag page lists a group", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("three-recipes-groups");
    });

    test("shows the recipe and the group carrying the same tag", async ({
      page,
    }) => {
      await page.goto("/tags/midweek");
      await expect(
        page.getByRole("heading", { name: "midweek", exact: true }),
      ).toBeVisible();

      await expect(cards(page)).toHaveCount(1);
      await expect(cards(page).first()).toContainText("Third Recipe");

      await expect(
        page.getByRole("heading", { name: "Groups", exact: true }),
      ).toBeVisible();
      const groups = page.getByTestId("group-list").getByRole("listitem");
      await expect(groups).toHaveCount(1);
      await expect(groups.first()).toContainText("Weeknight Favourites");
    });

    test("counts both carriers on the tag index", async ({ page }) => {
      await page.goto("/tags");
      const chip = page
        .getByTestId("tag-index")
        .getByRole("link", { name: /midweek/ });
      await expect(chip).toHaveAttribute("href", "/tags/midweek");
      expect((await chip.innerText()).replace(/\s+/g, " ").trim()).toBe(
        "midweek 2",
      );
    });

    test("the group's own chip points at the tag page", async ({ page }) => {
      await page.goto("/group/weeknight-favourites");
      /*
       * Scoped to the group's own tag row, not the page: a member recipe on
       * this page carries the same term, and its card renders a chip of its
       * own through `RecipeCardTagHint`.
       */
      const chip = page
        .getByLabel("Tags")
        .getByRole("link", { name: "midweek", exact: true });
      await expect(chip).toHaveAttribute("href", "/tags/midweek");
    });
  });

  /*
   * The 24c claim, end to end: a term **record** on top of the folds.
   *
   * The `christmas-cookies` fixture carries three hand-written `term.json`s —
   * `dessert` (root), `cookies` (child of dessert, with a pinned front) and
   * `holiday` (a root with no carriers at all). `christmas` is deliberately
   * left record-less as the hybrid's control: it is a page either way.
   */
  test.describe("a term record decorates its page", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("christmas-cookies");
    });

    test("the record's label, description and breadcrumb beat the fold", async ({
      page,
    }) => {
      await page.goto("/tags/cookies");
      /* "Cookies", not the carriers' lowercase "cookies". */
      await expect(
        page.getByRole("heading", { name: "Cookies", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("term-description")).toContainText(
        "Small, sweet",
      );
      await expect(
        page.getByTestId("term-breadcrumb").getByRole("link"),
      ).toHaveText([/Dessert/]);
      await expect(
        page.getByTestId("term-breadcrumb").getByRole("link"),
      ).toHaveAttribute("href", "/tags/dessert");
    });

    test("the pinned recipes lead, in the record's order", async ({ page }) => {
      await page.goto("/tags/cookies");
      await expect(cards(page)).toHaveCount(8);
      /*
       * The record pins the three linzers in the *reverse* of date order, which
       * is what makes the reorder visible: newest-first would put
       * `linzer-cookies` first.
       */
      await expect(cards(page).nth(0)).toContainText("Apricot Linzer Cookies");
      await expect(cards(page).nth(1)).toContainText(
        "Chocolate Hazelnut Linzer Cookies",
      );
      await expect(cards(page).nth(2)).toContainText("Linzer Cookies");
      /* Then the rest, still newest first. */
      await expect(cards(page).nth(3)).toContainText("Gingerbread Cookies");
    });

    test("a parent lists its narrower terms with counts", async ({ page }) => {
      await page.goto("/tags/dessert");
      const child = page
        .getByTestId("term-children")
        .getByRole("link", { name: /Cookies/ });
      await expect(child).toHaveAttribute("href", "/tags/cookies");
      expect((await child.innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Cookies 8",
      );
    });

    test("a record with no carriers is a real page, not a 404", async ({
      page,
    }) => {
      const response = await page.goto("/tags/holiday");
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Holiday", exact: true }),
      ).toBeVisible();
      /* The empty state, under the record's own label. */
      await expect(
        page.getByText("No recipes are tagged Holiday."),
      ).toBeVisible();
    });

    test("the tag index lists a record-only term at zero", async ({ page }) => {
      await page.goto("/tags");
      const chip = page
        .getByTestId("tag-index")
        .getByRole("link", { name: /Holiday/ });
      await expect(chip).toHaveAttribute("href", "/tags/holiday");
      expect((await chip.innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Holiday 0",
      );
    });

    test("a tag with no record still renders from the fold", async ({
      page,
    }) => {
      /* The hybrid's control: `christmas` has carriers and no record. */
      await page.goto("/tags/christmas");
      await expect(
        page.getByRole("heading", { name: "christmas", exact: true }),
      ).toBeVisible();
      await expect(cards(page)).toHaveCount(4);
      await expect(page.getByTestId("term-breadcrumb")).toHaveCount(0);
      await expect(page.getByTestId("term-description")).toHaveCount(0);
    });
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
