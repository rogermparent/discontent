import type { APIRequestContext } from "@playwright/test";
import { test, expect, type Page } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { chooseOption, signIn } from "../support/helpers";
import { snapshotPage } from "../support/visual";
import { expectNoViolations } from "../support/a11y";

/*
 * The meal-plan page B, "Plan at home, cook through it" (43p1): Plan mode's
 * ordered rows with a heads-up from each recipe's steps, a scale per row and
 * one Save, the rail (shopping list, your shelf, make ahead), Cook mode's
 * Up next and made ticks, a labelled week, and the /groups list.
 *
 * On `drinks-bar`, for its `holidays` › `christmas` term; the cookie
 * recipes and the plans are written through the API, so no shared
 * fixture's counts move. The browser's clock is frozen on Sunday 18
 * October 2026, noon: 68 days to Christmas.
 */

const SUNDAY = new Date(2026, 9, 18, 12);
const PLAN = "cookie-tray";

const COOKIES = [
  {
    name: "Spritz Cookies",
    slug: "plan-spritz",
    totalTime: 60,
    recipeYield: "84 bite-size cookies",
    ingredients: [
      "1 cup unsalted butter, softened",
      "2/3 cup granulated sugar",
      "1 large egg",
      "2 teaspoons vanilla extract",
      "1/2 teaspoon almond extract",
      "2 1/4 cups all-purpose flour",
    ],
    instructions: [
      { text: "Preheat the oven to 350°F (177°C)." },
      { text: "Beat the butter and sugar, then the egg and extracts." },
      { text: "Press onto unlined baking sheets and bake for 7-9 minutes." },
    ],
  },
  {
    name: "Gingerbread Cookies",
    slug: "plan-gingerbread",
    totalTime: 270,
    recipeYield: "24 four-inch cookies",
    ingredients: [
      "3 cups all-purpose flour",
      "1 tablespoon ground ginger",
      "3/4 cup unsalted butter",
      "3/4 cup molasses",
      "1 large egg",
    ],
    instructions: [
      {
        text: "Beat the butter, molasses and egg; mix in the dry ingredients.",
      },
      {
        text: "Divide the dough, wrap each half and chill for at least 3 hours or up to 3 days.",
      },
      { text: "Preheat the oven to 350°F. Bake for 9-10 minutes." },
    ],
  },
  {
    name: "Peanut Butter Blossoms",
    slug: "plan-blossoms",
    totalTime: 105,
    recipeYield: "24 cookies",
    ingredients: [
      "1/2 cup unsalted butter",
      "1/2 cup creamy peanut butter",
      "1 large egg",
      "1 1/2 cups all-purpose flour",
      "24 chocolate kisses",
    ],
    instructions: [
      { text: "Beat the butter and peanut butter, then the egg and flour." },
      {
        text: "Cover the dough and chill for at least 1 hour or up to 3 days.",
      },
      {
        text: "Preheat the oven to 350°F. Roll into balls and bake for 11-13 minutes. Press a chocolate into each, then place the sheet in the freezer for 10 minutes.",
      },
    ],
  },
  {
    name: "Iced Sugar Cookies",
    slug: "plan-sugar",
    ingredients: [
      "3/4 cup unsalted butter",
      "3/4 cup granulated sugar",
      "1 large egg",
      "2 1/4 cups all-purpose flour",
      "2 cups confectioners' sugar",
    ],
    instructions: [
      { text: "Make the dough, then chill it for 1-2 hours." },
      { text: "Preheat the oven to 350°F. Bake for 11-12 minutes." },
      { text: "Decorate, then allow the icing to set for 24 hours." },
    ],
  },
];

async function writeTray(request: APIRequestContext, token: string) {
  const headers = { authorization: `Bearer ${token}` };
  for (const data of COOKIES) {
    const response = await request.post("/api/recipes", { headers, data });
    expect(response.status()).toBe(201);
  }
  const plan = await request.post("/api/groups", {
    headers,
    data: {
      name: "Cookie Tray",
      slug: PLAN,
      tags: ["christmas"],
      description: "A cookie-tray baking day.",
      items: COOKIES.map(({ slug }) => ({ recipe: slug })),
    },
  });
  expect(plan.status()).toBe(201);
}

