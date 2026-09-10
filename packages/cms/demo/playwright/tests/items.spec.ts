import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";

/*
 * The item kind's payoff — §2's fifth shape, proven the way §12.2 proves
 * pagination's and aggregates.spec.ts proves the aggregate's.
 *
 * Each of the other two kinds has a claim about *precision*: pagination dirties
 * only the pages that moved, an aggregate reports no change at all for most
 * writes. The item kind's claim is about *reach*. Its surfaces are the ones no
 * path can name:
 *
 * - `/notes/<slug>` renders the note's whole record, including `content`, which
 *   is in no index value, no pagination projection and no borrowed field set.
 *   Pagination reports nothing for a body edit and the tag aggregate reports
 *   `changed: false`; the item tag is the only thing that fires at all.
 * - `/bookmarks/<slug>` renders a bookmark's record *and the referenced note's*
 *   — a second content type's item, at a URL belonging to neither. This is the
 *   demo's version of `/featured-recipe/<slug>`, and it is why the tag has to
 *   be keyed by item rather than by path.
 *
 * Every read below is cached and persists across requests even though the
 * routes are `force-dynamic` — `unstable_cache` is the data cache, not the
 * route cache — so each assertion genuinely fails if the write path stops
 * firing the tag.
 */

/**
 * Load a page twice, and assert on the second.
 *
 * Not superstition, and not a retry. After `revalidateTag(tag, { expire: 0 })`
 * this dev server serves the *first* subsequent read of that entry stale.
 * `aggregates.spec.ts` documents the same thing for `/notes/tags`, and
 * `/notes/browse` does it too.
 *
 * **This works only under `next dev`, and not for the reason the comment here
 * used to give.** The second read is not "genuinely fresh" because a refresh
 * landed behind the first; it is fresh because Next skips the data cache
 * outright. `next/dist/server/lib/incremental-cache/index.js:299` returns
 * `null` from `IncrementalCache.get` whenever `this.dev` and the request
 * carries `cache-control: no-cache` — which is exactly what a repeat
 * `page.goto` to the same URL sends. Production has no such bypass, so under
 * `pnpm e2e-start` this helper absorbs nothing.
 *
 * It no longer needs to. **F20** in
 * `packages/cms/docs/incremental-regeneration.md` §11.4 originally read this as
 * a tag fired in the same request that fills the cache leaving the entry
 * permanently cached in production; that is **disproven** —
 * `unstable_cache` writes only on a miss, and a miss after the stamp reads a
 * content file the write has already committed. The real defect was in this
 * file: `editNote` waited on `/\/notes\//` from `/notes/<slug>/edit`, a URL
 * that already matched, so the reads below raced the Server Action. With that
 * fixed the suite is green at 109 in production with retries disabled.
 *
 * Still do not paper anything over with a third `page.goto` — that hides a
 * finding the way the second one did for three passes.
 */
async function loadTwice(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.goto(url);
}

async function editNote(
  page: Page,
  slug: string,
  fields: { title?: string; content?: string; slug?: string },
): Promise<void> {
  await page.goto(`/notes/${slug}/edit`);
  if (fields.title !== undefined) {
    await page.getByLabel("Title *").clear();
    await page.getByLabel("Title *").fill(fields.title);
  }
  if (fields.content !== undefined) {
    await page.getByLabel("Content").clear();
    await page.getByLabel("Content").fill(fields.content);
  }
  if (fields.slug !== undefined) {
    await page.getByLabel(/Slug/).clear();
    await page.getByLabel(/Slug/).fill(fields.slug);
  }
  await page.getByRole("button", { name: "Update Note" }).click();
  /*
   * The destination, not `/\/notes\//`. That pattern already matches
   * `/notes/<slug>/edit`, the URL this is called from, so
   * `Frame.waitForURL` returned immediately — every read that followed was
   * issued while the Server Action was still in flight.
   */
  await page.waitForURL(`**/notes/${fields.slug ?? slug}`);
}

