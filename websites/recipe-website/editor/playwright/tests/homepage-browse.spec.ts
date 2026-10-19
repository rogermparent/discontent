import { test, expect, type Page } from "../support/test";
import { expectMode, expectNoViolations } from "../support/a11y";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

/**
 * The homepage — canvas B, "Now and next" (42f), on the structure the
 * 2026-10-15 redesign settled: the band (date, question, search field,
 * `tag:` chips, the Make tile), "This season", "New this week", "Browse",
 * and a right rail with the newest plan and the featured list.
 *
 * `christmas-cookies` is the fixture with a hierarchy: `dessert` is a root
 * whose one child, `cookies`, eight recipes carry; four of them are also
 * tagged `christmas`. `holiday` is a record with no children, so it is not a
 * root. `make-drinks` has the `drink` root over five drinks. `drinks-bar`
 * has a `holidays` root: Halloween (Hand Pies, Vodka Sour) and Christmas
 * (Chamomile Collins).
 */

const chips = (page: Page) =>
  page.getByRole("navigation", { name: "Start a search from" });

const makeTile = (page: Page) => page.getByTestId("make-tile");

const browse = (page: Page) =>
  page.getByRole("region", { name: "Browse", exact: true });

const season = (page: Page) =>
  page.getByRole("region", { name: "This season", exact: true });

const plan = (page: Page) =>
  page.getByRole("region", { name: "On the plan", exact: true });

const featured = (page: Page) =>
  page.getByRole("region", { name: "Featured", exact: true });

const makeStatus = (page: Page) => page.getByTestId("make-tile-status");

