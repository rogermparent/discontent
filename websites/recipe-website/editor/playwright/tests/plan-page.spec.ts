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
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await writeTray(request, await createApiToken());
    await page.clock.setFixedTime(SUNDAY);
  });

  test("rows in order, each with time, yield and a heads-up from its steps", async ({
    page,
  }) => {
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
      "Chill 1–2 h · 11–12 min a batch at 350°F · icing sets in 24 h",
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
    /* Gingerbread is ready; the rest are short of an extract, a kiss, sugar. */
    await expect(stats.getByRole("definition").first()).toHaveText("1");
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
    await signIn(page);
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

  test("signed in: Undo drops the draft, and Add appends a row", async ({
    page,
  }) => {
    await page.goto(`/group/${PLAN}`);
    await signIn(page);
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
    await signIn(page);
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
    await signIn(page);
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
    await page.goto(`/group/${PLAN}`);
    await expect(page.getByTestId("plan-up-next")).toBeVisible();
    await expectNoViolations(page);
  });

  test("cook mode @visual", async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify(["recipe:plan-spritz"]));
    }, `plan-made:${PLAN}`);
    await page.goto(`/group/${PLAN}`);
    await expect(page.getByTestId("plan-made-count")).toHaveText("1 of 4 made");
    await counted(page);
    await snapshotPage(page, "plan-cook.png");
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
