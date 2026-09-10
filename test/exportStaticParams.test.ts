// @vitest-environment node
//
// The rule every dynamic route in a static export has to obey, pinned once.
//
// `output: "export"` rejects a dynamic route whose `generateStaticParams` comes
// back **empty** — it raises "Page … is missing generateStaticParams()" for an
// empty array, not just for a missing function. So "the corpus has none of
// these" is not a quiet no-op that emits no pages; it fails the build outright.
//
// Three routes already carried a guard (`createPaginatedIndexRoute`,
// `createPaginatedJsonRoute`, `generateTagStaticParams`) and two did not. The
// two that did not were `/recipe/[slug]` and `/featured-recipe/[slug]`, and the
// second was reproducible rather than theoretical: building the export against
// the `search-corpus` fixture, which holds 67 recipes and no featured recipes,
// failed with
//
//   Error: Page "/featured-recipe/[slug]" is missing "generateStaticParams()"
//   so it cannot be used with "output: export" config.
//
// §12.3 recorded that as a latent defect ("it will bite whoever runs this check
// on a fresh corpus"); the Phase 0 spike ran into it. These tests are the
// red-before/green-after in a form that runs in a second rather than a build.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const readAllRecipeIds = vi.fn<() => Promise<string[]>>();
const readAllFeaturedRecipeIds = vi.fn<() => Promise<string[]>>();
const readAllGroupIds = vi.fn<() => Promise<string[]>>();
const readTagIndex = vi.fn<() => Promise<Record<string, unknown> | null>>();

/*
 * Mocked at the data layer rather than stubbed at the LMDB layer: these modules
 * build cached readers at import time, and the question here is only what the
 * params function does with the list it is handed.
 */
vi.mock("recipe-website-common/controller/data/readRecipePages", () => ({
  readAllRecipeIds: () => readAllRecipeIds(),
  recipePages: {},
  default: {},
}));

vi.mock(
  "recipe-website-common/controller/data/readFeaturedRecipePages",
  () => ({
    readAllFeaturedRecipeIds: () => readAllFeaturedRecipeIds(),
    featuredRecipePages: {},
    default: {},
  }),
);

vi.mock("recipe-website-common/controller/data/readGroupPages", () => ({
  readAllGroupIds: () => readAllGroupIds(),
  groupPages: {},
  default: {},
}));

vi.mock("recipe-website-common/controller/data/readRecipeItem", () => ({
  recipeItems: { read: vi.fn() },
  default: {},
}));

/*
 * Mocked for a reason the others are not: nothing here asks it anything.
 * `/recipe/[slug]` renders `RecipeView`, which renders "Appears in", which
 * imports the cached aggregate read — and `createCachedAggregateRead` calls
 * `unstable_cache` at *module scope*, which the `next/cache` stub does not
 * provide. So importing the recipe page for its `generateStaticParams` would
 * throw on an import three components deep from anything this file asserts.
 */
vi.mock("recipe-website-common/controller/data/readGroupsByRecipe", () => ({
  groupsByRecipeReads: { read: async () => ({}) },
  default: {},
}));

vi.mock("recipe-website-common/controller/data/readRecipeTagIndex", () => ({
  recipeTagIndexReads: { read: () => readTagIndex() },
  default: {},
}));

/*
 * Warm the module graph in a hook rather than inside the first assertion (F31b).
 *
 * Every test below awaits an `import()` of a Next app-router page, which pulls
 * that page's whole transitive component graph through vitest's transform. The
 * first test in the file pays that cost and the rest ride the module cache, so
 * the transform time lands on whichever assertion happens to be first: alone,
 * this file spends 860ms on the first `/recipe/[slug]` case and 349ms on the
 * first `/featured-recipe/[slug]` case, of a 2.47s run with 908ms attributed to
 * transform. Under the full 16-file parallel suite that 860ms crossed vitest's
 * default 5,000ms `testTimeout` in 2 of 7 runs while gating F28 (§12.13) — a
 * timeout charged to a test that does one array comparison.
 *
 * Charging it to a hook fixes the attribution instead of widening the budget.
 * `vi.mock` is hoisted, and each factory above references its mock lazily
 * (`readAllRecipeIds: () => readAllRecipeIds()`), so importing before any
 * `mockResolvedValue` is set resolves nothing and calls nothing.
 */
