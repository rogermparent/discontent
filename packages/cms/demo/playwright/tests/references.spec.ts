import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";

/*
 * The `many-bookmarks` fixture is three notes and fourteen bookmarks, grouped
 * so each note's bookmarks land on a known page at `perPage: 4`:
 *
 *   page 0: bookmark-01..04  -> Alpha Note
 *   page 1: bookmark-05..08  -> Beta Note
 *   page 2: bookmark-09..12  -> Gamma Note   } folded into the landing
 *   page 3: bookmark-13,14   -> Gamma Note   }
 *
 * `headPage` is 3 and the numbered routes are exactly [0, 1]. The grouping is
 * what makes the payoff assertion sharp: retitling Beta Note has to dirty page
 * 1 and leave page 0 byte-identical, across a content type boundary.
 */
const BOOKMARKS = "bookmarks/by-date";
const NOTES = "notes/by-date";

async function listHtml(page: Page): Promise<string> {
  return page.getByTestId("bookmark-browse-list").innerHTML();
}

async function noteTitles(page: Page): Promise<string[]> {
  return page
    .getByTestId("bookmark-browse-list")
    .getByRole("listitem")
    .locator("p")
    .allInnerTexts();
}

test.describe("Borrowed fields", () => {
  test.beforeEach(async ({ resetData, clearPaginationChanges }) => {
    await resetData("many-bookmarks");
    await clearPaginationChanges();
  });

  test.describe("Covering", () => {
    test("the homepage renders a bookmark's note title with no note read", async ({
      page,
    }) => {
      await page.goto("/");
      /*
       * `readContentIndex` over bookmarks and nothing else — the title is in
       * the bookmark's own index value. This is the N+1 that
       * `getFeaturedRecipes` still does, not done.
       */
      const titles = await page
        .getByTestId("bookmark-note-title")
        .allInnerTexts();
      expect(titles).toContain("Note: Alpha Note");
      expect(titles).toContain("Note: Beta Note");
      expect(titles).toContain("Note: Gamma Note");
    });

    test("a paginated list renders borrowed titles", async ({ page }) => {
      await page.goto("/bookmarks/browse/1");
      expect(await noteTitles(page)).toEqual([
        "Note: Beta Note",
        "Note: Beta Note",
        "Note: Beta Note",
        "Note: Beta Note",
      ]);
    });
  });

  test.describe("The thesis, across a type boundary", () => {
    test("retitling a note updates every bookmark that shows it, and dirties only their pages", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/bookmarks/browse/0");
      const pageZeroBefore = await listHtml(page);

      await page.goto("/notes/beta-note/edit");
      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Beta Note Retitled");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/beta-note$/);

      /*
       * The whole point. Before D1 this fired nothing at all: an edit that
       * changed no slug did not reach the referencing type, and when a rename
       * did reach it the result was a forced full rebuild of every page.
       */
      const changes = await readPaginationChanges();
      expect(changes[BOOKMARKS]).toMatchObject({
        dirtyPages: [1],
        removedPages: [],
        headPage: 3,
        total: 14,
      });

      // Page 0's bookmarks point at a different note, so it must not move.
      await page.goto("/bookmarks/browse/0");
      expect(await listHtml(page)).toBe(pageZeroBefore);

      await page.goto("/bookmarks/browse/1");
      expect(await noteTitles(page)).toEqual([
        "Note: Beta Note Retitled",
        "Note: Beta Note Retitled",
        "Note: Beta Note Retitled",
        "Note: Beta Note Retitled",
      ]);

      await page.goto("/");
      expect(
        await page.getByTestId("bookmark-note-title").allInnerTexts(),
      ).toContain("Note: Beta Note Retitled");
    });

    test("editing a field nobody borrows dirties nothing at all", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/notes/beta-note/edit");
      await page.getByLabel("Content").clear();
      await page.getByLabel("Content").fill("Rewritten body, same title.");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/beta-note$/);

      /*
       * `content` is not in `references[].fields`, so the gate never opens and
       * the bookmarks index is not even read. The notes index still moves —
       * the note itself changed.
       */
      const changes = await readPaginationChanges();
      expect(changes[BOOKMARKS]).toBeUndefined();
      expect(changes[NOTES]).toBeDefined();
    });
  });

  test.describe("Renames", () => {
    test("a rename rewrites the reference and dirties no page at all", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/bookmarks/browse/0");
      const pageZeroBefore = await listHtml(page);
      await page.goto("/bookmarks/browse/1");
      const pageOneBefore = await listHtml(page);

      await page.goto("/notes/beta-note/edit");
      await page.getByLabel(/Slug/).clear();
      await page.getByLabel(/Slug/).fill("beta-note-renamed");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/beta-note-renamed$/);

      /*
       * Zero, where F15 reported *every* page dirty and `rebuilt: true`.
       *
       * That is not the cascade failing to fire — four bookmarks were rewritten
       * on disk and re-indexed, as the assertions below check. It is §3.5
       * reaching across the type boundary: only the projection is hashed, no
       * bookmark list renders the note's slug, so the rename changed nothing
       * any page displays. An empty `dirtyPages` is also proof this was a
       * reconciliation and not a rebuild, since a rebuild has no diff source
       * and always reports every page.
       */
      const changes = await readPaginationChanges();
      expect(changes[BOOKMARKS]).toMatchObject({
        dirtyPages: [],
        removedPages: [],
        headPage: 3,
        total: 14,
      });

      await page.goto("/bookmarks/browse/0");
      expect(await listHtml(page)).toBe(pageZeroBefore);
      await page.goto("/bookmarks/browse/1");
      expect(await listHtml(page)).toBe(pageOneBefore);

      // The reference field did follow, so the bookmark's link still resolves.
      await page.goto("/bookmarks/bookmark-05");
      await expect(
        page.getByText("References note:").locator("xpath=ancestor::*[1]"),
      ).toContainText("beta-note-renamed");
      await page.getByRole("link", { name: /View Note:/ }).click();
      await expect(page).toHaveURL(/\/notes\/beta-note-renamed$/);
    });

    test("a rename that also changes the title dirties exactly the pages showing it", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/bookmarks/browse/0");
      const pageZeroBefore = await listHtml(page);

      await page.goto("/notes/beta-note/edit");
      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Beta Renamed And Retitled");
      await page.getByLabel(/Slug/).clear();
      await page.getByLabel(/Slug/).fill("beta-note-moved");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/beta-note-moved$/);

      const changes = await readPaginationChanges();
      expect(changes[BOOKMARKS]).toMatchObject({
        dirtyPages: [1],
        removedPages: [],
        headPage: 3,
        total: 14,
      });

      await page.goto("/bookmarks/browse/0");
      expect(await listHtml(page)).toBe(pageZeroBefore);

      await page.goto("/bookmarks/browse/1");
      expect(await noteTitles(page)).toEqual([
        "Note: Beta Renamed And Retitled",
        "Note: Beta Renamed And Retitled",
        "Note: Beta Renamed And Retitled",
        "Note: Beta Renamed And Retitled",
      ]);
    });
  });

  test.describe("Deletes", () => {
    test("deleting a note leaves its bookmarks listed with the title gone", async ({
      page,
      readPaginationChanges,
    }) => {
      await page.goto("/notes/beta-note/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();
      await expect(page.getByText("Create New Note")).toBeVisible();

      const changes = await readPaginationChanges();
      expect(changes[BOOKMARKS]).toMatchObject({
        dirtyPages: [1],
        removedPages: [],
        total: 14,
      });

      // Still listed — a delete cascades values, not rows.
      await page.goto("/bookmarks/browse/1");
      expect(await noteTitles(page)).toEqual([
        "Note: (missing)",
        "Note: (missing)",
        "Note: (missing)",
        "Note: (missing)",
      ]);

      /*
       * And the reference itself survives. Rewriting it would destroy the only
       * record of what the bookmark pointed at.
       */
      await page.goto("/bookmarks/bookmark-05");
      await expect(
        page.getByText("References note:").locator("xpath=ancestor::*[1]"),
      ).toContainText("beta-note");
      await expect(page.getByText("Referenced note not found")).toBeVisible();
    });
  });

  test.describe("Backfill", () => {
    test("creating the referenced note fills in a dangling title", async ({
      page,
    }) => {
      // Point a new bookmark at a note that does not exist yet.
      await page.goto("/bookmarks/new");
      await page.getByLabel("Note Slug *").fill("later-note");
      await page.getByLabel("Label *").fill("Ahead Of Its Note");
      await page.getByLabel(/Bookmark Slug/).fill("ahead-bookmark");
      await page.getByLabel(/Date/).fill("2024-04-01T00:00");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "Ahead Of Its Note" }),
      ).toBeVisible();

      await page.goto("/bookmarks/browse");
      expect(await noteTitles(page)).toContain("Note: (missing)");

      // Now create it. The create fires the dependent pass too.
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Later Note");
      await page.getByLabel(/Slug/).fill("later-note");
      await page.getByLabel("Content").fill("Arrived second.");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Later Note" }),
      ).toBeVisible();

      await page.goto("/bookmarks/browse");
      expect(await noteTitles(page)).toContain("Note: Later Note");
    });
  });
});