/** A week with labels, a scaled row and the tray as a sub-plan (B's SAMPLE). */
async function writeWeek(request: APIRequestContext, token: string) {
  const headers = { authorization: `Bearer ${token}` };
  const week = await request.post("/api/groups", {
    headers,
    data: {
      name: "Holiday Week",
      slug: "holiday-week",
      items: [
        { recipe: "plan-gingerbread", label: "Tue · bake ahead" },
        { recipe: "plan-sugar", label: "Wed · make ahead", scale: "2" },
        { recipe: "plan-spritz", label: "Wed · make ahead" },
        { group: PLAN, label: "Sat · start the cookie tray" },
      ],
    },
  });
  expect(week.status()).toBe(201);
}

/**
 * Sign in once the masthead's Sign In button has hydrated: under `next dev`
 * a plan page hydrates slowly enough that the click is lost (43p1's dev run).
 */
async function signInHydrated(page: Page) {
  await expectHydrated(
    page.getByRole("button", { name: "Sign In", exact: true }),
  );
  await signIn(page);
}

const rows = (page: Page) => page.getByTestId("group-item");
const rail = (page: Page) =>
  page.getByRole("complementary", { name: "What this plan needs" });

/** The browser's day has taken over: the countdown is up. */
async function counted(page: Page) {
  await expect(page.getByTestId("plan-countdown")).toHaveText("in 68 days", {
    timeout: 20_000,
  });
}

async function withBrowserList(page: Page, items: string[]) {
  await page.addInitScript((added) => {
    localStorage.setItem(
      "make-inventory-v1",
      JSON.stringify({ added, removed: [] }),
    );
  }, items);
}

