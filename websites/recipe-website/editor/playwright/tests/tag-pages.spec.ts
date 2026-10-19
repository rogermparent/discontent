import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

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

  /*
   * No term records, so no shelves (43t): every tag is an "other tag",
   * listed open, most carried first, then by label.
   */
  test("the tag index lists every tag with its count", async ({ page }) => {
    await page.goto("/tags");
    const chips = page.getByTestId("tag-index").getByRole("link");
    await expect(chips).toHaveCount(Object.keys(TAG_COUNTS).length);
    const labels = (await chips.allInnerTexts()).map((text) =>
      text.replace(/\s+/g, " ").trim(),
    );
    expect(labels).toEqual(
      Object.keys(TAG_COUNTS)
        .sort((a, b) => TAG_COUNTS[b] - TAG_COUNTS[a] || a.localeCompare(b))
        .map((tag) => `${tag} ${TAG_COUNTS[tag]}`),
    );
    await expect(page.getByTestId("tag-shelf")).toHaveCount(0);
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
        page.getByRole("heading", { name: "Plans", exact: true }),
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

    /* A root with narrower terms is a root page (43t): one section each. */
    test("a parent lists its narrower terms with counts", async ({ page }) => {
      await page.goto("/tags/dessert");
      const section = page.getByTestId("root-section");
      await expect(section).toHaveCount(1);
      const child = section
        .getByRole("heading", { level: 2 })
        .getByRole("link");
      await expect(child).toHaveAttribute("href", "/tags/cookies");
      expect((await child.innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Cookies 8",
      );
      await expect(page.getByTestId("term-count")).toHaveText(
        "8 recipes · 1 narrower term",
      );
    });

    /*
     * 43t: `dessert` is a recorded root that is no facet, so the board files
     * it under Collections, Cookies nested under it; each recipe counts once.
     */
    test("/tags files a root record under Collections with nested rows (43t)", async ({
      page,
    }) => {
      await page.goto("/tags");
      const collections = page.locator(
        "[data-testid='tag-column'][data-group='collections']",
      );
      await expect(collections).toHaveCount(1);
      const rows = collections.getByTestId("tag-row");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toHaveAttribute("href", "/tags/dessert");
      expect((await rows.nth(0).innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Dessert 8",
      );
      await expect(rows.nth(1)).toHaveAttribute("href", "/tags/cookies");
      expect((await rows.nth(1).innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Cookies 8",
      );
      /* A record nothing carries narrows nothing: not on the board. */
      await expect(
        page.getByTestId("tag-board").locator("a[href='/tags/holiday']"),
      ).toHaveCount(0);
    });

    test("tag:dessert finds a recipe that carries only a narrower term (31b)", async ({
      page,
      request,
      createApiToken,
    }) => {
      const token = await createApiToken();
      const created = await request.post("/api/recipes", {
        headers: { authorization: `Bearer ${token}` },
        data: { name: "Linzer Bars", tags: ["cookies"] },
      });
      expect(created.status()).toBe(201);

      await page.goto("/search?q=tag%3Adessert");
      await expect(
        page.getByTestId("recipe-list").getByText("Linzer Bars"),
      ).toBeVisible({ timeout: 20_000 });
      await expect(cards(page)).toHaveCount(9);
    });

    test("tag:<alias> finds the term's recipes and /tags/<alias> redirects (32i)", async ({
      page,
      request,
      createApiToken,
    }) => {
      const token = await createApiToken();
      const patched = await request.patch("/api/taxonomies/tag/cookies", {
        headers: { authorization: `Bearer ${token}` },
        data: { aliases: ["Biscuits"] },
      });
      expect(patched.status()).toBe(200);

      await page.goto("/search?q=tag%3Abiscuits");
      await expect(cards(page)).toHaveCount(8, { timeout: 20_000 });

      await page.goto("/tags/biscuits");
      await page.waitForURL((url) => url.pathname === "/tags/cookies");
      await expect(
        page.getByRole("heading", { name: "Cookies", exact: true }),
      ).toBeVisible();
      /* A slug that is neither a term nor an alias is still a 404. */
      const missing = await page.goto("/tags/not-an-alias");
      expect(missing?.status()).toBe(404);
    });

    /*
     * 34a (D1): a facet root carries nothing itself — recipes carry its
     * children — so its page lists its narrower terms' recipes, as
     * `tag:course` does, rather than "No recipes are tagged Course.".
     */
    test("a root with no carriers of its own lists its subtree (34a)", async ({
      page,
      request,
      createApiToken,
    }) => {
      const token = await createApiToken();
      const headers = { authorization: `Bearer ${token}` };
      const created = await request.post("/api/taxonomies/tag", {
        headers,
        data: { label: "Course" },
      });
      expect(created.status()).toBe(201);
      const moved = await request.patch("/api/taxonomies/tag/dessert", {
        headers,
        data: { parent: "course" },
      });
      expect(moved.status()).toBe(200);

      const response = await page.goto("/tags/course");
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Course", exact: true }),
      ).toBeVisible();
      await expect(cards(page)).toHaveCount(8);
      await expect(page.getByTestId("term-count")).toHaveText(
        "8 recipes · 1 narrower term",
      );
      await expect(page.getByText("No recipes are tagged")).toHaveCount(0);
      /* The child's count is its subtree's — what its own page lists. */
      const child = page
        .getByTestId("root-section")
        .getByRole("heading", { level: 2 })
        .getByRole("link");
      expect((await child.innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Dessert 8",
      );

      /* Dessert is no root now: a term page, its narrower terms linked. */
      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(8);
      await expect(page.getByTestId("term-count")).toHaveText("8 recipes");
      await expect(
        page
          .getByTestId("term-children")
          .getByRole("link", { name: /Cookies/ }),
      ).toHaveAttribute("href", "/tags/cookies");

      /* Two levels down, the breadcrumb walks to the root — labels only. */
      await page.goto("/tags/cookies");
      await expect(
        page.getByTestId("term-breadcrumb").getByRole("link"),
      ).toHaveText(["Course", "Dessert"]);
    });

    /*
     * 34a (D2): the page is cached per by-term key, so these visit it
     * *before* the write — a page that read only its own key, or only the
     * keys something already carried, would serve the stale list here.
     */
    test("a narrower term's new recipe reaches the cached parent page (34a)", async ({
      page,
      request,
      createApiToken,
    }) => {
      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(8);
      await expect(page.getByTestId("term-count")).toHaveText(/^8 recipes/);

      const token = await createApiToken();
      const created = await request.post("/api/recipes", {
        headers: { authorization: `Bearer ${token}` },
        data: { name: "Linzer Bars", tags: ["cookies"] },
      });
      expect(created.status()).toBe(201);

      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(9);
      await expect(page.getByTestId("term-count")).toHaveText(/^9 recipes/);
      /* A root page's Newest view holds the list (43t). */
      await page.getByRole("button", { name: "Newest", exact: true }).click();
      await expect(
        page.getByTestId("recipe-list").getByText("Linzer Bars"),
      ).toBeVisible();
    });

    test("a narrower term's first carrier reaches the cached parent page (34a)", async ({
      page,
      request,
      createApiToken,
    }) => {
      const token = await createApiToken();
      const headers = { authorization: `Bearer ${token}` };
      const bars = await request.post("/api/taxonomies/tag", {
        headers,
        data: { label: "Bars", parent: "dessert" },
      });
      expect(bars.status()).toBe(201);

      /* `bars` is in dessert's subtree and carries nothing: a ghost key. */
      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(8);

      const created = await request.post("/api/recipes", {
        headers,
        data: { name: "Lemon Bars", tags: ["bars"] },
      });
      expect(created.status()).toBe(201);

      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(9);
      await expect(
        page.getByTestId("recipe-list").getByText("Lemon Bars"),
      ).toBeAttached();
    });

    test("a recipe tagged with a narrower term's alias is listed, as tag: finds it (34a)", async ({
      page,
      request,
      createApiToken,
    }) => {
      const token = await createApiToken();
      const headers = { authorization: `Bearer ${token}` };
      const patched = await request.patch("/api/taxonomies/tag/cookies", {
        headers,
        data: { aliases: ["Biscuits"] },
      });
      expect(patched.status()).toBe(200);

      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(8);

      const created = await request.post("/api/recipes", {
        headers,
        data: { name: "Digestive Biscuits", tags: ["biscuits"] },
      });
      expect(created.status()).toBe(201);

      await page.goto("/tags/dessert");
      await expect(cards(page)).toHaveCount(9);
      await expect(
        page.getByTestId("recipe-list").getByText("Digestive Biscuits"),
      ).toBeAttached();
    });

    test("/tags counts an alias's carriers and lists the aliases (38a, D2)", async ({
      page,
      request,
      createApiToken,
    }) => {
      const token = await createApiToken();
      const headers = { authorization: `Bearer ${token}` };
      expect(
        (
          await request.patch("/api/taxonomies/tag/cookies", {
            headers,
            data: { aliases: ["Biscuits"] },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await request.post("/api/recipes", {
            headers,
            data: { name: "Digestive Biscuits", tags: ["biscuits"] },
          })
        ).status(),
      ).toBe(201);

      await page.goto("/tags");
      const rows = page
        .locator("[data-testid='tag-column'][data-group='collections']")
        .getByTestId("tag-row");
      expect((await rows.nth(0).innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Dessert 9",
      );
      expect((await rows.nth(1).innerText()).replace(/\s+/g, " ").trim()).toBe(
        "Cookies 9",
      );
      /* "Find a tag" knows the alias and says so (43t). */
      await expectHydrated(page.getByTestId("tag-find"));
      await page.getByTestId("tag-find").fill("biscu");
      await expect(page.getByRole("option", { name: /Cookies/ })).toContainText(
        "also Biscuits",
      );
      /* The alias is Cookies', not a bare tag of its own (38a review). */
      await page.getByTestId("tag-other").locator("summary").click();
      const chips = page.getByTestId("tag-index");
      await expect(chips.getByRole("link", { name: /christmas/ })).toHaveCount(
        1,
      );
      await expect(chips.getByRole("link", { name: /biscuits/i })).toHaveCount(
        0,
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

    test("Find a tag reaches a record nothing carries yet (43t)", async ({
      page,
    }) => {
      await page.goto("/tags");
      const find = page.getByTestId("tag-find");
      await expectHydrated(find);
      await find.fill("holi");
      await expect(page.getByRole("option", { name: /Holiday/ })).toBeVisible();
      await find.press("Enter");
      await page.waitForURL((url) => url.pathname === "/tags/holiday");
      await expect(
        page.getByRole("heading", { name: "Holiday", exact: true }),
      ).toBeVisible();
      /* Recorded terms leave the other tags to the bare ones. */
      await page.goto("/tags");
      await page.getByTestId("tag-other").locator("summary").click();
      const chips = page.getByTestId("tag-index");
      await expect(chips.getByRole("link", { name: /Holiday/ })).toHaveCount(0);
      await expect(chips.getByRole("link", { name: /^christmas/ })).toHaveCount(
        1,
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