beforeAll(async () => {
  await Promise.all([
    import("../websites/recipe-website/export/src/app/(recipes)/recipe/[slug]/page"),
    import("../websites/recipe-website/export/src/app/(recipes)/featured-recipe/[slug]/page"),
    import("../websites/recipe-website/export/src/app/(recipes)/group/[slug]/page"),
    import("../websites/recipe-website/common/components/TagPage/routes"),
  ]);
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a dynamic export route never emits zero params", () => {
  it("/recipe/[slug] emits a placeholder for a corpus with no recipes", async () => {
    readAllRecipeIds.mockResolvedValue([]);
    const { generateStaticParams } =
      await import("../websites/recipe-website/export/src/app/(recipes)/recipe/[slug]/page");
    const params = await generateStaticParams();
    expect(params).toHaveLength(1);
  });

  it("/recipe/[slug] emits one param per recipe otherwise", async () => {
    readAllRecipeIds.mockResolvedValue(["a", "b", "c"]);
    const { generateStaticParams } =
      await import("../websites/recipe-website/export/src/app/(recipes)/recipe/[slug]/page");
    expect(await generateStaticParams()).toEqual([
      { slug: "a" },
      { slug: "b" },
      { slug: "c" },
    ]);
  });

  /*
   * The one that actually broke a build. A content directory with recipes and
   * no featured recipes is an ordinary state — a new site, and `search-corpus`.
   */
  it("/featured-recipe/[slug] emits a placeholder when nothing is featured", async () => {
    readAllFeaturedRecipeIds.mockResolvedValue([]);
    const { generateStaticParams } =
      await import("../websites/recipe-website/export/src/app/(recipes)/featured-recipe/[slug]/page");
    const params = await generateStaticParams();
    expect(params).toHaveLength(1);
  });

  it("/featured-recipe/[slug] emits one param per feature otherwise", async () => {
    readAllFeaturedRecipeIds.mockResolvedValue(["x", "y"]);
    const { generateStaticParams } =
      await import("../websites/recipe-website/export/src/app/(recipes)/featured-recipe/[slug]/page");
    expect(await generateStaticParams()).toEqual([
      { slug: "x" },
      { slug: "y" },
    ]);
  });

  /*
   * Groups arrive with the guard rather than gaining it later, and the empty
   * case is not hypothetical: every existing fixture except `three-recipes-groups`
   * has no groups at all, so this is what the export does against almost all of
   * them.
   */
  it("/group/[slug] emits a placeholder for a corpus with no groups", async () => {
    readAllGroupIds.mockResolvedValue([]);
    const { generateStaticParams } =
      await import("../websites/recipe-website/export/src/app/(recipes)/group/[slug]/page");
    const params = await generateStaticParams();
    expect(params).toHaveLength(1);
  });

  it("/group/[slug] emits one param per group otherwise", async () => {
    readAllGroupIds.mockResolvedValue([
      "week-of-may-4",
      "weeknight-favourites",
    ]);
    const { generateStaticParams } =
      await import("../websites/recipe-website/export/src/app/(recipes)/group/[slug]/page");
    expect(await generateStaticParams()).toEqual([
      { slug: "week-of-may-4" },
      { slug: "weeknight-favourites" },
    ]);
  });

  /* Already guarded before this pass — pinned so it stays that way. */
  it("/tags/[tag] emits a placeholder for a corpus with no tags", async () => {
    readTagIndex.mockResolvedValue({});
    const { generateTagStaticParams } =
      await import("../websites/recipe-website/common/components/TagPage/routes");
    expect(await generateTagStaticParams()).toEqual([{ tag: "_" }]);
  });
});
