import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

/*
 * The `many-recipes` fixture is 40 recipes, "Recipe 01" … "Recipe 40", dated
 * one per day from 2024-01-01. At `RECIPES_PER_PAGE` = 12 that lays out as:
 *
 *   page 0: recipe-01..12   page 1: recipe-13..24
 *   page 2: recipe-25..36   page 3: recipe-37..40  ← head, partial
 *
 * so `headPage` is 3, the landing folds pages 3 and 2 into sixteen recipes,
 * and the numbered routes are exactly [0, 1] — served at `/recipes/1` and
 * `/recipes/2`, since a URL number is the stable page id plus one.
 *
 * Note which way round that is: `/recipes/1` is the *oldest* page. Ids count
 * from the oldest recipe so that a create — which lands at the newest end —
 * moves nothing, which is the property the last test in this file pins.
 */

/** "recipe-40", "recipe-39", … — newest first, the display order. */
function descending(from: number, to: number): string[] {
  const slugs: string[] = [];
  for (let i = from; i >= to; i--)
    slugs.push(`recipe-${String(i).padStart(2, "0")}`);
  return slugs;
}

function list(page: Page) {
  return page.locator('[data-testid="recipe-list"]');
}

/**
 * Scoped to the card links by href: a recipe carrying tags also renders tag
 * links inside the same list, and those are not recipes.
 */