test.describe("Meal plan: plan at home", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await writeTray(request, await createApiToken());
  });

  /*
   * Only the tests that read the countdown freeze the clock: under `next
   * dev` a frozen clock lost the Sign In click in every signed-in test
   * (43p1's dev run), and those tests never read the date.
   */
  test("rows in order, each with time, yield and a heads-up from its steps", async ({
    page,
  }) => {
    await page.clock.setFixedTime(SUNDAY);
    await page.goto(`/group/${PLAN}`);
    await counted(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cookie Tray" }),
    ).toBeVisible();
    await expect(page.getByTestId("group-kind")).toHaveText("Meal plan");
    await expect(
      page.getByRole("button", { name: "Plan", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).getByRole("link")).toHaveText([
      "Spritz Cookies",
      "Gingerbread Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);
    await expect(rows(page).nth(0)).toContainText(
      "1 h · 84 bite-size cookies · 6 ingredients",
    );
    await expect(rows(page).nth(1).getByTestId("plan-heads-up")).toHaveText(
      "Chill at least 3 h (keeps 3 days) · 9–10 min a batch at 350°F",
    );
    await expect(rows(page).nth(2).getByTestId("plan-heads-up")).toHaveText(
      "Chill at least 1 h (keeps 3 days) · 11–13 min a batch at 350°F · then 10 min in the freezer",
    );
    await expect(rows(page).nth(3)).toContainText(
      "5 ingredients · no time or yield set",
    );
    await expect(rows(page).nth(3).getByTestId("plan-heads-up")).toHaveText(
      "Chill 1–2 h · 11–12 min at 350°F · icing sets in 24 h",
    );

    /* The rail: what to make ahead, from the steps. */
    const ahead = rail(page).getByRole("region", { name: "Make ahead" });
    await expect(ahead).toContainText(
      "3 of 4 doughs chill. Mix them the day before; they keep 3 days.",
    );
    await expect(ahead.getByTestId("plan-make-ahead")).toHaveText(
      "Gingerbread Cookies≥ 3 hPeanut Butter Blossoms≥ 1 hIced Sugar Cookies1–2 h",
    );
    await expect(ahead).toContainText("All four bake at 350°F.");
    await expect(ahead).toContainText(
      "Iced Sugar Cookies: icing sets in 24 h.",
    );

    /* A guest reads: no Save, no scale select, no More, no shopping list. */
    await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
    await expect(page.getByLabel(/^Scale for/)).toHaveCount(0);
    await expect(
      rail(page).getByRole("region", { name: "Shopping list" }),
    ).toHaveCount(0);

    /* The masthead says where the reader is: in Plans, not on its page. */
    await expect(
      page
        .getByRole("banner")
        .getByRole("link", { name: "Plans", exact: true }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("From your shelf judges the plan against this browser's list", async ({
    page,
  }) => {
    await withBrowserList(page, [
      "unsalted butter",
      "granulated sugar",
      "eggs",
      "all-purpose flour",
      "vanilla extract",
      "molasses",
      "ground ginger",
    ]);
    await page.goto(`/group/${PLAN}`);
    const shelf = rail(page).getByRole("region", { name: "From your shelf" });
    const stats = shelf.getByTestId("plan-shelf-stats");
    await expect(stats).toBeVisible({ timeout: 20_000 });
    /* Some are ready from that list; the others are short of an extract or a kiss. */
    await expect(stats.getByRole("definition").first()).toHaveText(/^[1-3]$/);
    await expect(shelf.getByRole("list", { name: "Missing" })).toBeVisible();
    await expect(
      shelf.getByRole("link", { name: "Open in Make" }),
    ).toHaveAttribute("href", `/make?q=${encodeURIComponent(`group:${PLAN}`)}`);
  });

  test("signed in: reorder and scale save together, as one commit", async ({
    page,
    initializeContentGit,
    getContentGitLog,
  }) => {
    await initializeContentGit();
    await page.goto(`/group/${PLAN}`);
    await signInHydrated(page);
    await expect(page).toHaveURL(new RegExp(`/group/${PLAN}$`));

    const menu = page.getByRole("button", {
      name: "Move or remove Spritz Cookies",
    });
    await expectHydrated(menu);
    await menu.click();
    await page.getByRole("button", { name: "Move down" }).click();
    await chooseOption(
      page,
      page.getByLabel("Scale for Gingerbread Cookies: 1×"),
      "2×",
    );

    const bar = page.getByTestId("plan-save-bar");
    await expect(bar).toContainText("2 changes · not saved");
    /* Nothing written yet: the add field waits for the Save. */
    await expect(
      page.getByPlaceholder("Add a recipe or a plan by name"),
    ).toBeDisabled();
    await expect(rows(page).getByRole("link")).toHaveText([
      "Gingerbread Cookies",
      "Spritz Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);

    await bar.getByRole("button", { name: "Save" }).click();
    await expect(bar).toHaveCount(0);
    await page.reload();
    await expect(rows(page).getByRole("link")).toHaveText([
      "Gingerbread Cookies",
      "Spritz Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);
    await expect(rows(page).nth(0).getByTestId("group-item-scale")).toHaveText(
      "Scale 2×",
    );
    await expect(rows(page).nth(0).getByRole("link")).toHaveAttribute(
      "href",
      "/recipe/plan-gingerbread?scale=2",
    );
    await expect(rows(page).nth(0)).toContainText("48 four-inch cookies at 2×");
    expect((await getContentGitLog())[0]).toBe(`Set items on group: ${PLAN}`);
  });

  test("signed in: a Save over a plan changed meanwhile writes nothing", async ({
    page,
    request,
    createApiToken,
  }) => {
    await page.goto(`/group/${PLAN}`);
    await signInHydrated(page);
    await expect(page).toHaveURL(new RegExp(`/group/${PLAN}$`));
    const menu = page.getByRole("button", {
      name: "Move or remove Spritz Cookies",
    });
    await expectHydrated(menu);
    await menu.click();
    await page.getByRole("button", { name: "Move down" }).click();
    const bar = page.getByTestId("plan-save-bar");
    await expect(bar).toContainText("1 change · not saved");

    /* Another writer adds a row while the draft is open. */
    const added = await request.post(`/api/group/${PLAN}/items`, {
      headers: { authorization: `Bearer ${await createApiToken()}` },
      data: { recipe: "plan-spritz", label: "Again" },
    });
    expect(added.status()).toBe(200);

    await bar.getByRole("button", { name: "Save" }).click();
    await expect(
      page
        .getByRole("region", { name: "In this plan, in order" })
        .getByRole("alert"),
    ).toHaveText("The plan changed — reload to see it.");
    await page.reload();
    await expect(rows(page).getByRole("link")).toHaveText([
      "Spritz Cookies",
      "Gingerbread Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
      "Spritz Cookies",
    ]);
  });

  test("signed in: Try to merge shows both sides and saves the merge (46h)", async ({
    page,
    initializeContentGit,
    getContentGitLog,
  }) => {
    await initializeContentGit();
    await page.goto(`/group/${PLAN}`);
    await signInHydrated(page);
    await expect(page).toHaveURL(new RegExp(`/group/${PLAN}$`));
    const scaleA = page.getByLabel("Scale for Gingerbread Cookies: 1×");
    await expectHydrated(scaleA);

    /* A second tab scales the gingerbread to 2× and saves first. */
    const other = await page.context().newPage();
    await other.goto(`/group/${PLAN}`);
    const scaleB = other.getByLabel("Scale for Gingerbread Cookies: 1×");
    await expectHydrated(scaleB);
    await chooseOption(other, scaleB, "2×");
    const barB = other.getByTestId("plan-save-bar");
    await barB.getByRole("button", { name: "Save" }).click();
    await expect(barB).toHaveCount(0);
    await other.close();

    /* This tab, opened before that Save: 3× and Spritz moved down. */
    await chooseOption(page, scaleA, "3×");
    await page
      .getByRole("button", { name: "Move or remove Spritz Cookies" })
      .click();
    await page.getByRole("button", { name: "Move down" }).click();
    const bar = page.getByTestId("plan-save-bar");
    await expect(bar).toContainText("2 changes · not saved");
    await bar.getByRole("button", { name: "Save" }).click();
    const list = page.getByRole("region", { name: "In this plan, in order" });
    await expect(list.getByRole("alert")).toHaveText(
      "The plan changed — reload to see it.",
    );

    await list.getByRole("button", { name: "Try to merge" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Merge with the stored plan",
    });
    await expect(dialog.getByTestId("plan-merge-theirs")).toContainText(
      "Gingerbread Cookies: scale 1× → 2×",
    );
    const mine = dialog.getByTestId("plan-merge-mine");
    await expect(mine).toContainText("Gingerbread Cookies: scale 1× → 3×");
    await expect(mine).toContainText("Reordered the rows");
    /* Both scaled it: the merge asks which to keep before it saves. */
    const conflict = dialog.getByRole("group", {
      name: "Gingerbread Cookies: scale",
    });
    const saveMerged = dialog.getByRole("button", { name: "Save merged" });
    await expect(saveMerged).toBeDisabled();
    await conflict.getByLabel("Yours: 3×").check();
    await saveMerged.click();
    await expect(dialog).toHaveCount(0);
    /* The trigger went with the error: focus lands on the list's heading. */
    await expect(
      list.getByRole("heading", { name: "In order", exact: true }),
    ).toBeFocused();

    await expect(rows(page).getByRole("link")).toHaveText([
      "Gingerbread Cookies",
      "Spritz Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);
    await expect(
      page.getByLabel("Scale for Gingerbread Cookies: 3×"),
    ).toBeVisible();
    await expect(list.getByRole("alert")).toHaveCount(0);
    const log = await getContentGitLog();
    expect(log.slice(0, 2)).toEqual([
      `Set items on group: ${PLAN}`,
      `Set items on group: ${PLAN}`,
    ]);
  });

  test("signed in: Undo drops the draft, and Add appends a row", async ({
    page,
  }) => {
    await page.goto(`/group/${PLAN}`);
    await signInHydrated(page);
    const menu = page.getByRole("button", {
      name: "Move or remove Iced Sugar Cookies",
    });
    await expectHydrated(menu);
    await menu.click();
    await page.getByRole("button", { name: "Remove from the plan" }).click();
    await expect(rows(page)).toHaveCount(3);
    await page
      .getByTestId("plan-save-bar")
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(rows(page)).toHaveCount(4);

    const add = page.getByPlaceholder("Add a recipe or a plan by name");
    await add.fill("Gin");
    await page
      .getByRole("list", { name: "Matches" })
      .getByRole("button", { name: /Gin/ })
      .first()
      .click();
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByText(/^Added /)).toBeVisible();
  });

  test("signed in: More holds Edit, Feature and Delete", async ({ page }) => {
    await page.goto(`/group/${PLAN}`);
    await signInHydrated(page);
    const more = page.getByRole("button", { name: "More", exact: true });
    await expectHydrated(more);
    await more.click();
    const list = page.getByRole("list", { name: "More for this plan" });
    await expect(list.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/group/${PLAN}/edit`,
    );
    await expect(list.getByRole("link", { name: "Feature" })).toHaveAttribute(
      "href",
      `/featured-recipe/new?group=${PLAN}`,
    );
    await list.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Delete this plan?");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("Open in cook view opens the recipe's cook view", async ({ page }) => {
    await page.goto(`/group/${PLAN}?mode=cook`);
    const open = page.getByRole("link", { name: "Open in cook view" });
    await expect(open).toHaveAttribute("href", "/recipe/plan-spritz?cook=1");
    await open.click();
    await expect(page.getByRole("dialog", { name: /Cook view/ })).toBeVisible({
      timeout: 20_000,
    });
    /* Closing it drops the parameter, so a reload stays on the page. */
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/recipe\/plan-spritz$/);
  });

  test("no WCAG 2.2 violations in Plan, light and dark", async ({ page }) => {
    await page.clock.setFixedTime(SUNDAY);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/group/${PLAN}`);
      await counted(page);
      await expect(
        rail(page).getByRole("region", { name: "From your shelf" }),
      ).toContainText(/Nothing on your list yet|ready/, { timeout: 20_000 });
      await expectNoViolations(page);
    }
  });

  test("plan mode @visual", async ({ page }) => {
    await page.clock.setFixedTime(SUNDAY);
    await page.goto(`/group/${PLAN}`);
    await counted(page);
    await expect(
      rail(page).getByRole("region", { name: "From your shelf" }),
    ).toContainText("Nothing on your list yet", { timeout: 20_000 });
    await snapshotPage(page, "plan-page.png");
  });
});

test.describe("Meal plan: the shopping list panel", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData("shopping");
    await initializeContentGit();
  });

  test("puts the plan on the list, says how much, and takes it off", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/group/week-of-oct-19");
    await signInHydrated(page);
    const panel = rail(page).getByRole("region", { name: "Shopping list" });
    await expect(panel).toContainText("Not on your shopping list");
    await expect(page.getByTestId("add-group-to-shopping")).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 30_000 },
    );
    await panel.getByRole("button", { name: "Add to shopping list" }).click();
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      "12 items added",
    );
    await expect(panel).toContainText("It's on your list now.");

    await page.reload();
    await expect(panel.getByTestId("plan-shopping-summary")).toHaveText(
      /^This plan is on your list: 12 lines, merged into \d+ rows\. None ticked yet\.$/,
    );
    await panel.getByRole("button", { name: "Take it off the list" }).click();
    await panel.getByRole("button", { name: "Take them off" }).click();
    await expect(panel).toContainText("Not on your shopping list");
    expect((await getContentGitLog())[0]).toBe(
      "Update shopping list: -Week of Oct 19 (12 items)",
    );
  });
});

test.describe("Meal plan: cook through it @mobile", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    const token = await createApiToken();
    await writeTray(request, token);
    await writeWeek(request, token);
    await page.clock.setFixedTime(SUNDAY);
  });

  test("a phone opens on Cook: up next, mark made, the ticks stay", async ({
    page,
  }) => {
    await page.goto(`/group/${PLAN}`);
    const cook = page.getByRole("button", { name: "Cook", exact: true });
    await expect(cook).toHaveAttribute("aria-pressed", "true");
    const next = page.getByTestId("plan-up-next");
    await expect(next).toContainText("Up next · 1 of 4");
    await expect(next).toContainText("Spritz Cookies");
    await expect(page.getByTestId("plan-made-count")).toHaveText("0 of 4 made");

    await next.getByRole("button", { name: "Mark made" }).click();
    await expect(page.getByTestId("plan-made-count")).toHaveText("1 of 4 made");
    await expect(next).toContainText("Gingerbread Cookies");
    await expect(next).toContainText(
      "Step 2: “Divide the dough, wrap each half and chill for at least 3 hours or up to 3 days.”",
    );
    await expect(
      page.getByRole("region", { name: "Made" }).getByRole("link"),
    ).toHaveText(["Spritz Cookies"]);

    /* Ticks stay on this phone. */
    await page.reload();
    await expect(page.getByTestId("plan-made-count")).toHaveText("1 of 4 made");
    await page.getByRole("button", { name: "Unmark Spritz Cookies" }).click();
    await expect(page.getByTestId("plan-made-count")).toHaveText("0 of 4 made");

    /* The rows under the list: shelf and make ahead. */
    await page.getByRole("button", { name: /Make ahead/ }).click();
    await expect(page.getByTestId("plan-make-ahead")).toBeVisible();

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
  });

  test("a labelled week cooks by day, and a sub-plan opens in place", async ({
    page,
  }) => {
    await page.goto("/group/holiday-week");
    await expect(page.getByTestId("group-item-label")).toHaveText([
      "Tue · bake ahead",
      "Wed · make ahead",
      "Sat · start the cookie tray",
    ]);
    await expect(
      page.getByRole("link", { name: /Cook Gingerbread Cookies/ }),
    ).toHaveAttribute("href", "/recipe/plan-gingerbread?cook=1");
    await expect(rows(page).nth(1)).toContainText("2×");

    const sub = page.getByRole("button", { name: "Show the plan's recipes" });
    await expectHydrated(sub);
    await sub.click();
    await expect(
      page.getByRole("list", { name: "In Cookie Tray" }).getByRole("link"),
    ).toHaveText([
      "Spritz Cookies",
      "Gingerbread Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);
    await expect(page.getByText("the sub-plan counts as one")).toBeVisible();
  });

  test("no WCAG 2.2 violations in Cook", async ({ page }) => {
    /* Tall enough not to scroll: axe calls a target under the pinned tab
     * bar "partially obscured" depending on where the page stopped (42-Tg5). */
    await page.setViewportSize({ width: 393, height: 2400 });
    await page.goto(`/group/${PLAN}`);
    await expect(page.getByTestId("plan-up-next")).toBeVisible();
    await expectNoViolations(page);
  });

  test("cook mode @visual", async ({ page }) => {
    /* A viewport capture, tall enough for the page: a full-page one draws the
     * pinned tab bar mid-page (42c1's recipe-mobile trap). */
    await page.setViewportSize({ width: 393, height: 1600 });
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify(["recipe:plan-spritz"]));
    }, `plan-made:${PLAN}`);
    await page.goto(`/group/${PLAN}`);
    await expect(page.getByTestId("plan-made-count")).toHaveText("1 of 4 made");
    await counted(page);
    await snapshotPage(page, "plan-cook.png", { fullPage: false });
  });
});