test.describe("Homepage — intro", () => {
  test("asks what you are making, with a search field and What can I make?", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    /* A fixed clock: the date line is the browser's day, not whatever day
     * the suite happens to run on. */
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 2, name: "What are you making?" }),
    ).toBeVisible();
    /* The page's one h1 is still the masthead's. */
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    /* The date line is the browser's own day, in a `<time>`. */
    await expect(page.locator('time[datetime="2026-10-15"]')).toHaveText(
      "Thursday 15 October",
    );

    /* A real field, labelled, counting the corpus in its placeholder. */
    const field = page.getByRole("searchbox", { name: "Search recipes" });
    await expect(field).toHaveAttribute(
      "placeholder",
      "Search 3 recipes — a name, an ingredient, a tag",
    );
    /* The palette's shortcut, the masthead's own text. */
    await expect(page.getByTestId("home-search-shortcut")).toHaveAttribute(
      "data-shortcut",
      /^(⌘|Ctrl\+)K$/,
    );

    /* No intent vocabulary in this fixture: no chips, the Make tile alone. */
    await expect(chips(page)).toHaveCount(0);
    await expect(makeTile(page)).toHaveAttribute("href", "/make");
    await expect(makeTile(page)).toContainText("What can I make?");
    await expect(makeStatus(page)).toHaveText("Tell it what you have");

    await makeTile(page).click();
    await expect(page).toHaveURL(/\/make$/);
  });

  test("the search field submits to /search?q=…", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    const field = page.getByRole("searchbox", { name: "Search recipes" });
    await expectHydrated(field);
    await field.fill("second");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=second$/);
    await expect(page.getByLabel("Search recipes")).toHaveValue("second");
  });

  test("the search field works before any script runs", async ({
    browser,
    baseURL,
    resetData,
  }) => {
    await resetData("three-recipes");
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto("/");
    const field = page.getByRole("searchbox", { name: "Search recipes" });
    await field.fill("first recipe");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=first\+recipe$/);
    await context.close();
  });

  test("shows the intents the vocabulary has as tag: chips, and counts from this browser's list", async ({
    page,
    resetData,
  }) => {
    await resetData("make-drinks");
    await page.goto("/");

    const drink = chips(page).getByRole("link", { name: /^tag:drink/ });
    await expect(drink).toHaveAttribute("href", "/search?q=tag%3Adrink");
    await expect(drink).toHaveText("tag:drink 5");
    /* `quick`, `vegetarian` and `project` are not in this fixture. */
    await expect(chips(page).getByRole("link")).toHaveCount(1);
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
    await expect(makeTile(page)).toContainText("against the 3 things on hand");

    /* A chip opens the query in the search field. */
    await drink.click();
    await expect(page).toHaveURL(/\/search\?q=tag%3Adrink$/);
  });

  test("counts alias carriers, and a bare tag's chip beside a hierarchy (38a)", async ({
    page,
    resetData,
  }) => {
    /* `drinks-bar`: seven drinks, one of them (Classic Daiquiri) tagged only
     * `daiquiris`, an alias of the Daiquiri family under `drink`; and a bare
     * `quick` tag on the Gin and Tonic, with no record. */
    await resetData("drinks-bar");
    await page.goto("/");

    await expect(
      chips(page).getByRole("link", { name: /^tag:drink/ }),
    ).toHaveText("tag:drink 7");
    /* The corpus has a hierarchy; the bare tag still gets its chip. */
    const quick = chips(page).getByRole("link", { name: /^tag:quick/ });
    await expect(quick).toHaveAttribute("href", "/search?q=tag%3Aquick");
    await expect(quick).toHaveText("tag:quick 1");

    /* The browse link counts the alias carrier too. */
    await expect(
      browse(page).getByRole("link", { name: /^Daiquiri/ }),
    ).toHaveText("Daiquiri 2");
  });

  test("has no hero: the featured recipe is one row among equals, in the rail", async ({
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

    /* The rail starts on the first screen of a laptop. */
    await expect(
      page.getByRole("heading", { level: 2, name: "Featured" }),
    ).toBeInViewport();
    await expect(
      featured(page).getByRole("link", { name: "Everything featured" }),
    ).toHaveAttribute("href", "/featured-recipes");
    /* A line saying what the row is, never a raw timestamp. */
    await expect(featured(page).getByTestId("card-meta")).toHaveText("Recipe");
    await expect(featured(page).locator("time")).toHaveCount(0);
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
    /* No holidays root in this fixture, so no "This season". */
    await expect(season(page)).toHaveCount(0);
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

  test("This season counts down to the next holidays on the browser's calendar", async ({
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
    const rows = season(page).getByTestId("season-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Christmas");
    await expect(rows.first().getByTestId("season-countdown")).toHaveText(
      "in 5 days",
    );
    await expect(rows.first()).toContainText("4 recipes");
    /* The date, as a calendar leaf: the browser's next 25 December. */
    await expect(
      rows.first().locator('time[datetime="2026-12-25"]'),
    ).toHaveText("Fri 25 Dec");
    /* The name goes to the holiday's menu, the section's link to the almanac. */
    await expect(
      rows.first().getByRole("link", { name: "Christmas", exact: true }),
    ).toHaveAttribute("href", "/holidays/christmas");
    await expect(
      season(page).getByRole("link", { name: "All holidays" }),
    ).toHaveAttribute("href", "/holidays");
    /* The strip: Christmas's four recipes, each a link to its page. */
    await expect(
      rows
        .first()
        .getByRole("list", { name: "From Christmas" })
        .getByRole("link"),
    ).toHaveCount(4);
    /* Browse leaves the holidays root to the season. */
    await expect(
      browse(page).getByRole("heading", { level: 3, name: "Holidays" }),
    ).toHaveCount(0);
    await expect(
      browse(page).getByRole("heading", { level: 3, name: "Dessert" }),
    ).toBeVisible();
    await expect(page.locator('time[datetime="2026-12-20"]')).toHaveText(
      "Sunday 20 December",
    );

    /*
     * The day after Christmas, on the browser's calendar: Christmas is a
     * year out, past the window, so no row and no section — whatever the
     * server's day — and Browse still leaves the holidays root alone.
     */
    await page.clock.setFixedTime(new Date(2026, 11, 26, 12));
    await page.goto("/");
    await expect(page.locator('time[datetime="2026-12-26"]')).toHaveText(
      "Saturday 26 December",
    );
    await expect(season(page)).toHaveCount(0);
    await expect(
      browse(page).getByRole("heading", { level: 3, name: "Holidays" }),
    ).toHaveCount(0);
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
  test("the plan panel shows the newest plan's lines and opens it", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/");

    await expect(plan(page).getByTestId("plans-strip-latest")).toContainText(
      "Week of May 4",
    );
    /* Its lines, in the plan's order, each a link. */
    const lines = plan(page).getByTestId("plan-lines").getByRole("listitem");
    await expect(lines.first()).toBeVisible();
    await expect(lines.first().getByRole("link")).toHaveAttribute(
      "href",
      /^\/(recipe|group)\//,
    );
    await expect(
      plan(page).getByRole("link", { name: "Open the plan" }),
    ).toHaveAttribute("href", "/group/week-of-may-4");
    await expect(
      plan(page).getByRole("link", { name: "All plans" }),
    ).toHaveAttribute("href", "/groups");

    /* The shopping list is a signed-in editor's: no link for a guest. */
    await expect(
      plan(page).getByRole("link", { name: "Shopping list" }),
    ).toHaveCount(0);
    await signIn(page);
    await page.goto("/");
    await expect(
      plan(page).getByRole("link", { name: "Shopping list" }),
    ).toHaveAttribute("href", "/shopping");
  });

  test("no plans, no panel; New this week links to all recipes past six", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/");
    await expect(plan(page)).toHaveCount(0);
    const fresh = page.getByRole("region", {
      name: "New this week",
      exact: true,
    });
    await expect(
      fresh.getByRole("link", { name: "All 7 recipes" }),
    ).toHaveAttribute("href", "/recipes");
  });
});

test.describe("Homepage — this season and the featured list", () => {
  /* 18 October 2026: Halloween in 13 days, Christmas in 68. */
  const OCT_18 = new Date(2026, 9, 18, 12);

  test("dated rows for the coming holidays, each shown once", async ({
    page,
    request,
    resetData,
    createApiToken,
  }) => {
    await resetData("drinks-bar");
    const token = await createApiToken();
    const headers = { authorization: `Bearer ${token}` };
    /* Explicit slugs (T26): a feature of the Halloween term and a recipe. */
    for (const data of [
      { term: "halloween", slug: "featured-halloween" },
      { recipe: "daiquiri", slug: "featured-daiquiri" },
    ]) {
      const created = await request.post("/api/featured", { headers, data });
      expect(created.status()).toBe(201);
    }

    await page.clock.setFixedTime(OCT_18);
    await page.goto("/");

    const rows = season(page).getByTestId("season-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Halloween");
    await expect(rows.nth(0).getByTestId("season-countdown")).toHaveText(
      "in 13 days",
    );
    await expect(rows.nth(0).locator("time")).toHaveAttribute(
      "datetime",
      "2026-10-31",
    );
    await expect(rows.nth(0)).toContainText("2 recipes · featured");
    await expect(
      rows.nth(0).getByRole("link", { name: "Halloween", exact: true }),
    ).toHaveAttribute("href", "/holidays/halloween");
    await expect(rows.nth(1)).toContainText("Christmas");
    await expect(rows.nth(1).getByTestId("season-countdown")).toHaveText(
      "in 68 days",
    );
    await expect(rows.nth(1)).toContainText("1 recipe");
    await expect(rows.nth(1)).not.toContainText("featured");

    /* The featured list keeps the recipe and leaves the holiday to its row. */
    await expect(
      featured(page).getByText("Daiquiri", { exact: true }),
    ).toBeVisible();
    await expect(featured(page).getByTestId("featured-term-card")).toHaveCount(
      0,
    );
    /* No holiday twice: one link to each holiday on the page's main. */
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /^Halloween/ })).toHaveCount(1);
    await expect(main.getByRole("link", { name: /^Christmas/ })).toHaveCount(1);
  });

  for (const mode of ["light", "dark"] as const) {
    test(`with the plan and featured rail, has no WCAG 2.2 AA violations in ${mode} mode`, async ({
      page,
      resetData,
    }) => {
      await resetData("three-recipes-groups");
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await expectMode(page, mode);
      await expect(plan(page)).toBeVisible();
      await expectNoViolations(page);
    });
  }

  test("drinks-bar's season has no WCAG 2.2 AA violations, and fits a phone", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(OCT_18);
    await page.goto("/");
    await expect(season(page).getByTestId("season-row")).toHaveCount(2);
    await expectNoViolations(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(season(page).getByTestId("season-row")).toHaveCount(2);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    /*
     * Every link in the season's rows is a ≥ 24 px target. Measured rather than
     * axe'd: at phone width axe's target-size counts whatever the fixed tab
     * bar happens to cover at the current scroll as "partially obscured" —
     * a property of the scroll position, not of the targets.
     */
    const boxes = await season(page)
      .getByTestId("season-row")
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => {
          const { width, height } = link.getBoundingClientRect();
          return { name: link.textContent || link.ariaLabel, width, height };
        }),
      );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(
        Math.min(box.width, box.height),
        String(box.name),
      ).toBeGreaterThanOrEqual(24);
    }
  });
});
