import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { expectNoViolations } from "../support/a11y";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { snapshotPage } from "../support/visual";

/*
 * 43t: `/tags` and the term pages as canvas B, "Narrow it down", draws them —
 * against `drinks-bar` (the bar's styles, method, spirits and families;
 * Halloween on the Vodka Sour and Hand Pies, Christmas on the Chamomile
 * Collins) plus, through the API, a `course` root with Desserts (Hand
 * Pies), two Collections — Syrups (the lavender syrup) and House recipes
 * (two drinks) — and a plan filed under Halloween.
 *
 * The clock is frozen on Sunday 18 October 2026, noon: Halloween is 13 days
 * off, Christmas 68.
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
    { label: "Syrups", slug: "syrup" },
    { label: "House recipes", slug: "house" },
  ]) {
    const created = await request.post("/api/taxonomies/tag", {
      headers,
      data,
    });
    expect(created.status()).toBe(201);
  }
  const assigned = await request.post("/api/taxonomies/tag/house/assign", {
    headers,
    data: { add: ["vodka-sour", "daiquiri"] },
  });
  expect(assigned.status()).toBe(200);
  const plan = await request.post("/api/groups", {
    headers,
    data: {
      name: "Halloween Party",
      slug: "halloween-party",
      kind: "meal-plan",
      tags: ["halloween"],
      items: ["vodka-sour", "hand-pies"],
    },
  });
  expect(plan.status()).toBe(201);
}

const column = (page: Page, group: string) =>
  page.locator(`[data-testid='tag-column'][data-group='${group}']`);

const rowText = async (page: Page, group: string) =>
  (await column(page, group).getByTestId("tag-row").allInnerTexts()).map(
    (text) => text.replace(/\s+/g, " ").trim(),
  );

const cards = (page: Page) => page.getByTestId("recipe-list").locator("> li");

test.describe("Tags board (43t)", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await withVocabulary(request, await createApiToken());
    await page.clock.setFixedTime(SUNDAY);
  });

  test("the shelves: food facets, collections, the bar's columns and families", async ({
    page,
  }) => {
    await page.goto("/tags");
    expect(await rowText(page, "course")).toEqual(["Desserts 1"]);
    expect(await rowText(page, "collections")).toEqual([
      "House recipes 2",
      "Syrups 1",
    ]);
    expect(await rowText(page, "style")).toEqual([
      "Highball 3",
      "Collins 1",
      "Sour 1",
    ]);
    expect(await rowText(page, "strength-method")).toEqual([
      "Zero-proof 2",
      "Shaken 1",
    ]);
    expect(await rowText(page, "spirit")).toEqual(["Vodka 2", "Gin 1"]);
    /* A drink's name is a family; an alias's carrier counts (Daiquiris). */
    await expect(page.getByTestId("tag-family")).toHaveText([
      "Daiquiri",
      "Gin and Tonic",
    ]);
    /* House recipes is drinks: the Drinks shelf says so too (Dt2). */
    await expect(page.getByTestId("tag-drink-collections")).toContainText(
      "House recipes 2",
    );
  });

  test("Holidays, soonest first, each to its menu", async ({ page }) => {
    await page.goto("/tags");
    const rows = page.getByTestId("tag-holiday");
    await expect(rows.first()).toContainText("13", { timeout: 20_000 });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Halloween");
    await expect(rows.nth(0)).toContainText("Sat 31 Oct · 2 recipes · 1 plan");
    await expect(rows.nth(0)).toHaveAttribute("href", "/holidays/halloween");
    await expect(rows.nth(1)).toContainText("68");
    await expect(rows.nth(1)).toContainText("Christmas");
    await expect(page.getByTestId("tag-almanac-link")).toHaveAttribute(
      "href",
      "/holidays",
    );
  });

  test("Combine hands two rows to search with a live count", async ({
    page,
  }) => {
    await page.goto("/tags");
    const highball = page.getByRole("button", {
      name: "Combine with Highball",
      exact: true,
    });
    await expectHydrated(highball);
    await highball.click();
    await page
      .getByRole("button", { name: "Combine with Zero-proof", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Combined: Highball", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const tokens = page.getByTestId("tag-combine-token");
    await expect(tokens).toHaveCount(2);
    await expect(tokens.first()).toContainText("style");
    const show = page.getByTestId("tag-combine-show");
    await expect(show).toHaveText(/Show 2 recipes/, { timeout: 20_000 });
    await expect(show).toHaveAttribute(
      "href",
      "/search?q=tag%3Ahighball%20tag%3Azero-proof",
    );
    await page.getByRole("button", { name: "Remove Zero-proof" }).click();
    await expect(show).toHaveText(/Show 3 recipes/);
    await page
      .getByRole("button", { name: "Combine with Zero-proof", exact: true })
      .click();
    await show.click();
    await page.waitForURL((url) => url.pathname === "/search");
    await expect(cards(page)).toHaveCount(2, { timeout: 20_000 });
  });

  test("Find a tag finds a term by an alias and opens it", async ({ page }) => {
    await page.goto("/tags");
    const find = page.getByTestId("tag-find");
    await expectHydrated(find);
    await expect(find).toHaveAttribute("placeholder", /names and aliases/);
    await find.fill("daiquiris");
    const option = page.getByRole("option", { name: /Daiquiri/ });
    await expect(option).toContainText("also Daiquiris");
    await expect(option).toContainText("Drinks ›");
    await find.press("Enter");
    await page.waitForURL((url) => url.pathname === "/tags/daiquiri");
  });

  test("a holiday's page: when, the menu, the plan, and Narrow in place", async ({
    page,
  }) => {
    await page.goto("/tags/halloween");
    await expect(page.getByTestId("term-count")).toHaveText(
      "2 recipes · 1 plan",
    );
    await expect(page.getByTestId("term-when")).toContainText("13", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("term-when")).toContainText("Sat 31 Oct");
    await expect(page.getByTestId("term-holiday-link")).toHaveAttribute(
      "href",
      "/holidays/halloween",
    );
    await expect(page.getByTestId("term-make-link")).toHaveAttribute(
      "href",
      "/make?q=tag%3Ahalloween",
    );
    await expect(
      page.getByTestId("group-list").getByRole("link", {
        name: /Halloween Party/,
      }),
    ).toBeVisible();
    /* A guest sees no editor actions and no pin slot. */
    await expect(page.getByTestId("term-actions")).toHaveCount(0);
    await expect(page.getByTestId("term-pin-slot")).toHaveCount(0);

    await expect(cards(page)).toHaveCount(2);
    /* The cards leave out the page's own tag. */
    await expect(
      page.getByTestId("recipe-list").getByRole("link", { name: "halloween" }),
    ).toHaveCount(0);

    const narrow = page.getByTestId("term-narrow");
    await expect(narrow.getByRole("heading")).toHaveText("Narrow Halloween");
    const desserts = narrow.getByRole("button", { name: /^Desserts/ });
    await expectHydrated(desserts);
    await desserts.click();
    await expect(desserts).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Hand Pies");
    await expect(page.getByTestId("term-list-count")).toHaveText("1 of 2");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(cards(page)).toHaveCount(2);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByTestId("term-list-row")).toHaveCount(2);
  });

  test("a signed-in editor gets the actions top right and the pin slot", async ({
    page,
  }) => {
    await page.goto("/tags/halloween");
    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible();
    await page.goto("/tags/halloween");
    const actions = page.getByTestId("term-actions");
    await expect(actions.getByRole("link")).toHaveText([
      "Feature",
      "Edit",
      "Add a narrower term",
    ]);
    await expect(page.getByTestId("term-pin-slot")).toContainText(
      "Nothing pinned yet",
    );
    await page.goto("/tags");
    await expect(
      page.getByRole("link", { name: "New term", exact: true }),
    ).toHaveAttribute("href", "/tags/new");
  });

  test("a root page: one section per narrower term, then Newest", async ({
    page,
  }) => {
    await page.goto("/tags/drink");
    await expect(page.getByTestId("term-count")).toHaveText(
      /^7 recipes · 7 narrower terms/,
    );
    const heads = page
      .getByTestId("root-section")
      .getByRole("heading", { level: 2 });
    await expect(heads.first()).toHaveText(/Highball\s*3/);
    await expect(page.getByTestId("root-section")).toHaveCount(7);
    const view = page.getByTestId("root-view");
    await expect(
      view.getByRole("button", { name: "By drinks", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("recipe-list")).toBeHidden();
    const newest = view.getByRole("button", { name: "Newest", exact: true });
    await expectHydrated(newest);
    await newest.click();
    await expect(page.getByTestId("recipe-list")).toBeVisible();
    await expect(page.getByTestId("root-section").first()).toBeHidden();
  });

  for (const mode of ["light", "dark"] as const) {
    test(`the board, a term page and a root page have no WCAG 2.2 violations in ${mode} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/tags");
      await expect(page.getByTestId("tag-holiday").first()).toContainText(
        "13",
        { timeout: 20_000 },
      );
      await expectNoViolations(page);
      await page.goto("/tags/halloween");
      await expect(page.getByTestId("term-when")).toContainText("13", {
        timeout: 20_000,
      });
      await expectNoViolations(page);
      await page.goto("/tags/drink");
      await expect(page.getByTestId("root-section").first()).toBeVisible();
      await expectNoViolations(page);
    });
  }

  test("baselines", async ({ page }) => {
    await page.goto("/tags");
    await expect(page.getByTestId("tag-holiday").first()).toContainText("13", {
      timeout: 20_000,
    });
    await snapshotPage(page, "tags-board.png");
    await page.goto("/tags/halloween");
    await expect(page.getByTestId("term-when")).toContainText("13", {
      timeout: 20_000,
    });
    await snapshotPage(page, "tags-term.png");
    await page.goto("/tags/drink");
    await expect(page.getByTestId("root-section").first()).toBeVisible();
    await snapshotPage(page, "tags-root.png");
  });
});

test.describe("Tags board @mobile", () => {
  test.beforeEach(async ({ page, resetData, request, createApiToken }) => {
    await resetData("drinks-bar");
    await withVocabulary(request, await createApiToken());
    await page.clock.setFixedTime(SUNDAY);
  });

  const sideways = (page: Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

  test("Holidays first, a disclosure per facet, no sideways scroll", async ({
    page,
  }) => {
    await page.goto("/tags");
    await expect(page.getByTestId("tag-holiday").first()).toContainText("13", {
      timeout: 20_000,
    });
    const holidays = await page.getByTestId("tag-holidays").boundingBox();
    const food = await page.getByTestId("tag-shelf").first().boundingBox();
    expect(holidays && food && holidays.y < food.y).toBe(true);
    /* Course opens first; the rest are folded until tapped. */
    await expect(column(page, "course").getByTestId("tag-row")).toBeVisible();
    await expect(column(page, "cuisine")).toHaveCount(0);
    const style = column(page, "style");
    await expect(style.getByTestId("tag-row").first()).toBeHidden();
    const toggle = style.getByRole("button", { name: /Style/ });
    await expectHydrated(toggle);
    await toggle.click();
    await expect(style.getByTestId("tag-row").first()).toBeVisible();
    /* The + is a visible button on a touch screen (Dt4). */
    await expect(
      style.getByRole("button", { name: "Combine with Highball" }),
    ).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await snapshotPage(page, "tags-board.png");

    await page.goto("/tags/halloween");
    await expect(page.getByTestId("term-when")).toContainText("13", {
      timeout: 20_000,
    });
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await snapshotPage(page, "tags-term.png");

    await page.goto("/tags/drink");
    await expect(page.getByTestId("root-section").first()).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await snapshotPage(page, "tags-root.png");
  });
});