/** The run sheet's desktop table (43p2). */
const sheetRows = (page: Page) =>
  page.getByTestId("sheet-table").getByTestId("sheet-row");

test.describe("Meal plan: the run sheet", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await writeTray(request, await createApiToken());
  });

  test("the hero counts, and the table reads each recipe's steps", async ({
    page,
  }) => {
    await page.goto(`/group/${PLAN}?mode=sheet`);
    await expect(
      page.getByRole("button", { name: "Run sheet", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const sheet = page.getByTestId("plan-run-sheet");

    /* 4 recipes · 3 doughs chill · one oven · 84 + 24 + 24 cookies and the
     * sugar cookies, whose yield is not set. */
    const stats = sheet.getByTestId("sheet-stats");
    await expect(stats.getByRole("term")).toHaveText([
      "recipes",
      "doughs chill",
      /^one oven/,
      "cookies + 1 more",
    ]);
    await expect(stats.getByRole("definition")).toHaveText([
      "4",
      "3",
      /^350°/,
      "132",
    ]);

    await expect(sheetRows(page)).toHaveCount(4);
    await expect(sheetRows(page).getByRole("link")).toHaveText([
      "Spritz Cookies",
      "Gingerbread Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);
    await expect(sheetRows(page).getByTestId("sheet-ahead")).toHaveText([
      "chill not set",
      "chill ≥ 3 hkeeps 3 days",
      "chill ≥ 1 hkeeps 3 days",
      "chill 1–2 hicing sets in 24 h",
    ]);
    /* The bars run to the longest bake, the blossoms' 13 minutes. */
    await expect(
      page.getByRole("columnheader", { name: /Baking day · 350°F/ }),
    ).toContainText("0–13 min");
    await expect(sheetRows(page).getByTestId("sheet-bake")).toHaveText([
      "7–9 min a batch",
      "9–10 min a batch",
      "11–13 min a batch, then 10 min in the freezer",
      "11–12 min",
    ]);
    await expect(sheetRows(page).getByTestId("sheet-makes")).toHaveText([
      "84bite-size cookies",
      "24four-inch cookies",
      "24cookies",
      "—not set",
    ]);

    /* A guest: no docket, the shelf is there. */
    await expect(sheet.getByTestId("sheet-docket")).toHaveCount(0);
    await expect(sheet.getByTestId("sheet-shelf")).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Edit the sheet" }),
    ).toHaveCount(0);
  });

  test("mixed and made are separate ticks, and both stay", async ({ page }) => {
    await page.goto(`/group/${PLAN}?mode=sheet`);
    const mixed = page.getByRole("button", {
      name: "Mark Gingerbread Cookies dough mixed",
    });
    await expectHydrated(mixed);
    await mixed.click();
    await expect(
      page.getByRole("button", { name: "Unmark Gingerbread Cookies dough" }),
    ).toHaveAttribute("aria-pressed", "true");
    /* Spritz's steps give no chill: nothing to mix ahead. */
    await expect(
      page.getByRole("button", { name: /Spritz Cookies dough mixed/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Mark Gingerbread Cookies made" }),
    ).toHaveAttribute("aria-pressed", "false");

    await page
      .getByRole("button", { name: "Mark Spritz Cookies made" })
      .click();
    await expect(sheetRows(page).nth(0)).toHaveAttribute("data-made", "true");

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Unmark Gingerbread Cookies dough" }),
    ).toBeVisible();
    await expect(sheetRows(page).nth(0)).toHaveAttribute("data-made", "true");
    const stored = await page.evaluate((slug) => {
      return {
        made: localStorage.getItem(`plan-made:${slug}`),
        mixed: localStorage.getItem(`plan-mixed:${slug}`),
      };
    }, PLAN);
    expect(stored).toEqual({
      made: JSON.stringify(["recipe:plan-spritz"]),
      mixed: JSON.stringify(["recipe:plan-gingerbread"]),
    });

    /* Start the bake: Cook mode, where Spritz is already made. */
    await page.getByRole("button", { name: "Start the bake" }).click();
    await expect(
      page.getByRole("button", { name: "Cook", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("plan-made-count")).toHaveText("1 of 4 made");
  });

  test("a sub-plan row is a plan of its own, counted in the hero", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writeWeek(request, await createApiToken());
    await page.goto("/group/holiday-week?mode=sheet");
    const stats = page.getByTestId("sheet-stats");
    await expect(stats.getByRole("term").first()).toHaveText(
      "recipes + 1 plan",
    );
    await expect(stats.getByRole("definition").first()).toHaveText("3");
    /* Each row is named by its recipe (the row header). */
    await expect(sheetRows(page).getByRole("rowheader")).toContainText([
      "Gingerbread Cookies",
      "Iced Sugar Cookies",
      "Spritz Cookies",
      "Cookie Tray",
    ]);
    await expect(
      sheetRows(page).nth(3).getByRole("link", { name: "Its own run sheet" }),
    ).toHaveAttribute("href", `/group/${PLAN}?mode=sheet`);
  });

  test("a plan with nothing to bake or chill has a run sheet too, its columns not set (46h)", async ({
    page,
    request,
    createApiToken,
  }) => {
    const headers = { authorization: `Bearer ${await createApiToken()}` };
    const soup = await request.post("/api/recipes", {
      headers,
      data: {
        name: "Lentil Soup",
        slug: "plan-soup",
        ingredients: ["1 cup lentils", "4 cups stock"],
        instructions: [
          { text: "Simmer the lentils in the stock for 25 minutes." },
        ],
      },
    });
    expect(soup.status()).toBe(201);
    const plan = await request.post("/api/groups", {
      headers,
      data: {
        name: "Soup Night",
        slug: "soup-night",
        items: [{ recipe: "plan-soup" }],
      },
    });
    expect(plan.status()).toBe(201);
    await page.goto("/group/soup-night?mode=sheet");
    /* 43-Dp2-1: offered on every plan; what the steps don't say is "not set". */
    await expect(
      page.getByRole("button", { name: "Run sheet", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const table = page.getByTestId("sheet-table");
    await expect(table).toContainText("Lentil Soup");
    await expect(table).toContainText("chill not set");
    await expect(table).toContainText("bake not set");
  });

  test("signed in: the docket shows the plan's lines by aisle", async ({
    page,
    initializeContentGit,
  }) => {
    await initializeContentGit();
    await page.goto(`/group/${PLAN}`);
    await signInHydrated(page);
    await expect(page).toHaveURL(new RegExp(`/group/${PLAN}$`));
    await page.goto(`/group/${PLAN}?mode=sheet`);
    const sheet = page.getByTestId("plan-run-sheet");
    await expect(
      sheet.getByRole("button", { name: "Edit the sheet" }),
    ).toBeVisible();
    const panel = sheet.getByRole("region", { name: "Shopping list" });
    await expect(panel).toContainText("Not on your shopping list");
    await expect(page.getByTestId("add-group-to-shopping")).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 30_000 },
    );
    await panel.getByRole("button", { name: "Add to shopping list" }).click();
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      "21 items added",
    );

    await page.reload();
    const docket = sheet.getByTestId("sheet-docket");
    await expect(docket).toContainText(/21 lines · \d+ rows · 0 ticked/);
    await expect(docket.getByRole("heading")).toHaveText("On the list");
    const aisles = docket.getByTestId("sheet-aisles");
    await expect(aisles.getByRole("term").first()).toBeVisible();
    /* Butter, flour and an egg are in every recipe. */
    await expect(docket.getByTestId("sheet-big-ones")).toContainText(
      /^The big ones: .*flour/,
    );
    await expect(docket.getByTestId("sheet-big-ones")).toContainText("butter");
    await expect(
      docket.getByRole("link", { name: "Open the list" }),
    ).toHaveAttribute("href", "/shopping");

    await sheet.getByRole("button", { name: "Edit the sheet" }).click();
    await expect(
      page.getByRole("button", { name: "Plan", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("no WCAG 2.2 violations on the run sheet, light and dark", async ({
    page,
  }) => {
    await page.clock.setFixedTime(SUNDAY);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/group/${PLAN}?mode=sheet`);
      await counted(page);
      await expect(page.getByTestId("sheet-shelf")).toContainText(
        /Nothing on your list yet|ready/,
        { timeout: 20_000 },
      );
      await expectNoViolations(page);
    }
  });

  test("run sheet @visual", async ({ page }) => {
    await page.clock.setFixedTime(SUNDAY);
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify(["recipe:plan-gingerbread"]));
    }, `plan-mixed:${PLAN}`);
    await page.goto(`/group/${PLAN}?mode=sheet`);
    await counted(page);
    await expect(page.getByTestId("sheet-shelf")).toContainText(
      "Nothing on your list yet",
      { timeout: 20_000 },
    );
    await expect(
      page.getByRole("button", { name: "Unmark Gingerbread Cookies dough" }),
    ).toBeVisible();
    await snapshotPage(page, "plan-sheet.png");
  });
});

test.describe("Meal plan: the run sheet on a phone @mobile", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await writeTray(request, await createApiToken());
    await page.clock.setFixedTime(SUNDAY);
  });

  test("day before, then baking day, with no sideways scroll", async ({
    page,
  }) => {
    await page.goto(`/group/${PLAN}?mode=sheet`);
    const before = page.getByRole("region", { name: "Day before" });
    await expect(before.getByRole("link")).toHaveText([
      "Gingerbread Cookies",
      "Peanut Butter Blossoms",
      "Iced Sugar Cookies",
    ]);
    await expect(before).toContainText(
      "Doughs keep 3 days. Chill not set: Spritz Cookies.",
    );
    const mixed = before.getByRole("button", {
      name: "Mark Peanut Butter Blossoms dough mixed",
    });
    await expectHydrated(mixed);
    await mixed.click();
    await expect(
      before.getByRole("button", {
        name: "Unmark Peanut Butter Blossoms dough",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    const baking = page.getByRole("region", { name: "Baking day" });
    await expect(baking.getByRole("listitem")).toHaveCount(4);
    await expect(baking.getByRole("listitem").nth(3)).toContainText(
      "11–12 min · icing sets in 24 h",
    );
    await expect(baking.getByRole("listitem").nth(3)).toContainText("not set");

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
  });

  test("no WCAG 2.2 violations on the phone's run sheet", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 2600 });
    await page.goto(`/group/${PLAN}?mode=sheet`);
    await expect(page.getByTestId("sheet-shelf")).toContainText(
      /Nothing on your list yet|ready/,
      { timeout: 20_000 },
    );
    await expectNoViolations(page);
  });

  test("run sheet on a phone @visual", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 2000 });
    await page.goto(`/group/${PLAN}?mode=sheet`);
    await counted(page);
    await expect(page.getByTestId("sheet-shelf")).toContainText(
      "Nothing on your list yet",
      { timeout: 20_000 },
    );
    await snapshotPage(page, "plan-sheet.png", { fullPage: false });
  });
});

test.describe("Plans: the list", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    const token = await createApiToken();
    await writeTray(request, token);
    await writeWeek(request, token);
    await page.clock.setFixedTime(SUNDAY);
  });

  test("a row per plan: what it is for, its counts, Plan and Cook", async ({
    page,
  }) => {
    await page.goto("/groups");
    await expect(page.getByText("2 plans · newest first")).toBeVisible();
    const cards = page.getByTestId("group-list").getByRole("listitem");
    await expect(cards).toHaveCount(2);
    const tray = cards.filter({ hasText: "Cookie Tray" });
    await expect(tray).toContainText("for Christmas", { timeout: 20_000 });
    await expect(tray.getByTestId("plan-countdown")).toHaveText("in 68 days");
    await expect(tray.getByTestId("group-item-count")).toHaveText("4 recipes");
    await expect(
      tray.getByRole("link", { name: "Cook Cookie Tray" }),
    ).toHaveAttribute("href", `/group/${PLAN}?mode=cook`);
    /* One page of plans: no lone pagination icon, and no New plan for a guest. */
    await expect(page.getByRole("link", { name: "Go to home" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New plan" })).toHaveCount(0);

    await tray.getByRole("link", { name: "Cook Cookie Tray" }).click();
    await expect(
      page.getByRole("button", { name: "Cook", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the plans list @visual", async ({ page }) => {
    await page.goto("/groups");
    await expect(page.getByTestId("plan-countdown").first()).toBeVisible({
      timeout: 20_000,
    });
    await snapshotPage(page, "plans-list.png");
  });
});