test.describe("item cache tags", () => {
  test("an edit to an unprojected field reaches the item page", async ({
    page,
    resetData,
  }) => {
    await resetData("one-note");

    /* Prime the cache, so a stale entry has something to serve. */
    await loadTwice(page, "/notes/existing-note");
    await expect(page.getByText(/already exists/)).toBeVisible();

    await editNote(page, "existing-note", { content: "Rewritten body." });

    await loadTwice(page, "/notes/existing-note");
    await expect(page.getByText("Rewritten body.")).toBeVisible();
    await expect(page.getByText(/already exists/)).toHaveCount(0);
  });

  test("a rename stops the old slug serving the record, and starts the new one", async ({
    page,
    resetData,
  }) => {
    await resetData("one-note");
    await loadTwice(page, "/notes/existing-note");

    await editNote(page, "existing-note", { slug: "renamed-note" });

    await loadTwice(page, "/notes/renamed-note");
    await expect(
      page.getByRole("heading", { name: "Existing Note" }),
    ).toBeVisible();

    /*
     * The other half of the rename, and the reason `previousSlug` is not
     * optional: the file at the old slug is gone, so a surviving cache entry
     * would go on serving a record that no longer exists.
     */
    const response = await page.goto("/notes/existing-note");
    await page.goto("/notes/existing-note");
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });

  test("a delete stops the item page serving the record", async ({
    page,
    resetData,
  }) => {
    await resetData("one-note");
    await loadTwice(page, "/notes/existing-note");

    await page.goto("/notes/existing-note/delete");
    await page.getByRole("button", { name: /Delete/ }).click();
    await page.waitForURL((url) => !url.pathname.includes("/delete"));

    await page.goto("/notes/existing-note");
    const response = await page.goto("/notes/existing-note");
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });

  test("editing a note reaches the bookmark page that renders it", async ({
    page,
    resetData,
  }) => {
    await resetData("one-note");

    await page.goto("/bookmarks/new?note=existing-note");
    await page.getByLabel(/Label/).fill("My Mark");
    /* "Bookmark Slug", not "Slug": the reference field is "Note Slug *". */
    await page.getByLabel(/Bookmark Slug/).fill("my-mark");
    await page.getByRole("button", { name: /Create Bookmark/ }).click();
    /* The destination: `/\/bookmarks\//` already matches `/bookmarks/new`. */
    await page.waitForURL("**/bookmarks/my-mark");

    await loadTwice(page, "/bookmarks/my-mark");
    await expect(page.getByText("View Note: Existing Note")).toBeVisible();

    /*
     * The cross-type read. `/bookmarks/my-mark` reaches the note's record
     * through its own by-slug read, not through any borrowed value on the
     * bookmark index — so only `item:notes:existing-note` can carry this.
     */
    await editNote(page, "existing-note", { title: "Retitled Note" });

    await loadTwice(page, "/bookmarks/my-mark");
    await expect(page.getByText("View Note: Retitled Note")).toBeVisible();
  });

  test("renaming a note reaches the bookmark record the write rewrote", async ({
    page,
    resetData,
  }) => {
    await resetData("one-note");

    await page.goto("/bookmarks/new?note=existing-note");
    await page.getByLabel(/Label/).fill("My Mark");
    /* "Bookmark Slug", not "Slug": the reference field is "Note Slug *". */
    await page.getByLabel(/Bookmark Slug/).fill("my-mark");
    await page.getByRole("button", { name: /Create Bookmark/ }).click();
    /* The destination: `/\/bookmarks\//` already matches `/bookmarks/new`. */
    await page.waitForURL("**/bookmarks/my-mark");

    await loadTwice(page, "/bookmarks/my-mark");
    await expect(page.getByText("existing-note")).toBeVisible();

    await editNote(page, "existing-note", { slug: "renamed-note" });

    /*
     * The sharpest assertion available to this kind. "References note: X" is
     * printed from the *bookmark's own data file*, which `updateDependents`
     * rewrote when the note's slug moved. No tag keyed by notes reaches it and
     * no projection carries it — it takes an item tag fired for each slug in
     * `DependentWriteResult.updatedSlugs`, which needs no config seat because
     * the result already names the content type.
     */
    await loadTwice(page, "/bookmarks/my-mark");
    await expect(page.getByText("renamed-note")).toBeVisible();
    await expect(page.getByText("existing-note")).toHaveCount(0);
  });

  test("a fixture rollback drops cached records, via the type-wide catch-all", async ({
    page,
    resetData,
  }) => {
    await resetData("one-note");
    await loadTwice(page, "/notes/existing-note");
    await expect(
      page.getByRole("heading", { name: "Existing Note" }),
    ).toBeVisible();

    /*
     * A rollback is not a write, so it fires no tag of its own — the suite
     * would otherwise be order-dependent in exactly the way §12.2 describes
     * for pagination. And the item entries cannot be enumerated to expire one
     * by one, which is the whole reason the catch-all exists.
     */
    await resetData("three-notes");

    const response = await page.goto("/notes/existing-note");
    await page.goto("/notes/existing-note");
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });
});
