import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";

/*
 * The aggregate kind's payoff, stated the way §12.2 states pagination's.
 *
 * Pagination's claim is "only the pages that changed are dirty". An aggregate
 * has no pages, so its claim is the sharper one: **most writes change it not at
 * all**, and the pass says so rather than firing a tag and letting the cache
 * sort it out. That is the whole difference between the two kinds.
 *
 * Built from an empty corpus rather than a fixture. The assertions are all
 * deltas — add a note carrying a tag that exists, add one carrying a tag that
 * does not — so a large corpus would add running time and nothing else. It
 * also keeps the spec independent of `many-notes`, whose index values were
 * captured before notes carried tags at all.
 */

const AGGREGATE = "notes/tags";

async function createNote(
  page: Page,
  options: { slug: string; title: string; tags: string },
) {
  await page.goto("/notes/new");
  await page.getByLabel("Title *").fill(options.title);
  await page.getByLabel(/Slug/).fill(options.slug);
  await page.getByLabel("Content").fill(`Body of ${options.title}.`);
  await page.getByLabel(/Tags/).fill(options.tags);
  await page.getByRole("button", { name: "Create Note" }).click();
  await expect(
    page.getByRole("heading", { name: options.title }),
  ).toBeVisible();
}

/**
 * Load the tag page, twice.
 *
 * The second request is not superstition. After `revalidateTag(tag,
 * { expire: 0 })` the demo's dev server serves the *first* subsequent read of
 * that entry stale, so a read taken immediately after a write can show the
 * previous value. This is **not specific to aggregates** — `/notes/browse`
 * behaves identically, and the existing specs never noticed only because they
 * always issue some other request between the write and the assertion.
 *
 * **The absorption is `next dev`-only.** The second read is fresh not because
 * a refresh landed behind the first, but because Next skips the data cache
 * entirely: `next/dist/server/lib/incremental-cache/index.js:299` returns
 * `null` from `IncrementalCache.get` whenever `this.dev` and the request
 * carries `cache-control: no-cache`, which is what a repeat `page.goto` sends.
 * Production has no equivalent, so this helper does nothing under
 * `pnpm e2e-start`.
 *
 * See **F20** in `packages/cms/docs/incremental-regeneration.md` §11.4, which
 * now records the production behaviour as a bounded sub-second window rather
 * than the permanent pin it was first read as. Where a test needs the write to
 * be observable before it reads, `tagCloudHtmlOnceShowing` below waits for it
 * explicitly. A third `page.goto` is still not the fix — it would bury the
 * finding one layer deeper.
 */
async function loadTagPage(page: Page): Promise<void> {
  await page.goto("/notes/tags");
  await page.goto("/notes/tags");
}

async function tagCloud(page: Page): Promise<string[]> {
  await loadTagPage(page);
  if (await page.getByTestId("no-tags").isVisible()) return [];
  return page.getByTestId("tag").allInnerTexts();
}

async function tagCloudHtml(page: Page): Promise<string> {
  await loadTagPage(page);
  return page.getByTestId("tag-page").innerHTML();
}

/**
 * Capture the baseline for a "nothing moved" assertion, once the write that
 * set it up is actually observable.
 *
 * Not a retry around the assertion — the assertion still compares exactly
 * once. This guards the *precondition*. `revalidateTag`'s stamp runs in a
 * `finally` that Next is allowed to execute after the action's response has
 * been sent (`revalidation-utils.js:145-149`), so under `next start` a read
 * issued immediately after a redirect can still see the pre-write aggregate.
 * Capturing `before` in that window records "No tags yet." as the baseline and
 * the later comparison then fails against a cloud that was never wrong.
 *
 * The window is bounded and self-healing — measured at empty by ~60ms and
 * correct by ~1.1s, consistently, over six runs — so it is not F20's claimed
 * *permanent* pin, which §11.4 now records as disproven.
 *
 * `expect.poll` and not `expect(...).toPass`: the latter nests an assertion
 * whose own five-second default timeout consumes the whole outer budget on the
 * first attempt, so it never re-issues the read it exists to re-issue.
 */
async function tagCloudHtmlOnceShowing(
  page: Page,
  expectedTag: string,
): Promise<string> {
  await expect
    .poll(
      async () => {
        await loadTagPage(page);
        return page.getByTestId("tag-page").innerHTML();
      },
      { timeout: 15_000 },
    )
    .toContain(expectedTag);
  return page.getByTestId("tag-page").innerHTML();
}

