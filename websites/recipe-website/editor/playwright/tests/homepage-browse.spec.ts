import { test, expect, type Page } from "../support/test";
import { expectMode, expectNoViolations } from "../support/a11y";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

/**
 * The homepage — canvas B, "Tonight, then the next feast" (48e; 42f's "Now
 * and next" before it): the band (date, question, search field, `tag:`
 * chips), Tonight (with the Make tile), Next up and Then (the holidays as
 * menus — `homepage-feasts.spec.ts` has the rest), "New in the collection"
 * beside the newest plan and the featured list, and Browse as one line.
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

/* 48e: one index line, a `nav` labelled by its heading. */
const browse = (page: Page) =>
  page.getByRole("navigation", { name: "Browse", exact: true });

/* 48e: "This season" became Next up (the next holiday's menu) and Then. */
const nextUp = (page: Page) => page.getByTestId("next-feast");
const then = (page: Page) =>
  page.getByRole("region", { name: "Then", exact: true });

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

    /* The browse link counts the alias carrier too (48e: the root's total,
     * one index line — the Daiquiri family's own count is on `/tags`). */
    await expect(
      browse(page).getByRole("link", { name: /^Drinks/ }),
    ).toHaveText("Drinks 7");
  });

  test("has no hero: the featured recipe is one row among equals, beside New in the collection", async ({
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

    /* 48e: the list sits beside New in the collection on a laptop, its
     * heading on the same line (it was the first screen's right rail). */
    const featuredHeading = page.getByRole("heading", {
      level: 2,
      name: "Featured",
    });
    await expect(featuredHeading).toBeVisible();
    const [featuredBox, newBox] = await Promise.all([
      featuredHeading.boundingBox(),
      page
        .getByRole("heading", { level: 2, name: "New in the collection" })
        .boundingBox(),
    ]);
    expect(Math.abs(featuredBox!.y - newBox!.y)).toBeLessThan(48);
    expect(featuredBox!.x).toBeGreaterThan(newBox!.x);
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

  test("shows each facet root on one index line, by label, linking to term pages", async ({
    page,
  }) => {
    await page.goto("/");

    /* 48e: a link per root, its subtree's total beside it — Cookies' eight
     * are Dessert's. The children are the root's page's. */
    const root = browse(page).getByTestId("home-facet");
    await expect(root).toHaveCount(1);
    await expect(root).toHaveText("Dessert 8");
    await expect(root).toHaveAttribute("href", "/tags/dessert");
    await root.click();
    await expect(page).toHaveURL(/\/tags\/dessert$/);

    /* A record with no children is not a root, and the flat chips are gone. */
    await page.goto("/");
    await expect(
      browse(page).getByRole("link", { name: /Holiday/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Browse by tag" }),
    ).toHaveCount(0);
    await expect(
      browse(page).getByRole("link", { name: "Every tag" }),
    ).toHaveAttribute("href", "/tags");
    /* No holidays root in this fixture, so no Next up. */
    await expect(nextUp(page)).toHaveCount(0);
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
    await expect(browse(page).getByTestId("home-facet")).toHaveText(
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
    await expect(browse(page).getByTestId("home-facet")).toHaveText("Course 8");
    await expect(
      browse(page).getByRole("link", { name: /^Course/ }),
    ).toHaveAttribute("href", "/tags/course");

    /*
     * The by-tag maps' tag: a child nothing carries adds nothing to its
     * root's total until its first recipe arrives.
     */
    const bars = await request.post("/api/taxonomies/tag", {
      headers,
      data: { label: "Bars", parent: "course" },
    });
    expect(bars.status()).toBe(201);
    await page.goto("/");
    await expect(browse(page).getByTestId("home-facet")).toHaveText("Course 8");

    const recipe = await request.post("/api/recipes", {
      headers,
      data: { name: "Lemon Bars", tags: ["bars"] },
    });
    expect(recipe.status()).toBe(201);
    await page.goto("/");
    await expect(browse(page).getByTestId("home-facet")).toHaveText("Course 9");
  });

  test("Next up counts down to the next holiday on the browser's calendar", async ({
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

    /* Easter has nothing tagged, so Christmas is next, with nothing after. */
    const next = nextUp(page);
    await expect(next).toContainText("Christmas");
    await expect(next.getByTestId("next-countdown")).toHaveText("in 5 days");
    await expect(next).toContainText("4 dishes");
    await expect(then(page)).toHaveCount(0);
    /* The date, as a calendar leaf: the browser's next 25 December. */
    await expect(next.locator('time[datetime="2026-12-25"]')).toHaveText(
      "Fri 25 Dec",
    );
    /* The name goes to the holiday's menu, and so does Open the menu. */
    await expect(
      next.getByRole("link", { name: "Christmas", exact: true }),
    ).toHaveAttribute("href", "/holidays/christmas");
    await expect(
      next.getByRole("link", { name: "Open the menu" }),
    ).toHaveAttribute("href", "/holidays/christmas");
    /* No course root in this fixture: the four are one card, "Other dishes". */
    await expect(next.getByTestId("feast-course")).toHaveCount(1);
    await expect(next.getByTestId("feast-course")).toContainText(
      "Other dishes · 4",
    );
    /* Browse leaves the holidays root to the menus. */
    await expect(
      browse(page).getByRole("link", { name: /^Holidays/ }),
    ).toHaveCount(0);
    await expect(
      browse(page).getByRole("link", { name: /^Dessert/ }),
    ).toBeVisible();
    await expect(page.locator('time[datetime="2026-12-20"]')).toHaveText(
      "Sunday 20 December",
    );
    await expect(page.getByTestId("today-countdown")).toHaveText(
      "· 5 days to Christmas",
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
    await expect(nextUp(page)).toHaveCount(0);
    await expect(page.getByTestId("today-countdown")).toHaveCount(0);
    await expect(
      browse(page).getByRole("link", { name: /^Holidays/ }),
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

test.describe("Homepage — plans and new in the collection", () => {
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

  test("no plans, no panel; New in the collection links to all recipes past six", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/");
    await expect(plan(page)).toHaveCount(0);
    const fresh = page.getByRole("region", {
      name: "New in the collection",
      exact: true,
    });
    await expect(
      fresh.getByRole("link", { name: "All 7 recipes" }),
    ).toHaveAttribute("href", "/recipes");
  });
});

test.describe("Homepage — the holidays and the featured list", () => {
  /* 18 October 2026: Halloween in 13 days, Christmas in 68. */
  const OCT_18 = new Date(2026, 9, 18, 12);

  test("the next holidays, each shown once", async ({
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

    /* Halloween next (its two recipes: a dish and a drink), Christmas then. */
    const next = nextUp(page);
    await expect(next).toContainText("Halloween");
    await expect(next.getByTestId("next-countdown")).toHaveText("in 13 days");
    await expect(next.locator("time").first()).toHaveAttribute(
      "datetime",
      "2026-10-31",
    );
    await expect(next).toContainText("1 dish · 1 drink · featured");
    await expect(
      next.getByRole("link", { name: "Halloween", exact: true }),
    ).toHaveAttribute("href", "/holidays/halloween");
    const later = then(page).getByTestId("then-feast");
    await expect(later).toHaveCount(1);
    await expect(later).toContainText("Christmas");
    await expect(later.getByTestId("then-countdown")).toHaveText("in 68 days");
    await expect(later).toContainText("1 drink");
    await expect(later).not.toContainText("featured");

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

  test("drinks-bar's holidays have no WCAG 2.2 AA violations, and fit a phone", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(OCT_18);
    await page.goto("/");
    await expect(nextUp(page).getByTestId("feast-course")).toHaveCount(2);
    await expect(then(page).getByTestId("then-feast")).toHaveCount(1);
    await expectNoViolations(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(nextUp(page).getByTestId("feast-course")).toHaveCount(2);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    /*
     * Every link in the holidays' sections is a ≥ 24 px target. Measured
     * rather than axe'd: at phone width axe's target-size counts whatever the
     * fixed tab bar happens to cover at the current scroll as "partially
     * obscured" — a property of the scroll position, not of the targets.
     */
    const boxes = await page
      .locator('[data-testid="next-feast"], [data-testid="then-feast"]')
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
