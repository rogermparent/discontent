import { test, expect, type Page } from "../support/test";
import { expectMode, expectNoViolations } from "../support/a11y";

/**
 * The homepage redesign (2026-10-15): a row of ways in instead of a hero, the
 * featured strip as equal cards, and browsing by the tag vocabulary's facet
 * roots instead of a flat row of tag strings.
 *
 * `christmas-cookies` is the fixture with a hierarchy: `dessert` is a root
 * whose one child, `cookies`, eight recipes carry. `holiday` is a record with
 * no children, so it is not a root.
 */

const startHere = (page: Page) =>
  page.getByRole("navigation", { name: "Start here" });

const browse = (page: Page) =>
  page.getByRole("region", { name: "Browse", exact: true });

test.describe("Homepage — ways in", () => {
  test("leads with What can I make?, then Search, All recipes and Groups", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");

    const links = startHere(page).getByRole("link");
    await expect(links).toHaveText([
      "What can I make?",
      "Search",
      "All recipes",
      "Groups",
    ]);
    await expect(links.nth(0)).toHaveAttribute("href", "/make");
    await expect(links.nth(1)).toHaveAttribute("href", "/search");
    await expect(links.nth(2)).toHaveAttribute("href", "/recipes");
    await expect(links.nth(3)).toHaveAttribute("href", "/groups");

    /* The intro line is the corpus' size, not a slogan. */
    await expect(startHere(page)).toContainText("3 recipes");

    await links.nth(0).click();
    await expect(page).toHaveURL(/\/make$/);
  });

  test("has no hero: the featured recipe is one card among equals", async ({
    page,
    resetData,
  }) => {
    await resetData("one-featured-recipe");
    await page.goto("/");

    /* The old hero was a region named "<Featured|Latest> recipe". */
    await expect(
      page.getByRole("region", { name: /^(Featured|Latest) recipe$/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View recipe" })).toHaveCount(
      0,
    );

    /* The page's one h1 is still the masthead's. */
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    /* And the first content section starts above the fold on a laptop. */
    const featured = page.getByRole("heading", {
      level: 2,
      name: "Featured",
    });
    await expect(featured).toBeInViewport();
  });
});

test.describe("Homepage — browse by term", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("christmas-cookies");
  });

  test("shows each facet root with its children, by label, linking to term pages", async ({
    page,
  }) => {
    await page.goto("/");

    const root = browse(page).getByRole("heading", { level: 3 });
    await expect(root).toHaveCount(1);
    await expect(root).toHaveText("Dessert 8");
    await expect(root.getByRole("link")).toHaveAttribute(
      "href",
      "/tags/dessert",
    );

    /* The record's label ("Cookies"), not the slug, with its subtree total. */
    const chip = browse(page).getByRole("link", { name: /^Cookies/ });
    await expect(chip).toHaveText("Cookies 8");
    await expect(chip).toHaveAttribute("href", "/tags/cookies");
    await chip.click();
    await expect(page).toHaveURL(/\/tags\/cookies$/);

    /* A record with no children is not a root, and the flat chips are gone. */
    await page.goto("/");
    await expect(
      browse(page).getByRole("heading", { name: /Holiday/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Browse by tag" }),
    ).toHaveCount(0);
    await expect(
      browse(page).getByRole("link", { name: "All tags →" }),
    ).toHaveAttribute("href", "/tags");
  });

  test("follows term writes: a new root, a relabel, and a first carrier", async ({
    page,
    request,
    createApiToken,
  }) => {
    const token = await createApiToken();
    const headers = { authorization: `Bearer ${token}` };

    /* Prime the cache, so a stale entry would have something to serve. */
    await page.goto("/");
    await expect(browse(page).getByRole("heading", { level: 3 })).toHaveText(
      "Dessert 8",
    );

    /* The tree aggregate's tag: a new root, and dessert moved under it. */
    const created = await request.post("/api/taxonomies/tag", {
      headers,
      data: { label: "Course" },
    });
    expect(created.status()).toBe(201);
    const moved = await request.patch("/api/taxonomies/tag/dessert", {
      headers,
      data: { parent: "course", label: "Desserts" },
    });
    expect(moved.status()).toBe(200);

    await page.goto("/");
    await expect(browse(page).getByRole("heading", { level: 3 })).toHaveText(
      "Course 8",
    );
    await expect(
      browse(page).getByRole("link", { name: /^Desserts/ }),
    ).toHaveAttribute("href", "/tags/dessert");

    /*
     * The by-tag maps' tag: a child nothing carries is left out until its
     * first recipe arrives.
     */
    const bars = await request.post("/api/taxonomies/tag", {
      headers,
      data: { label: "Bars", parent: "course" },
    });
    expect(bars.status()).toBe(201);
    await page.goto("/");
    await expect(browse(page).getByRole("link", { name: /^Bars/ })).toHaveCount(
      0,
    );

    const recipe = await request.post("/api/recipes", {
      headers,
      data: { name: "Lemon Bars", tags: ["bars"] },
    });
    expect(recipe.status()).toBe(201);
    await page.goto("/");
    await expect(browse(page).getByRole("link", { name: /^Bars/ })).toHaveText(
      "Bars 1",
    );
  });

  for (const mode of ["light", "dark"] as const) {
    test(`has no WCAG2AA violations in ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await expectMode(page, mode);
      await expect(browse(page)).toBeVisible();
      await expectNoViolations(page);
    });
  }

  test("does not scroll sideways at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(browse(page)).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
