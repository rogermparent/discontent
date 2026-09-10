/**
 * Fixture Generation Spec
 *
 * Generates the test fixtures used by other tests.
 * Run explicitly with `pnpm generate-fixtures`; not part of the normal suite.
 */

import { test, expect } from "../support/test";
import { checkNoteTitlesInOrder } from "../support/helpers";

test.describe("Fixture Generation", () => {
  test.describe("one-note fixture", () => {
    test("generates one-note fixture", async ({
      page,
      resetData,
      copyFixtures,
    }) => {
      await resetData();
      await page.goto("/");

      await page.getByRole("link", { name: "Create New Note" }).click();
      await page.getByLabel("Title *").fill("Existing Note");
      await page.getByLabel(/Slug/).fill("existing-note");
      await page
        .getByLabel("Content")
        .fill("This note already exists for testing updates and deletes.");
      await page.getByLabel(/Tags/).fill("test");
      await page.getByLabel(/Date/).fill("2023-11-14T00:00");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Existing Note" }),
      ).toBeVisible();

      await copyFixtures("one-note");
    });
  });

  test.describe("three-notes fixture", () => {
    test("generates three-notes fixture", async ({
      page,
      resetData,
      copyFixtures,
    }) => {
      await resetData();
      await page.goto("/");

      await page.getByRole("link", { name: "Create New Note" }).click();
      await page.getByLabel("Title *").fill("First Note");
      await page.getByLabel(/Slug/).fill("first-note");
      await page.getByLabel("Content").fill("This is the first note content.");
      await page.getByLabel(/Tags/).fill("important, work");
      await page.getByLabel(/Date/).fill("2023-10-01T00:00");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "First Note" }),
      ).toBeVisible();

      await page.goto("/");
      await page.getByRole("link", { name: "Create New Note" }).click();
      await page.getByLabel("Title *").fill("Second Note");
      await page.getByLabel(/Slug/).fill("second-note");
      await page
        .getByLabel("Content")
        .fill(
          "This is the content of the second note.\n\nIt has multiple paragraphs.",
        );
      await page.getByLabel(/Date/).fill("2023-11-01T00:00");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Second Note" }),
      ).toBeVisible();

      await page.goto("/");
      await page.getByRole("link", { name: "Create New Note" }).click();
      await page.getByLabel("Title *").fill("Third Note");
      await page.getByLabel(/Slug/).fill("third-note");
      await page
        .getByLabel("Content")
        .fill("This is the newest note without tags.");
      await page.getByLabel(/Date/).fill("2023-11-15T00:00");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Third Note" }),
      ).toBeVisible();

      await page.goto("/");
      await checkNoteTitlesInOrder(page, [
        "Third Note",
        "Second Note",
        "First Note",
      ]);

      await copyFixtures("three-notes");
    });
  });

  test.describe("many-notes fixture", () => {
    /*
     * 14 notes at `perPage: 4` is the smallest corpus that exercises every
     * shape at once: `headPage` 3, numbered routes [0, 1] of four items each,
     * a six-item fold on the landing, and enough room above and below for a
     * delete to collapse the head.
     */
    test("generates many-notes fixture", async ({
      page,
      resetData,
      copyFixtures,
    }) => {
      test.setTimeout(120_000);
      await resetData();

      for (let index = 1; index <= 14; index++) {
        const number = String(index).padStart(2, "0");
        await page.goto("/notes/new");
        await page.getByLabel("Title *").fill(`Note ${number}`);
        await page.getByLabel(/Slug/).fill(`note-${number}`);
        await page.getByLabel("Content").fill(`Body of note ${number}.`);
        // Ascending dates, so note-14 is the newest and lands on the head.
        await page.getByLabel(/Date/).fill(`2024-01-${number}T00:00`);
        await page.getByRole("button", { name: "Create Note" }).click();
        await expect(
          page.getByRole("heading", { name: `Note ${number}` }),
        ).toBeVisible();
      }

      await page.goto("/notes/browse");
      await expect(page.getByText("Total notes: 14")).toBeVisible();
      await expect(
        page.getByTestId("browse-list").getByRole("listitem"),
      ).toHaveCount(6);

      await copyFixtures("many-notes");
    });
  });

  test.describe("many-bookmarks fixture", () => {
    /*
     * Three notes and fourteen bookmarks, at `perPage: 4`. The grouping is the
     * point: each note's bookmarks sit on a known page, so retitling one note
     * has an expected dirty set and a page that must not move at all.
     *
     *   page 0: bookmark-01..04  -> Alpha Note
     *   page 1: bookmark-05..08  -> Beta Note
     *   page 2: bookmark-09..12  -> Gamma Note   } folded into the landing
     *   page 3: bookmark-13,14   -> Gamma Note   }
     *
     * so `headPage` is 3 and the numbered routes are exactly [0, 1] — the same
     * shape `many-notes` has, for the same reason.
     */
    const NOTES = [
      { slug: "alpha-note", title: "Alpha Note" },
      { slug: "beta-note", title: "Beta Note" },
      { slug: "gamma-note", title: "Gamma Note" },
    ];

    function noteForBookmark(index: number): string {
      if (index <= 4) return "alpha-note";
      if (index <= 8) return "beta-note";
      return "gamma-note";
    }

    test("generates many-bookmarks fixture", async ({
      page,
      resetData,
      copyFixtures,
    }) => {
      test.setTimeout(180_000);
      await resetData();

      for (const [index, note] of NOTES.entries()) {
        await page.goto("/notes/new");
        await page.getByLabel("Title *").fill(note.title);
        await page.getByLabel(/Slug/).fill(note.slug);
        await page.getByLabel("Content").fill(`Body of ${note.title}.`);
        await page.getByLabel(/Date/).fill(`2024-02-0${index + 1}T00:00`);
        await page.getByRole("button", { name: "Create Note" }).click();
        await expect(
          page.getByRole("heading", { name: note.title }),
        ).toBeVisible();
      }

      for (let index = 1; index <= 14; index++) {
        const number = String(index).padStart(2, "0");
        await page.goto(`/bookmarks/new?note=${noteForBookmark(index)}`);
        await page.getByLabel("Label *").fill(`Bookmark ${number}`);
        await page.getByLabel(/Bookmark Slug/).fill(`bookmark-${number}`);
        // Ascending dates, so bookmark-14 is the newest and lands on the head.
        await page.getByLabel(/Date/).fill(`2024-03-${number}T00:00`);
        await page.getByRole("button", { name: "Create Bookmark" }).click();
        await expect(
          page.getByRole("heading", { name: `Bookmark ${number}` }),
        ).toBeVisible();
      }

      await page.goto("/bookmarks/browse");
      await expect(page.getByText("Total bookmarks: 14")).toBeVisible();
      await expect(
        page.getByTestId("bookmark-browse-list").getByRole("listitem"),
      ).toHaveCount(6);

      await copyFixtures("many-bookmarks");
    });
  });
});
