import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";

/*
 * F9 — the infinite-scroll toggle on the recipe index. D3 shipped the JSON
 * routes and the walk; this is the UX built on them.
 *
 * Same `many-recipes` fixture as `recipes-pagination.spec.ts`: 40 recipes,
 * "Recipe 01" … "Recipe 40". At `RECIPES_PER_PAGE` = 12 the landing folds
 * pages 3 and 2 into sixteen (recipe-40..25), and the numbered routes are
 * `/recipes/2` (recipe-24..13) and `/recipes/1` (recipe-12..1).
 */

/** "recipe-40", "recipe-39", … — newest first, the display order. */
function descending(from: number, to: number): string[] {
  const slugs: string[] = [];
  for (let i = from; i >= to; i--)
    slugs.push(`recipe-${String(i).padStart(2, "0")}`);
  return slugs;
}

/**
 * Every recipe on screen, in DOM order, across both grids.
 *
 * Infinite mode renders two lists, not one: the seed page is server-rendered
 * markup passed through as a slot — a recipe card's image comes from an async
 * server component — while appended pages render on the client. Both use
 * `RecipeGrid`, so both carry this testid and the multi-match locator reads
 * them in order.
 */
async function allSlugs(page: Page): Promise<string[]> {
  const hrefs = await page
    .getByTestId("recipe-list")
    .locator('a[href^="/recipe/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  return hrefs.map((href) => href.replace("/recipe/", ""));
}

function modeToggle(page: Page, mode: "Pages" | "Infinite") {
  return page.getByRole("radio", { name: mode, exact: true });
}

async function chooseInfinite(page: Page): Promise<void> {
  await modeToggle(page, "Infinite").click();
}

/**
 * Scroll until the walk reaches the oldest page. Retried because each append
 * lengthens the page, so one wheel event never reaches the end.
 */
async function scrollToEnd(page: Page): Promise<void> {
  await expect(async () => {
    await page.mouse.wheel(0, 4000);
    await expect(page.getByTestId("recipe-infinite-end")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });
}

test.describe("Recipe Index Infinite Scroll", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("many-recipes");
  });

  test.describe("The toggle", () => {
    test("defaults to numbered pages", async ({ page }) => {
      await page.goto("/recipes");

      /*
       * The default is what the server renders, what a crawler indexes and
       * what a reader without JS gets — so it is also what every pre-existing
       * pagination test describes.
       */
      await expect(modeToggle(page, "Pages")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByTestId("recipe-infinite")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Older" })).toBeVisible();
      expect(await allSlugs(page)).toEqual(descending(40, 25));
    });

    test("switching modes never navigates", async ({ page, baseURL }) => {
      await page.goto("/recipes/2");

      await chooseInfinite(page);
      await expect(page).toHaveURL(baseURL + "/recipes/2");
      // What was rendered stays rendered; infinite only enables appending.
      expect((await allSlugs(page)).slice(0, 12)).toEqual(descending(24, 13));

      await modeToggle(page, "Pages").click();
      await expect(page).toHaveURL(baseURL + "/recipes/2");
    });

    test("remembers the choice across a reload", async ({ page }) => {
      await page.goto("/recipes");
      await chooseInfinite(page);
      await expect(page.getByTestId("recipe-infinite")).toBeVisible();

      await page.reload();

      await expect(modeToggle(page, "Infinite")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByTestId("recipe-infinite")).toBeVisible();
      // And the numbered controls are gone, not merely hidden behind it.
      await expect(page.getByRole("link", { name: "Older" })).toHaveCount(0);
    });

    test("turning it off returns to the page the URL names", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/recipes");
      await chooseInfinite(page);
      await scrollToEnd(page);
      expect(await allSlugs(page)).toHaveLength(40);

      await modeToggle(page, "Pages").click();

      expect(await allSlugs(page)).toEqual(descending(40, 25));
      await expect(page).toHaveURL(baseURL + "/recipes");
      await expect(page.getByRole("link", { name: "Older" })).toBeVisible();
    });
  });

  test.describe("Appending", () => {
    test("walks from the landing fold to the oldest recipe exactly once", async ({
      page,
    }) => {
      await page.goto("/recipes");
      await chooseInfinite(page);
      await scrollToEnd(page);

      const seen = await allSlugs(page);
      expect(seen).toHaveLength(40);
      // The property §12.4 asks for: no slug appears twice across pages.
      expect(new Set(seen).size).toBe(40);
      expect(seen).toEqual(descending(40, 1));
    });

    test("a numbered deep link seeds there and appends older only", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/recipes/2");
      await chooseInfinite(page);
      await scrollToEnd(page);

      const seen = await allSlugs(page);
      // Page 2 is recipe-24..13, then page 1 is recipe-12..1. Never upward:
      // the reader asked for page 2, not the landing.
      expect(seen).toEqual(descending(24, 1));
      expect(seen).not.toContain("recipe-25");
      // Scrolling does not rewrite the URL; it still names the seed page.
      await expect(page).toHaveURL(baseURL + "/recipes/2");
    });

    test("keeps a real link to the next numbered page as the fallback", async ({
      page,
    }) => {
      /*
       * Aborting the fetch holds the intermediate state still — otherwise the
       * walk runs to the end before an assertion can land.
       */
      await page.route("**/recipes/page/*", (route) => route.abort());

      await page.goto("/recipes");
      await chooseInfinite(page);

      const loadMore = page.getByRole("link", { name: /Load more recipes/ });
      await expect(loadMore).toBeVisible();
      // The landing folds pages 3 and 2, so the next page down is page 1,
      // served at `/recipes/2`.
      await expect(loadMore).toHaveAttribute("href", "/recipes/2");
      await expect(
        page.getByText("Could not load more recipes. Try again."),
      ).toBeVisible();

      // A failed page is not the end of the list: it retries.
      await page.unroute("**/recipes/page/*");
      await loadMore.click();
      await scrollToEnd(page);
      expect(await allSlugs(page)).toHaveLength(40);
    });
  });

  test.describe("Reduced motion", () => {
    test("does not grow on its own, but the button still works", async ({
      page,
    }) => {
      /* Emulated per test rather than via `test.use`, which the extended
       * fixture type does not carry. */
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/recipes");
      await chooseInfinite(page);

      const loadMore = page.getByRole("link", { name: /Load more recipes/ });
      await expect(loadMore).toBeVisible();

      /*
       * Scrolling must append nothing: growing the page under a reader who
       * asked for less motion moves the scrollbar they are using and never
       * lets the page end.
       */
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1_000);
      expect(await allSlugs(page)).toHaveLength(16);

      // The control is still the way forward, and it is one click per page.
      await loadMore.click();
      await expect.poll(async () => (await allSlugs(page)).length).toBe(28);
      await loadMore.click();
      await expect.poll(async () => (await allSlugs(page)).length).toBe(40);
      await expect(page.getByTestId("recipe-infinite-end")).toBeVisible();
    });
  });
});
