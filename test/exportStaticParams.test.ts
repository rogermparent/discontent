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
const readGroupTagIndex =
  vi.fn<() => Promise<Record<string, unknown> | null>>();
/* The term records' tree (24c) — the third source `/tags/[tag]` unions. */
const readTermTree = vi.fn<() => Promise<Record<string, unknown> | null>>();

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
 * The same, for the group thumbnail's member walk (24b). `/tags/[tag]` renders
 * `GroupList` now, whose thumbnails read groups and recipes by slug — and
 * `createCachedItemRead` runs at module scope, so importing the route for its
 * params function would otherwise evaluate that read.
 */
vi.mock("recipe-website-common/controller/data/readGroupItem", () => ({
  groupItems: { read: vi.fn() },
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

/* The same, for the group page's own "Appears in" block (23c). */
vi.mock("recipe-website-common/controller/data/readGroupsByGroup", () => ({
  groupsByGroupReads: { read: async () => ({}) },
  default: {},
}));

/*
 * Mocked **by module path**, and the export name matters (T14): the reader is
 * `recipeTagReads` since 24b and carries two cached reads rather than one, so a
 * factory still exporting `recipeTagIndexReads` would mock nothing, the real
 * module would load, and the test would silently read a content directory that
 * is not there.
 */
vi.mock("recipe-website-common/controller/data/readRecipeTagIndex", () => ({
  recipeTagReads: {
    terms: { read: async () => [] },
    byTerm: { read: () => readTagIndex() },
  },
  default: {},
}));

/*
 * Groups carry the same vocabulary since 24b, and `/tags/[tag]`'s params are
 * the union of both carriers' keys — so this module has to be mocked too, or
 * importing the route builds a cached read at module scope and
 * `unstable_cache` is not a function under the `next/cache` stub.
 */
vi.mock("recipe-website-common/controller/data/readGroupTagIndex", () => ({
  groupTagReads: {
    terms: { read: async () => [] },
    byTerm: { read: () => readGroupTagIndex() },
  },
  default: {},
}));

/*
 * The term **records** (24c), mocked by module path for the same two reasons as
 * the two above (T14): `readTagTerms.ts` builds a cached item read and a cached
 * aggregate read at *module scope*, so importing the route for its params
 * function would call `unstable_cache`, which the `next/cache` stub does not
 * provide — and the export name is `tagTermReads`, so a factory exporting
 * anything else would mock nothing and let the real module read a content
 * directory that is not there.
 *
 * `items.read` answers `null` by default: a term page's *params* never ask for
 * a record, and the cases below that do set it explicitly.
 */
vi.mock("recipe-website-common/controller/data/readTagTerms", () => ({
  tagTermReads: {
    items: { read: async () => null },
    tree: { read: () => readTermTree() },
  },
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
    readGroupTagIndex.mockResolvedValue({});
    readTermTree.mockResolvedValue({});
    const { generateTagStaticParams } =
      await import("../websites/recipe-website/common/components/TagPage/routes");
    expect(await generateTagStaticParams()).toEqual([{ tag: "_" }]);
  });

  /*
   * The union (24b). Two carriers declare one vocabulary, so a term page exists
   * if *either* has the slug — including a slug only a group carries, which
   * would have 404'd before this phase. Deduped, because the common case is a
   * term both carry.
   */
  it("/tags/[tag] emits the union of the recipe and group vocabularies", async () => {
    readTagIndex.mockResolvedValue({ dessert: {}, quick: {} });
    readGroupTagIndex.mockResolvedValue({ quick: {}, weeknight: {} });
    readTermTree.mockResolvedValue({});
    const { generateTagStaticParams } =
      await import("../websites/recipe-website/common/components/TagPage/routes");
    expect(await generateTagStaticParams()).toEqual([
      { tag: "dessert" },
      { tag: "quick" },
      { tag: "weeknight" },
    ]);
  });

  /* A group-only vocabulary still emits pages rather than the placeholder. */
  it("/tags/[tag] emits a group-only tag when no recipe carries one", async () => {
    readTagIndex.mockResolvedValue({});
    readGroupTagIndex.mockResolvedValue({ weeknight: {} });
    readTermTree.mockResolvedValue({});
    const { generateTagStaticParams } =
      await import("../websites/recipe-website/common/components/TagPage/routes");
    expect(await generateTagStaticParams()).toEqual([{ tag: "weeknight" }]);
  });

  /*
   * The third source (24c). A term someone has written a *record* for and not
   * yet assigned to anything carries no fold key at all, and it still has a
   * page — `/tags` lists it at count 0 and the export has to emit it, or that
   * link 404s. This is the case the two `byTerm` keysets alone cannot see.
   */
  it("/tags/[tag] emits a term that only a record defines", async () => {
    readTagIndex.mockResolvedValue({ dessert: {} });
    readGroupTagIndex.mockResolvedValue({});
    readTermTree.mockResolvedValue({
      dessert: { label: "Dessert", children: ["cookies"] },
      cookies: { label: "Cookies", parent: "dessert", children: [] },
      holiday: { label: "Holiday", children: [] },
    });
    const { generateTagStaticParams } =
      await import("../websites/recipe-website/common/components/TagPage/routes");
    expect(await generateTagStaticParams()).toEqual([
      { tag: "dessert" },
      { tag: "cookies" },
      { tag: "holiday" },
    ]);
  });

  /* And the placeholder still wins when all three are empty. */
  it("/tags/[tag] emits a placeholder when no source has anything", async () => {
    readTagIndex.mockResolvedValue({});
    readGroupTagIndex.mockResolvedValue({});
    readTermTree.mockResolvedValue(null);
    const { generateTagStaticParams } =
      await import("../websites/recipe-website/common/components/TagPage/routes");
    expect(await generateTagStaticParams()).toEqual([{ tag: "_" }]);
  });
});