test.describe("Aggregates", () => {
  test.beforeEach(async ({ resetData, clearPaginationChanges }) => {
    await resetData();
    await clearPaginationChanges();
  });

  test("folds the tag set across the whole corpus", async ({ page }) => {
    await createNote(page, { slug: "a", title: "A", tags: "beta, alpha" });
    await createNote(page, { slug: "b", title: "B", tags: "gamma, alpha" });

    /* Sorted, deduped, and independent of the order the notes were written. */
    expect(await tagCloud(page)).toEqual(["alpha", "beta", "gamma"]);
  });

  test("shows nothing when the corpus has never been folded", async ({
    page,
  }) => {
    await loadTagPage(page);
    await expect(page.getByTestId("no-tags")).toBeVisible();
  });

  /*
   * The positive half of the trigger. A genuinely new tag moves the value, so
   * it is recorded and the tag fires — once.
   */
  test("a new tag changes the value and is recorded", async ({
    page,
    clearPaginationChanges,
    readAggregateChanges,
  }) => {
    await createNote(page, { slug: "a", title: "A", tags: "alpha" });
    await clearPaginationChanges();

    await createNote(page, { slug: "b", title: "B", tags: "brand-new" });

    expect(await readAggregateChanges()).toEqual([AGGREGATE]);
    expect(await tagCloud(page)).toEqual(["alpha", "brand-new"]);
  });

  /*
   * The negative half, and the reason the kind exists at all. This write
   * touched the corpus the tag cloud is folded from, dirtied a page, and
   * created a whole new note — and the tag cloud is byte-identical, with
   * nothing recorded and no tag fired.
   */
  test("a note carrying an existing tag leaves the cloud untouched", async ({
    page,
    clearPaginationChanges,
    readAggregateChanges,
    readPaginationChanges,
  }) => {
    await createNote(page, { slug: "a", title: "A", tags: "alpha" });
    const before = await tagCloudHtmlOnceShowing(page, "alpha");
    await clearPaginationChanges();

    await createNote(page, { slug: "b", title: "B", tags: "alpha" });

    expect(await readAggregateChanges()).toEqual([]);
    expect(await tagCloudHtml(page)).toBe(before);

    /*
     * And the write really did happen: the same pass reports a dirty page, so
     * "nothing was recorded" is precision rather than a pass that failed to
     * run.
     */
    expect(
      (await readPaginationChanges())["notes/by-date"]?.dirtyPages,
    ).toEqual([0]);
  });

  test("editing a title moves a page and not the aggregate", async ({
    page,
    clearPaginationChanges,
    readAggregateChanges,
    readPaginationChanges,
  }) => {
    await createNote(page, { slug: "a", title: "A", tags: "alpha" });
    const before = await tagCloudHtmlOnceShowing(page, "alpha");
    await clearPaginationChanges();

    await page.goto("/notes/a");
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title *").fill("A edited");
    await page.getByRole("button", { name: "Update Note" }).click();
    await expect(page.getByRole("heading", { name: "A edited" })).toBeVisible();

    expect(
      (await readPaginationChanges())["notes/by-date"]?.dirtyPages,
    ).toEqual([0]);
    expect(await readAggregateChanges()).toEqual([]);
    expect(await tagCloudHtml(page)).toBe(before);
  });

  test("removing the last note carrying a tag drops it", async ({
    page,
    clearPaginationChanges,
    readAggregateChanges,
  }) => {
    await createNote(page, { slug: "a", title: "A", tags: "keep, lonely" });
    await createNote(page, { slug: "b", title: "B", tags: "keep" });
    expect(await tagCloud(page)).toEqual(["keep", "lonely"]);
    await clearPaginationChanges();

    await page.goto("/notes/a");
    await page.getByRole("link", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, Delete Note" }).click();
    /*
     * Wait for the redirect the action ends with. `click()` resolves when the
     * click is dispatched, not when the server has finished writing, so
     * reading the artifact straight after it is a race.
     */
    await expect(page).toHaveURL(/\/$/);

    expect(await readAggregateChanges()).toEqual([AGGREGATE]);
    expect(await tagCloud(page)).toEqual(["keep"]);
  });

  /*
   * Retagging is the case that would break a naive "add what you see"
   * implementation: the tag is not removed from any note's *data* by the edit,
   * it simply stops being carried by the only note that carried it. Only a
   * fold over the whole corpus notices.
   */
  test("retagging a note drops a tag nothing else carries", async ({
    page,
    clearPaginationChanges,
    readAggregateChanges,
  }) => {
    await createNote(page, { slug: "a", title: "A", tags: "solo" });
    await clearPaginationChanges();

    await page.goto("/notes/a");
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel(/Tags/).fill("replacement");
    await page.getByRole("button", { name: "Update Note" }).click();
    await expect(page.getByRole("heading", { name: "A" })).toBeVisible();

    expect(await readAggregateChanges()).toEqual([AGGREGATE]);
    expect(await tagCloud(page)).toEqual(["replacement"]);
  });
});
