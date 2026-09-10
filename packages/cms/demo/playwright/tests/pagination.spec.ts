import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";

/*
 * The `many-notes` fixture is 14 notes dated 2024-01-01 … 2024-01-14, titled
 * "Note 01" … "Note 14". At `perPage: 4` that lays out as:
 *
 *   page 0: note-01..04   page 1: note-05..08   page 2: note-09..12
 *   page 3: note-13,14  ← head, partial
 *
 * so `headPage` is 3, the landing folds pages 3 and 2 into six items, and the
 * numbered routes are exactly [0, 1].
 */
const INDEX = "notes/by-date";

async function titles(page: Page): Promise<string[]> {
  return page.getByTestId("browse-list").getByRole("listitem").allInnerTexts();
}

async function slugs(page: Page): Promise<string[]> {
  const links = await page.getByTestId("browse-list").getByRole("link").all();
  const result: string[] = [];
  for (const link of links) {
    result.push(
      ((await link.getAttribute("href")) ?? "").replace("/notes/", ""),
    );
  }
  return result;
}

async function listHtml(page: Page): Promise<string> {
  return page.getByTestId("browse-list").innerHTML();
}

test.describe("Pagination Indexes", () => {
  test.beforeEach(async ({ resetData, clearPaginationChanges }) => {
    await resetData("many-notes");
    /*
     * After the reset, not before: the artifact is a dotfile inside the
     * content directory and `copyFixtures` copied the whole directory, so the
     * fixture carries whatever the generator's last write recorded.
     */
    await clearPaginationChanges();
  });

  test.describe("Layout", () => {
    test("landing folds the head with the page below it", async ({ page }) => {
      await page.goto("/notes/browse");
      expect(await slugs(page)).toEqual([
        "note-14",
        "note-13",
        "note-12",
        "note-11",
        "note-10",
        "note-09",
      ]);
      await expect(page.getByText("Total notes: 14")).toBeVisible();
    });

    test("numbered pages hold exactly perPage items, newest first", async ({
      page,
    }) => {
      await page.goto("/notes/browse/1");
      expect(await slugs(page)).toEqual([
        "note-08",
        "note-07",
        "note-06",
        "note-05",
      ]);

      await page.goto("/notes/browse/0");
      expect(await slugs(page)).toEqual([
        "note-04",
        "note-03",
        "note-02",
        "note-01",
      ]);
    });

    test("the landing and the numbered routes cover the corpus exactly once", async ({
      page,
    }) => {
      const seen: string[] = [];
      for (const path of [
        "/notes/browse",
        "/notes/browse/1",
        "/notes/browse/0",
      ]) {
        await page.goto(path);
        seen.push(...(await slugs(page)));
      }
      expect(seen).toHaveLength(14);
      expect(new Set(seen).size).toBe(14);
    });

    test("does not serve the head or the folded page as numbered routes", async ({
      request,
    }) => {
      // headPage is 3 and page 2 is folded into the landing.
      expect((await request.get("/notes/browse/2")).status()).toBe(404);
      expect((await request.get("/notes/browse/3")).status()).toBe(404);
      expect((await request.get("/notes/browse/99")).status()).toBe(404);
    });

    test("navigates from the landing back through the older pages", async ({
      page,
    }) => {
      await page.goto("/notes/browse");
      await page.getByRole("link", { name: "Older notes" }).click();
      await expect(page).toHaveURL(/\/notes\/browse\/1$/);

      await page.getByRole("link", { name: "Older notes" }).click();
      await expect(page).toHaveURL(/\/notes\/browse\/0$/);
      await expect(page.getByRole("link", { name: "Older notes" })).toHaveCount(
        0,
      );

      await page.getByRole("link", { name: "Newer notes" }).click();
      await expect(page).toHaveURL(/\/notes\/browse\/1$/);
      await page.getByRole("link", { name: "Newer notes" }).click();
      await expect(page).toHaveURL(/\/notes\/browse$/);
    });
  });

  /*
   * D3. The JSON routes serve the same `PaginationPage` the renderer is handed,
   * and the client walks `olderPage` from whatever page the server seeded it
   * with. The property under test is the one §12.4 asks for: appending covers
   * the corpus exactly once and then stops.
   */
  test.describe("Infinite scroll", () => {
    async function enableInfinite(page: Page): Promise<void> {
      await page.getByTestId("browse-mode-toggle").click({ timeout: 10_000 });
    }

    /**
     * Scroll until the walk reaches the oldest page.
     *
     * Scrolling rather than waiting: §12.4 asks for a spec that *scrolls* the
     * list, and a stationary viewport would only exercise the sentinel's first
     * intersection. Retried because each append lengthens the page, so one
     * wheel event is never enough to reach the end.
     */
    async function scrollToEnd(page: Page): Promise<void> {
      await expect(async () => {
        await page.mouse.wheel(0, 2000);
        await expect(page.getByTestId("browse-infinite-end")).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 20_000 });
    }

    test("the JSON routes answer with the same pages the HTML renders", async ({
      request,
    }) => {
      const head = await (await request.get("/notes/browse/head")).json();
      expect(head.items.map((item: { slug: string }) => item.slug)).toEqual([
        "note-14",
        "note-13",
        "note-12",
        "note-11",
        "note-10",
        "note-09",
      ]);
      // Skips page 2, which the landing already folded in.
      expect(head.olderPage).toBe(1);
      expect(head.total).toBe(14);

      const one = await (await request.get("/notes/browse/page/1")).json();
      expect(one.items.map((item: { slug: string }) => item.slug)).toEqual([
        "note-08",
        "note-07",
        "note-06",
        "note-05",
      ]);
      expect(one.olderPage).toBe(0);

      const zero = await (await request.get("/notes/browse/page/0")).json();
      expect(zero.olderPage).toBeNull();
    });

    test("the JSON routes refuse what the HTML routes refuse", async ({
      request,
    }) => {
      for (const path of ["2", "3", "99", "abc", "-1"]) {
        const response = await request.get(`/notes/browse/page/${path}`);
        expect(response.status(), `page ${path}`).toBe(404);
      }
    });

    test("appends older pages until the corpus is covered exactly once", async ({
      page,
    }) => {
      await page.goto("/notes/browse");
      expect(await slugs(page)).toHaveLength(6);

      await enableInfinite(page);
      await scrollToEnd(page);

      const seen = await slugs(page);
      expect(seen).toHaveLength(14);
      expect(new Set(seen).size).toBe(14);
      // Newest to oldest, unbroken across the page boundaries it walked.
      expect(seen[0]).toBe("note-14");
      expect(seen[13]).toBe("note-01");
      // And it stops: no link to load anything further.
      await expect(
        page.getByRole("link", { name: "Load more notes" }),
      ).toHaveCount(0);
    });

    test("a numbered deep link seeds there and walks older only", async ({
      page,
    }) => {
      await page.goto("/notes/browse/1");
      expect(await slugs(page)).toHaveLength(4);

      await enableInfinite(page);
      await scrollToEnd(page);

      const seen = await slugs(page);
      expect(seen).toEqual([
        "note-08",
        "note-07",
        "note-06",
        "note-05",
        "note-04",
        "note-03",
        "note-02",
        "note-01",
      ]);
      // Never upward: the reader asked for page 1, not the landing.
      expect(seen).not.toContain("note-09");
      // The URL still names the seed page — scrolling does not rewrite it.
      await expect(page).toHaveURL(/\/notes\/browse\/1$/);
    });

    test("keeps a real link to the next numbered page when a fetch fails", async ({
      page,
    }) => {
      /*
       * Aborting the fetch is the only way to hold the intermediate state
       * still: on a corpus this short the sentinel is on screen from the
       * moment infinite is switched on, so the walk otherwise runs to the end
       * before an assertion can land.
       */
      await page.route("**/notes/browse/page/*", (route) => route.abort());

      await page.goto("/notes/browse");
      await enableInfinite(page);

      const loadMore = page.getByRole("link", { name: "Load more notes" });
      await expect(loadMore).toBeVisible();
      // A real href, so it works without JS and for a keyboard reader.
      await expect(loadMore).toHaveAttribute("href", "/notes/browse/1");
      await expect(
        page.getByText("Could not load older notes. Scroll again to retry."),
      ).toBeVisible();

      // A failed page is not the end of the list: it retries.
      await page.unroute("**/notes/browse/page/*");
      await loadMore.click();
      await scrollToEnd(page);
      expect(await slugs(page)).toHaveLength(14);
    });

    test("turning it off returns to the page the URL names", async ({
      page,
    }) => {
      await page.goto("/notes/browse");
      await enableInfinite(page);
      await scrollToEnd(page);
      expect(await slugs(page)).toHaveLength(14);

      await page.getByTestId("browse-mode-toggle").click();

      expect(await slugs(page)).toHaveLength(6);
      await expect(page.getByTestId("browse-nav")).toBeVisible();
      await expect(page).toHaveURL(/\/notes\/browse$/);
    });
  });

  test.describe("The thesis: a create dirties only the head", () => {
    test("reports one dirty page and leaves every sealed page byte-identical", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/notes/browse/0");
      const pageZeroBefore = await listHtml(page);
      await page.goto("/notes/browse/1");
      const pageOneBefore = await listHtml(page);

      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Note 15");
      await page.getByLabel(/Slug/).fill("note-15");
      await page.getByLabel(/Date/).fill("2024-01-15T00:00");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Note 15" }),
      ).toBeVisible();

      // This is the whole point of anchoring pages at the stable end.
      const changes = await readPaginationChanges();
      expect(changes[INDEX]).toMatchObject({
        dirtyPages: [3],
        removedPages: [],
        headPage: 3,
        total: 15,
      });

      await page.goto("/notes/browse/0");
      expect(await listHtml(page)).toBe(pageZeroBefore);
      await page.goto("/notes/browse/1");
      expect(await listHtml(page)).toBe(pageOneBefore);

      // The landing is the one surface that did change.
      await page.goto("/notes/browse");
      expect(await slugs(page)).toEqual([
        "note-15",
        "note-14",
        "note-13",
        "note-12",
        "note-11",
        "note-10",
        "note-09",
      ]);
    });
  });

  test.describe("Edits", () => {
    test("an edit dirties only the page the item is on", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/notes/note-02/edit");
      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Note 02 Edited");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Note 02 Edited" }),
      ).toBeVisible();

      const changes = await readPaginationChanges();
      expect(changes[INDEX]).toMatchObject({
        dirtyPages: [0],
        removedPages: [],
        headPage: 3,
        total: 14,
      });

      await page.goto("/notes/browse/0");
      expect(await titles(page)).toEqual(
        expect.arrayContaining([expect.stringContaining("Note 02 Edited")]),
      );
    });

    test("a rename moves the item without orphaning or duplicating it", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/notes/note-03/edit");
      await page.getByLabel(/Slug/).clear();
      await page.getByLabel(/Slug/).fill("note-03-renamed");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/note-03-renamed$/);

      // Same date, so the same rank and the same page — only the id moved.
      const changes = await readPaginationChanges();
      expect(changes[INDEX]).toMatchObject({
        dirtyPages: [0],
        removedPages: [],
        total: 14,
      });

      await page.goto("/notes/browse/0");
      expect(await slugs(page)).toEqual([
        "note-04",
        "note-03-renamed",
        "note-02",
        "note-01",
      ]);

      const seen: string[] = [];
      for (const path of [
        "/notes/browse",
        "/notes/browse/1",
        "/notes/browse/0",
      ]) {
        await page.goto(path);
        seen.push(...(await slugs(page)));
      }
      expect(new Set(seen).size).toBe(14);
      expect(seen).not.toContain("note-03");
    });
  });

  test.describe("Deletes", () => {
    test("deleting old notes shifts later pages and collapses the head", async ({
      page,
      readPaginationChanges,
      clearPaginationChanges,
    }) => {
      /*
       * A delete near the oldest end is the expensive write: every position
       * after it shifts, so it dirties from its own page through the head —
       * and nothing older.
       */
      await page.goto("/notes/note-01/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();
      await expect(page.getByText("Create New Note")).toBeVisible();

      let changes = await readPaginationChanges();
      expect(changes[INDEX]).toMatchObject({
        dirtyPages: [0, 1, 2, 3],
        removedPages: [],
        headPage: 3,
        total: 13,
      });

      await clearPaginationChanges();

      // 13 -> 12 items leaves no head page 3 at all.
      await page.goto("/notes/note-02/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();
      await expect(page.getByText("Create New Note")).toBeVisible();

      changes = await readPaginationChanges();
      expect(changes[INDEX]).toMatchObject({
        dirtyPages: [0, 1, 2],
        removedPages: [3],
        headPage: 2,
        total: 12,
      });

      // The numbered routes shrank with it.
      await page.goto("/notes/browse");
      expect(await slugs(page)).toEqual([
        "note-14",
        "note-13",
        "note-12",
        "note-11",
        "note-10",
        "note-09",
        "note-08",
        "note-07",
      ]);

      await page.goto("/notes/browse/0");
      expect(await slugs(page)).toEqual([
        "note-06",
        "note-05",
        "note-04",
        "note-03",
      ]);
    });
  });

  test.describe("The artifact", () => {
    test("accumulates dirty pages across writes until it is cleared", async ({
      page,
      readPaginationChanges,
      clearPaginationChanges,
    }) => {
      // An edit deep in the corpus…
      await page.goto("/notes/note-02/edit");
      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Note 02 Merged");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Note 02 Merged" }),
      ).toBeVisible();

      // …then one at the newest end, with no build in between.
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Note 16");
      await page.getByLabel(/Slug/).fill("note-16");
      await page.getByLabel(/Date/).fill("2024-01-16T00:00");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Note 16" }),
      ).toBeVisible();

      const changes = await readPaginationChanges();
      expect(changes[INDEX].dirtyPages).toEqual([0, 3]);
      expect(changes[INDEX].total).toBe(15);

      await clearPaginationChanges();
      expect(await readPaginationChanges()).toEqual({});
    });
  });

  test.describe("Content types stay apart", () => {
    /*
     * This replaces P2's "bookmarks declare no indexes so nothing is recorded"
     * witness, which D1 spent: bookmarks now carry an index of their own so
     * that they can prove borrowed fields. The no-index case is still covered,
     * in `test/pagination.test.ts` — `syncPaginationIndexes` returns `[]`
     * having written nothing for a config with no `paginationIndexes`.
     *
     * What the demo asserts instead is the thing only an app can: a write to
     * one content type records nothing against another's index.
     */
    test("a bookmark write records nothing under notes", async ({
      page,
      readPaginationChanges,
      clearPaginationChanges,
    }) => {
      await clearPaginationChanges();

      await page.goto("/notes/note-05");
      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("Isolated Bookmark");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "Isolated Bookmark" }),
      ).toBeVisible();

      const changes = await readPaginationChanges();
      expect(Object.keys(changes)).toEqual(["bookmarks/by-date"]);
      expect(changes[INDEX]).toBeUndefined();
    });
  });
});
