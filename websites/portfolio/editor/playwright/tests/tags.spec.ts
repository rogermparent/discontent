import { test, expect } from "../support/test";

/*
 * Portfolio's tag pages (24b).
 *
 * `Project.tags` has been stored, indexed, form-editable and printed on every
 * index row since the collection was written, with nowhere to click through to.
 * One `taxonomies` line on `projectContentConfig` derives the two aggregates
 * these pages read; the pages themselves live in the collection, because the
 * content type that declares the vocabulary does.
 *
 * The `projects` fixture's five works carry fourteen distinct terms, three of
 * which two works share — which is what makes the counts worth asserting.
 */

/** Every term in the fixture, by slug, with how many projects carry it. */
const TAG_COUNTS: Record<string, number> = {
  accessibility: 2,
  ci: 1,
  cms: 1,
  color: 1,
  "design-system": 2,
  linux: 1,
  lmdb: 1,
  "next-js": 2,
  oklch: 1,
  print: 1,
  search: 1,
  "self-hosting": 1,
  typescript: 1,
  typography: 1,
};

test.describe("Portfolio tag pages", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("projects");
  });

  test("the index lists every tag with its count, sorted by slug", async ({
    page,
  }) => {
    await page.goto("/tags");
    await expect(
      page.getByRole("heading", { name: "Tags", exact: true }),
    ).toBeVisible();

    const rows = page.getByTestId("tag-index").getByRole("link");
    await expect(rows).toHaveCount(Object.keys(TAG_COUNTS).length);

    /*
     * Sorted by *slug*, which `finalize` guarantees — so "design system" sits
     * under `design-system` and "next.js" under `next-js`, and the printed
     * label is the term as it was authored rather than its slug.
     */
    /*
     * Lowercased before comparing: the rows print their label through the same
     * `uppercase` treatment the index's tag hints use, so `allInnerTexts` hands
     * back the *rendered* case rather than the stored one. What is being
     * asserted is the vocabulary and its order, not the typography.
     */
    const texts = (await rows.allInnerTexts()).map((text) =>
      text.replace(/\s+/g, " ").trim().toLowerCase(),
    );
    expect(texts).toEqual([
      "accessibility 2",
      "ci 1",
      "cms 1",
      "color 1",
      "design system 2",
      "linux 1",
      "lmdb 1",
      "next.js 2",
      "oklch 1",
      "print 1",
      "search 1",
      "self-hosting 1",
      "typescript 1",
      "typography 1",
    ]);
  });

  test("a tag page lists its projects, newest first", async ({ page }) => {
    await page.goto("/tags");
    await page
      .getByTestId("tag-index")
      .getByRole("link", { name: /design system/ })
      .click();

    await expect(page).toHaveURL(/\/tags\/design-system$/);
    await expect(
      page.getByRole("heading", { name: "design system", exact: true }),
    ).toBeVisible();

    const rows = page.getByTestId("tag-projects").getByRole("link");
    await expect(rows).toHaveCount(2);
    /* Newest first, the order every list surface in the repo uses. */
    await expect(rows.first()).toContainText("Discontent Design System");
    await expect(rows.last()).toContainText("Recipe Website");

    await rows.last().click();
    await expect(page).toHaveURL(/\/project\/recipe-website$/);
  });

  test("every tag in the corpus has a page with the right count", async ({
    page,
  }) => {
    for (const [tag, count] of Object.entries(TAG_COUNTS)) {
      await page.goto(`/tags/${tag}`);
      await expect(
        page.getByTestId("tag-projects").getByRole("link"),
      ).toHaveCount(count);
    }
  });

  /*
   * An unknown slug is a 404, not an empty page: the folded value only holds
   * slugs a project actually carries.
   */
  test("an unknown tag is a 404", async ({ page }) => {
    const response = await page.goto("/tags/not-a-real-tag");
    expect(response?.status()).toBe(404);
  });

  /*
   * `/tags` is a static segment and the sibling `[...slug]` pages route is a
   * catch-all; Next resolves the static one first. Worth an assertion rather
   * than an argument, since the failure would be a tag index that renders as a
   * missing page.
   */
  test("the static /tags segment beats the pages catch-all", async ({
    page,
  }) => {
    const response = await page.goto("/tags");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("tag-index")).toBeVisible();
  });
});
