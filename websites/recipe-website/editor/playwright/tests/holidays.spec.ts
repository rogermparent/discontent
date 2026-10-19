import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { expectNoViolations } from "../support/a11y";
import { expectHydrated } from "../support/hydration";
import { snapshotPage } from "../support/visual";

/*
 * 42e: `/holidays` (the almanac) and `/holidays/<slug>` (one holiday's
 * menu), against `drinks-bar` — Halloween on the Vodka Sour (vodka, sour)
 * and on Hand Pies (tagged `dessert`, no drink), Christmas on the Chamomile
 * Collins (vodka, collins). `withVocabulary` adds what the fixture lacks,
 * through the API: a `course` root with Desserts (so Hand Pies has a
 * course), an undated holiday (Fall Favorites, on Hand Pies) and an alias
 * of Christmas ("Xmas").
 *
 * Every test freezes the browser's clock on Sunday 18 October 2026, noon:
 * the pages count down on the browser's day, so 13 days to Halloween and 68
 * to Christmas.
 */

const SUNDAY = new Date(2026, 9, 18, 12);

async function withVocabulary(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const headers = { authorization: `Bearer ${token}` };
  for (const data of [
    { label: "Course" },
    { label: "Desserts", slug: "dessert", parent: "course" },
    { label: "Fall Favorites", parent: "holidays" },
  ]) {
    const created = await request.post("/api/taxonomies/tag", {
      headers,
      data,
    });
    expect(created.status()).toBe(201);
  }
  const assigned = await request.post(
    "/api/taxonomies/tag/fall-favorites/assign",
    { headers, data: { add: ["hand-pies"] } },
  );
  expect(assigned.status()).toBe(200);
  const aliased = await request.patch("/api/taxonomies/tag/christmas", {
    headers,
    data: { aliases: ["Xmas"] },
  });
  expect(aliased.status()).toBe(200);
}

/** The countdowns are up: the browser's day has taken over. */
async function counted(page: Page) {
  await expect(page.getByTestId("almanac-countdown").first()).toBeVisible({
    timeout: 20_000,
  });
}

async function menuReady(page: Page) {
  await expect(page.getByTestId("holiday-hero")).toContainText("days to", {
    timeout: 20_000,
  });
}

