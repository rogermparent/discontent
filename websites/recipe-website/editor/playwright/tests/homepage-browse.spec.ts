import { test, expect, type Page } from "../support/test";
import { expectMode, expectNoViolations } from "../support/a11y";

/**
 * The homepage: the redesign's structure (no hero, equal featured cards,
 * browse by facet roots) in direction A's dress (usability pass, 2026-10-15)
 * — the intro and its intent tiles, "Coming up", the browse rows, "New this
 * week" and the plans strip.
 *
 * `christmas-cookies` is the fixture with a hierarchy: `dessert` is a root
 * whose one child, `cookies`, eight recipes carry; four of them are also
 * tagged `christmas`. `holiday` is a record with no children, so it is not a
 * root. `make-drinks` has the `drink` root over five drinks.
 */

const waysIn = (page: Page) =>
  page.getByRole("navigation", { name: "Ways in" });

const browse = (page: Page) =>
  page.getByRole("region", { name: "Browse", exact: true });

const comingUp = (page: Page) =>
  page.getByRole("region", { name: "Coming up", exact: true });

const makeStatus = (page: Page) => page.getByTestId("make-tile-status");

test.describe("Homepage — intro", () => {
  test("asks what you are making, with What can I make? first", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 2, name: "What are you making?" }),
    ).toBeVisible();
    /* The page's one h1 is still the masthead's. */
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    /* The date line is the browser's own day, in a `<time>`. */
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await expect(page.locator(`time[datetime="${today}"]`)).toBeVisible();

    /* No intent vocabulary in this fixture: the Make tile alone. */
    const tiles = waysIn(page).getByRole("link");
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toHaveAttribute("href", "/make");
    await expect(tiles.first()).toContainText("What can I make?");
    await expect(makeStatus(page)).toHaveText("Tell it what you have");

    await tiles.first().click();
    await expect(page).toHaveURL(/\/make$/);
  });

  test("shows the intents the vocabulary has, and counts from this browser's list", async ({
    page,
    resetData,
  }) => {
    await resetData("make-drinks");
    await page.goto("/");

    const drink = waysIn(page).getByRole("link", { name: /^A drink/ });
    await expect(drink).toHaveAttribute("href", "/tags/drink");
    await expect(drink).toContainText("5 drinks");
    /* `quick`, `vegetarian` and `project` are not in this fixture. */
    await expect(waysIn(page).getByRole("link")).toHaveCount(2);
    await expect(makeStatus(page)).toHaveText("Tell it what you have");

    /* This browser's list (U6): vodka, syrup and lime make a Vodka Sour. */
    await page.evaluate(() =>
      localStorage.setItem(
        "make-inventory-v1",
        JSON.stringify({
          added: ["vodka", "simple syrup", "lime"],
          removed: [],
        }),
      ),
    );
    await page.reload();
    await expect(makeStatus(page)).toHaveText(/^[1-9]\d* ready now$/, {
      timeout: 20_000,
    });
    await expect(
      waysIn(page).getByRole("link", { name: /^What can I make\?/ }),
    ).toContainText("against the 3 things on hand");
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

    /* The first content section starts above the fold on a laptop. */
    await expect(
      page.getByRole("heading", { level: 2, name: "Featured" }),
    ).toBeInViewport();
    await expect(
      page
        .getByRole("region", { name: "Featured", exact: true })
        .getByRole("link", { name: "Everything featured" }),
    ).toHaveAttribute("href", "/featured-recipes");
  });
});

test.describe("Homepage — browse by term", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("christmas-cookies");
  });

  test("shows each facet root as a row of its children, by label, linking to term pages", async ({
    page,
  }) => {
    await page.goto("/");

    const root = browse(page).getByRole("heading", { level: 3 });
    await expect(root).toHaveCount(1);
    await expect(root).toHaveText("Dessert");
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
      browse(page).getByRole("link", { name: "Every tag" }),
    ).toHaveAttribute("href", "/tags");
    /* No holidays root in this fixture, so no "Coming up". */
    await expect(comingUp(page)).toHaveCount(0);
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
      "Dessert",
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
      "Course",
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

  test("Coming up counts down to the next holidays on the browser's calendar", async ({
    page,
    request,
    createApiToken,
  }) => {
    const token = await createApiToken();
    const headers = { authorization: `Bearer ${token}` };
    for (const data of [
      { label: "Holidays" },
      { label: "Christmas", parent: "holidays" },
      { label: "Easter", parent: "holidays" },
    ]) {
      const created = await request.post("/api/taxonomies/tag", {
        headers,
        data,
      });
      expect(created.status()).toBe(201);
    }

    /* The browser's day, not the server's: five days before Christmas. */
    await page.clock.setFixedTime(new Date(2026, 11, 20, 12));
    await page.goto("/");

    /* Easter has nothing tagged, so only Christmas shows. */
    const cards = comingUp(page).getByTestId("coming-up-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Christmas");
    await expect(cards.first()).toContainText("in 5 days");
    await expect(cards.first()).toContainText("4 recipes");
    await expect(cards.first().getByRole("link")).toHaveAttribute(
      "href",
      "/tags/christmas",
    );
    await expect(
      comingUp(page).getByRole("link", { name: "All holidays" }),
    ).toHaveAttribute("href", "/tags/holidays");
    await expect(page.locator('time[datetime="2026-12-20"]')).toHaveText(
      "Sunday 20 December",
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

test.describe("Homepage — plans and new this week", () => {
  test("the plans strip opens the newest plan and lists the rest", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/");

    const plans = page.getByRole("region", { name: "Plans", exact: true });
    await expect(plans.getByTestId("plans-strip-latest")).toContainText(
      "Week of May 4",
    );
    await expect(
      plans.getByRole("link", { name: "Open the plan" }),
    ).toHaveAttribute("href", "/group/week-of-may-4");
    await expect(
      plans.getByRole("link", { name: "All plans" }),
    ).toHaveAttribute("href", "/groups");
  });

  test("no plans, no strip; New this week links to all recipes past six", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "Plans", exact: true }),
    ).toHaveCount(0);
    const fresh = page.getByRole("region", {
      name: "New this week",
      exact: true,
    });
    await expect(
      fresh.getByRole("link", { name: "All 7 recipes" }),
    ).toHaveAttribute("href", "/recipes");
  });
});
