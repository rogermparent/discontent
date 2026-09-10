import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

/*
 * `getAllTags` reads a value folded at write time (F10c) instead of loading
 * every recipe and building a `Set` per render. Four surfaces consume it — the
 * homepage's browse chips and the tag suggestions in the new/edit/copy forms —
 * and none changed shape, so this spec's job is to prove the swap is invisible
 * where it should be and correct where it matters.
 *
 * `search-corpus` is the only fixture with tags on more than a couple of
 * recipes: 67 recipes carrying eight distinct tags.
 */
const CORPUS_TAGS = [
  "baked",
  "bread",
  "chocolate",
  "dessert",
  "french",
  "quick",
  "salad",
  "soup",
];

/** A recipe in `search-corpus` that carries tags. */
const TAGGED_SLUG = "chocolate-truffle-cake";

async function chipNames(page: Page): Promise<string[]> {
  return page
    .getByRole("region", { name: "Browse by tag" })
    .getByRole("link")
    .allInnerTexts();
}

async function signedInForm(page: Page): Promise<void> {
  const signIn = page.getByRole("button", {
    name: "Sign in with Credentials",
    exact: true,
  });
  if (await signIn.isVisible()) await fillSignInForm(page);
  // Gate on form hydration so the first field interaction isn't dropped.
  await markdownEditorReady(page, "description");
}

async function addTag(page: Page, tag: string): Promise<void> {
  const input = page.getByLabel("Add a tag");
  await input.fill(tag);
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: `Remove tag ${tag}` }),
  ).toBeVisible();
}

test.describe("Recipe tag aggregate", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("search-corpus");
  });

  test("the homepage browse chips render the folded tag set", async ({
    page,
  }) => {
    await page.goto("/");
    /*
     * Sorted alphabetically by `finalize`, not by the order recipes were
     * written. The sort is load-bearing rather than cosmetic: the value is
     * hashed, so an unstable order would report a change on every write.
     */
    expect(await chipNames(page)).toEqual(CORPUS_TAGS);
  });

  test("the new-recipe form suggests every tag in the corpus", async ({
    page,
  }) => {
    await page.goto("/new-recipe");
    await signedInForm(page);

    for (const tag of CORPUS_TAGS) {
      await expect(
        page.getByRole("button", { name: `Add tag ${tag}`, exact: true }),
      ).toBeVisible();
    }
  });

  test("the edit form suggests them too", async ({ page }) => {
    await page.goto(`/recipe/${TAGGED_SLUG}/edit`);
    await signedInForm(page);

    await expect(
      page.getByRole("button", { name: "Add tag soup", exact: true }),
    ).toBeVisible();
  });

  test("the copy form suggests them too", async ({ page }) => {
    await page.goto(`/recipe/${TAGGED_SLUG}/copy`);
    await signedInForm(page);

    await expect(
      page.getByRole("button", { name: "Add tag soup", exact: true }),
    ).toBeVisible();
  });

  /*
   * The positive half of the trigger, driven through the real write path
   * rather than the engine: a brand-new tag moves the value, so the chip
   * appears without anything rebuilding the corpus.
   */
  test("a recipe with a new tag adds its chip", async ({ page }) => {
    await page.goto("/new-recipe");
    await signedInForm(page);

    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill("Tag Probe");
    await addTag(page, "brandnew");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Tag Probe", exact: true }),
    ).toBeVisible();

    await page.goto("/");
    expect(await chipNames(page)).toEqual([...CORPUS_TAGS, "brandnew"].sort());
  });

  /*
   * The negative half. Renaming a recipe rewrites its index value and dirties
   * a page, and the tag set is identical — so the chips must not move. Before
   * F10c that held only because the row was recomputed from scratch on every
   * render; now it holds because the write reported `changed: false` and fired
   * no tag at all.
   */
  test("renaming a recipe leaves the chips alone", async ({ page }) => {
    await page.goto("/");
    const before = await chipNames(page);

    await page.goto(`/recipe/${TAGGED_SLUG}/edit`);
    await signedInForm(page);
    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill("Renamed Cake");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Renamed Cake", exact: true }),
    ).toBeVisible();

    await page.goto("/");
    expect(await chipNames(page)).toEqual(before);
  });
});