test.describe("Holidays", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await withVocabulary(request, await createApiToken());
    await page.clock.setFixedTime(SUNDAY);
  });

  test("the almanac: soonest first with countdowns, undated last", async ({
    page,
  }) => {
    await page.goto("/holidays");
    await counted(page);

    const next = page.getByTestId("almanac-next");
    await expect(next.getByRole("heading", { level: 3 })).toHaveText([
      "Halloween",
      "Christmas",
    ]);
    const countdowns = next.getByTestId("almanac-countdown");
    await expect(countdowns.nth(0)).toHaveText(/^13\s*days to\s*Halloween$/);
    await expect(countdowns.nth(1)).toHaveText(/^68\s*days to\s*Christmas$/);
    const cards = next.getByTestId("almanac-card");
    await expect(cards.nth(0)).toContainText("Sat 31 Oct · 1 dish · 1 drink");
    await expect(cards.nth(1)).toContainText("Fri 25 Dec · 1 drink");
    await expect(cards.nth(0)).toContainText("Vodka Sour");

    /* Fall Favorites has no date: after the dated ones, no countdown. */
    const undated = page.getByTestId("almanac-undated");
    await expect(undated.getByTestId("almanac-row")).toHaveText([
      /Fall Favorites\s*1 dish/,
    ]);
    await expect(page.getByTestId("almanac-count")).toHaveText("3 holidays");

    /* The ruler: a dot per dated holiday, ticks through to next October. */
    const ruler = page.getByTestId("almanac-ruler");
    await expect(ruler.getByTestId("almanac-dot")).toHaveText([
      "Halloween",
      "Christmas",
    ]);
    await expect(ruler).toContainText("Jan 2027");

    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Holidays" }),
    ).toHaveAttribute("href", "/holidays");

    await next.getByRole("link", { name: "Halloween", exact: true }).click();
    await expect(page).toHaveURL(/\/holidays\/halloween$/);
    await expect(page.getByTestId("holiday-hero")).toHaveText(
      "13 days to Halloween.",
    );
  });

  test("a menu: dishes by course, drinks by style, the next holiday", async ({
    page,
  }) => {
    await page.goto("/holidays/halloween");
    await menuReady(page);
    await expect(page.getByTestId("holiday-hero")).toHaveText(
      "13 days to Halloween.",
    );
    await expect(page.getByTestId("holiday-counts")).toHaveText(
      "1 dish · 1 drink",
    );
    await expect(
      page.getByTestId("holiday-lead").getByRole("link"),
    ).toHaveCount(2);

    const groups = page.getByTestId("menu-group");
    await expect(groups).toHaveCount(2);
    await expect(
      page.getByRole("heading", { level: 3, name: "Dishes" }),
    ).toBeVisible();
    await expect(groups.nth(0).getByRole("heading")).toHaveText("Desserts");
    await expect(groups.nth(0).getByRole("link")).toHaveText("Hand Pies");
    await expect(groups.nth(1).getByRole("heading")).toHaveText("Sour");
    /* The drink's base sits at the end of its dotted line. */
    await expect(groups.nth(1).getByRole("link")).toHaveText(
      /^Vodka Sour\s*Vodka$/,
    );

    await expect(page.getByTestId("holiday-then")).toHaveText(
      /Then Christmas, in 68 days — 1 drink\./,
    );
    await expect(page.getByTestId("holiday-then")).toHaveAttribute(
      "href",
      "/holidays/christmas",
    );
    await expect(page.getByTestId("holiday-make-link")).toHaveAttribute(
      "href",
      `/make?q=${encodeURIComponent("tag:halloween")}`,
    );
  });

  test("the kind menu narrows the menu and the Make link, in the URL", async ({
    page,
  }) => {
    await page.goto("/holidays/halloween");
    await menuReady(page);
    const kind = page.getByTestId("holiday-kind");
    await expectHydrated(kind);
    await expect(kind).toHaveText("recipes");
    await expect(
      page.getByRole("heading", { level: 2, name: "On the menu: recipes" }),
    ).toBeVisible();

    await kind.click();
    const menu = page.getByTestId("holiday-kind-menu");
    await expect(menu.getByRole("menuitemradio")).toHaveText([
      "recipes 2",
      "dishes 1",
      "drinks 1",
    ]);
    await menu.getByRole("menuitemradio", { name: /^drinks/ }).click();
    await expect(page).toHaveURL(/\/holidays\/halloween\?kind=drinks$/);
    await expect(kind).toHaveText("drinks");
    await expect(kind).toBeFocused();
    const groups = page.getByTestId("menu-group");
    await expect(groups).toHaveCount(1);
    await expect(groups.getByRole("heading")).toHaveText("Sour");
    await expect(page.getByTestId("holiday-make-link")).toHaveAttribute(
      "href",
      `/make?q=${encodeURIComponent("tag:drink tag:halloween")}`,
    );

    /* Shareable: a fresh load of the URL shows the same kind. */
    await page.reload();
    await menuReady(page);
    await expect(page.getByTestId("holiday-kind")).toHaveText("drinks");
    await expect(page.getByTestId("menu-group")).toHaveCount(1);

    /* By keyboard: open, move to dishes, choose. */
    const again = page.getByTestId("holiday-kind");
    await expectHydrated(again);
    await again.focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitemradio", { name: /^drinks/ }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?kind=dishes$/);
    await expect(page.getByTestId("menu-group")).toHaveText([/Desserts/]);
    await expect(page.getByTestId("holiday-make-link")).toHaveAttribute(
      "href",
      `/make?q=${encodeURIComponent("-tag:drink tag:halloween")}`,
    );
  });

  test("a non-holiday is a 404, an alias of one sends you on", async ({
    page,
  }) => {
    const vodka = await page.goto("/holidays/vodka");
    expect(vodka?.status()).toBe(404);
    const missing = await page.goto("/holidays/not-a-holiday");
    expect(missing?.status()).toBe(404);

    await page.goto("/holidays/xmas");
    await page.waitForURL((url) => url.pathname === "/holidays/christmas");
    await expect(page.getByTestId("holiday-hero")).toContainText("Christmas.");
  });

  test("term pages link to the menu and the almanac", async ({ page }) => {
    await page.goto("/tags/halloween");
    await expect(page.getByTestId("term-holiday-link")).toHaveAttribute(
      "href",
      "/holidays/halloween",
    );
    await page.goto("/tags/holidays");
    await expect(page.getByTestId("term-holiday-link")).toHaveAttribute(
      "href",
      "/holidays",
    );
    await page.goto("/tags/vodka");
    await expect(page.getByTestId("term-holiday-link")).toHaveCount(0);
  });

  for (const mode of ["light", "dark"] as const) {
    test(`both pages have no WCAG 2.2 violations in ${mode} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/holidays");
      await counted(page);
      await expectNoViolations(page);
      await page.goto("/holidays/halloween");
      await menuReady(page);
      await expectNoViolations(page);
      await page.getByTestId("holiday-kind").click();
      await expect(page.getByTestId("holiday-kind-menu")).toBeVisible();
      await expectNoViolations(page);
    });
  }

  test("baselines", async ({ page }) => {
    await page.goto("/holidays");
    await counted(page);
    await snapshotPage(page, "holidays-almanac.png");
    await page.goto("/holidays/halloween");
    await menuReady(page);
    await snapshotPage(page, "holidays-menu.png");
  });
});

test.describe("Holidays, a long name at 360 px @mobile", () => {
  test("Thanksgiving's headline wraps rather than scrolls", async ({
    page,
    resetData,
    request,
    createApiToken,
  }) => {
    await resetData("drinks-bar");
    const headers = { authorization: `Bearer ${await createApiToken()}` };
    const created = await request.post("/api/taxonomies/tag", {
      headers,
      data: { label: "Thanksgiving", parent: "holidays" },
    });
    expect(created.status()).toBe(201);
    const assigned = await request.post(
      "/api/taxonomies/tag/thanksgiving/assign",
      { headers, data: { add: ["hand-pies"] } },
    );
    expect(assigned.status()).toBe(200);
    await page.clock.setFixedTime(SUNDAY);
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto("/holidays/thanksgiving");
    await expect(page.getByTestId("holiday-hero")).toHaveText(
      "39 days to Thanksgiving.",
      { timeout: 20_000 },
    );
    const sideways = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    expect(await sideways()).toBeLessThanOrEqual(0);
    await page.goto("/holidays");
    await counted(page);
    expect(await sideways()).toBeLessThanOrEqual(0);
  });
});

test.describe("Holidays @mobile", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await withVocabulary(request, await createApiToken());
    await page.clock.setFixedTime(SUNDAY);
  });

  /* Axe at phone width runs in accessibility.spec's phone sweep, which
   * measures target size with the tab bar released (41f). */
  test("both pages fit a phone", async ({ page }) => {
    const sideways = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    await page.goto("/holidays");
    await counted(page);
    /* The ruler is for wider screens; the cards say the same in order. */
    await expect(page.getByTestId("almanac-ruler")).toBeHidden();
    expect(await sideways()).toBeLessThanOrEqual(0);
    await snapshotPage(page, "holidays-almanac.png");

    await page.goto("/holidays/halloween");
    await menuReady(page);
    expect(await sideways()).toBeLessThanOrEqual(0);
    await snapshotPage(page, "holidays-menu.png");
  });
});