async function slugs(page: Page): Promise<string[]> {
  const hrefs = await list(page)
    .locator('a[href^="/recipe/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  return hrefs.map((href) => href.replace("/recipe/", ""));
}

async function listHtml(page: Page): Promise<string> {
  await expect(list(page)).toBeVisible();
  return list(page).innerHTML();
}

test.describe("Recipe Index Pagination", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("many-recipes");
  });

  test.describe("Layout", () => {
    test("landing folds the head with the page below it", async ({ page }) => {
      await page.goto("/recipes");
      expect(await slugs(page)).toEqual(descending(40, 25));
    });

    test("numbered pages hold exactly perPage recipes, newest first", async ({
      page,
    }) => {
      await page.goto("/recipes/2");
      expect(await slugs(page)).toEqual(descending(24, 13));

      await page.goto("/recipes/1");
      expect(await slugs(page)).toEqual(descending(12, 1));
    });

    test("the landing and the numbered routes cover the corpus exactly once", async ({
      page,
    }) => {
      const seen: string[] = [];
      for (const path of ["/recipes", "/recipes/2", "/recipes/1"]) {
        await page.goto(path);
        seen.push(...(await slugs(page)));
      }
      expect(seen).toHaveLength(40);
      expect(new Set(seen).size).toBe(40);
    });

    test("does not serve the head, the folded page, or a page zero", async ({
      request,
    }) => {
      // headPage is 3 and page 2 is folded into the landing, so the numbered
      // routes stop at `/recipes/2`. There is no page 0 under 1-based URLs.
      expect((await request.get("/recipes/3")).status()).toBe(404);
      expect((await request.get("/recipes/4")).status()).toBe(404);
      expect((await request.get("/recipes/0")).status()).toBe(404);
      expect((await request.get("/recipes/99")).status()).toBe(404);
      expect((await request.get("/recipes/nonsense")).status()).toBe(404);
    });
  });

  test.describe("Navigation", () => {
    test("walks from the landing down to the oldest page and back", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/recipes");
      // The landing is the newest surface, so it offers no way further up.
      await expect(page.getByRole("link", { name: "Newer" })).toHaveCount(0);

      await page.getByRole("link", { name: "Older" }).click();
      await expect(page).toHaveURL(baseURL + "/recipes/2");

      await page.getByRole("link", { name: "Older" }).click();
      await expect(page).toHaveURL(baseURL + "/recipes/1");
      await expect(page.getByRole("link", { name: "Older" })).toHaveCount(0);

      await page.getByRole("link", { name: "Newer" }).click();
      await expect(page).toHaveURL(baseURL + "/recipes/2");

      // A null `newerPage` on the newest numbered page means the landing.
      await page.getByRole("link", { name: "Newer" }).click();
      await expect(page).toHaveURL(baseURL + "/recipes");
    });

    test("numbers a page by its stable id, and never the landing", async ({
      page,
    }) => {
      await page.goto("/recipes/1");
      await expect(page.getByTestId("pagination-page-number")).toHaveText("1");
      await page.goto("/recipes/2");
      await expect(page.getByTestId("pagination-page-number")).toHaveText("2");

      /*
       * The landing sits on the head, whose id moves every time the head
       * seals, so it is the one surface with no number — just the Home link.
       */
      await page.goto("/recipes");
      await expect(page.getByTestId("pagination-page-number")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Go to home" }),
      ).toBeVisible();
    });
  });

  test.describe("The thesis: a create dirties only the head", () => {
    test("leaves every sealed page byte-identical", async ({ page }) => {
      await page.goto("/recipes/1");
      const oldestBefore = await listHtml(page);
      await page.goto("/recipes/2");
      const middleBefore = await listHtml(page);

      await page.goto("/new-recipe");
      await fillSignInForm(page);
      // Gate on the recipe-form island hydrating so these field interactions
      // aren't dropped/reset mid-hydration (dev-mode flake).
      await markdownEditorReady(page, "description");
      await page.getByLabel("Name").first().fill("Recipe 41");
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("recipe-41");
      await page.getByLabel("Date (UTC)").fill("2024-02-10T12:00");
      await page.getByText("Submit").click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Recipe 41" }),
      ).toBeVisible({ timeout: 20_000 });

      /*
       * This is the whole point of anchoring page ids at the oldest end. Under
       * the offset scheme every one of these pages shifted by one recipe.
       */
      await page.goto("/recipes/1");
      expect(await listHtml(page)).toBe(oldestBefore);
      await page.goto("/recipes/2");
      expect(await listHtml(page)).toBe(middleBefore);

      // The landing is the one surface that did change.
      await page.goto("/recipes");
      expect(await slugs(page)).toEqual(["recipe-41", ...descending(40, 25)]);
    });
  });

  /*
   * D3. The same index at the same URLs, answered as data — `/recipes/head`
   * and `/recipes/page/N` mirror `/recipes` and `/recipes/N`. Server surface
   * only: nothing here renders, and no test above changed.
   */
  test.describe("The JSON routes", () => {
    interface JsonPage {
      items: { slug: string }[];
      pageIndex: number | null;
      headPage: number;
      total: number;
      olderPage: number | null;
    }

    const slugsOf = (payload: JsonPage) =>
      payload.items.map((item) => item.slug);

    test("serve the same pages the HTML routes render", async ({ request }) => {
      const head: JsonPage = await (await request.get("/recipes/head")).json();
      expect(slugsOf(head)).toEqual(descending(40, 25));
      expect(head.total).toBe(40);
      // headPage is 3, and the landing already folded page 2 in.
      expect(head.olderPage).toBe(1);

      const two: JsonPage = await (await request.get("/recipes/page/2")).json();
      expect(slugsOf(two)).toEqual(descending(24, 13));
      expect(two.olderPage).toBe(0);

      const one: JsonPage = await (await request.get("/recipes/page/1")).json();
      expect(slugsOf(one)).toEqual(descending(12, 1));
      // The oldest page: nothing below it.
      expect(one.olderPage).toBeNull();
    });

    test("refuse exactly what the HTML routes refuse", async ({ request }) => {
      for (const raw of ["3", "4", "0", "99", "nonsense"]) {
        const response = await request.get(`/recipes/page/${raw}`);
        expect(response.status(), `page ${raw}`).toBe(404);
      }
    });

    test("walk from the head to the oldest page covering the corpus once", async ({
      request,
    }) => {
      /*
       * The property the infinite list depends on, asserted against the routes
       * themselves rather than a browser: following `olderPage` from the head
       * visits every recipe exactly once and terminates.
       */
      const seen: string[] = [];
      let payload: JsonPage = await (await request.get("/recipes/head")).json();
      seen.push(...slugsOf(payload));

      while (payload.olderPage !== null) {
        // URL numbers are stable page ids plus one.
        const response = await request.get(
          `/recipes/page/${payload.olderPage + 1}`,
        );
        expect(response.status()).toBe(200);
        payload = await response.json();
        seen.push(...slugsOf(payload));
      }

      expect(seen).toHaveLength(40);
      expect(new Set(seen).size).toBe(40);
      expect(seen).toEqual(descending(40, 1));
    });
  });
});
