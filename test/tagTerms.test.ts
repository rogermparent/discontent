// @vitest-environment node
//
// The recipe site's adoption of the engine's term-record kind (24c).
//
// Three groups, and they are deliberately different in kind:
//
//  1. **The join rules, pure.** Which label wins, what order the recipes come
//     in, how far a breadcrumb walks. These are the whole of what this phase
//     decides, they live in `tagVocabulary.ts` with no Next and no LMDB
//     underneath, and a test that had to build an index to check "the record's
//     label beats the fold's" would be pinning plumbing instead of the rule.
//
//  2. **The term → featured reference edge, against the real engine** in a
//     tmpdir — the harness from `test/featured.test.ts`. This is the half no
//     pure test can reach: that the feature's index really borrows the record's
//     label and picture, and that renaming the record rewrites both the
//     feature's data file and its borrowed values. It is the T8 pattern with
//     the site's own edge in place of the engine's self-edge.
//
//  3. **An import-order tripwire** for T17, which is the trap this phase spent
//     a decision on: the taxonomy modules must never gain a value import that
//     reaches a content config, and the failure mode is a `ReferenceError` at
//     import time that only appears when a taxonomy module is imported *first*.

import { mkdtemp, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { updateContent } from "@discontent/cms/content/updateContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import type { TermTree } from "@discontent/cms/taxonomies/tree";

import { featuredRecipeContentConfig } from "../websites/recipe-website/common/controller/featuredRecipeContentConfig";
import { tagTermContentConfig } from "../websites/recipe-website/common/controller/tagTermContentConfig";
import {
  applyPinned,
  breadcrumbOf,
  childrenOf,
  mergeTagVocabulary,
} from "../websites/recipe-website/common/controller/tagVocabulary";
import type {
  FeaturedRecipe,
  FeaturedRecipeEntryKey,
  FeaturedRecipeEntryValue,
  TagTerm,
  TagTermEntryKey,
  TagTermIndexValue,
} from "../websites/recipe-website/common/controller/types";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { feature } from "../websites/recipe-website/editor/controller/curation/featured";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";

/* ------------------------------------------------------------------ */
/* 1. The join rules, pure                                             */
/* ------------------------------------------------------------------ */

describe("mergeTagVocabulary", () => {
  it("sums both carriers' counts and lets the record's label win", () => {
    expect(
      mergeTagVocabulary({
        recipeTerms: [
          { slug: "cookies", label: "cookies", count: 8 },
          { slug: "quick", label: "quick", count: 2 },
        ],
        groupTerms: [{ slug: "cookies", label: "Cookie", count: 1 }],
        tree: {
          cookies: { label: "Cookies", parent: "dessert", children: [] },
        },
      }),
    ).toEqual([
      /* Sorted by slug, and 8 + 1 — the record moved the label, not the count. */
      { slug: "cookies", label: "Cookies", count: 9 },
      { slug: "quick", label: "quick", count: 2 },
    ]);
  });

  it("falls back to the recipe fold's label, then the group fold's", () => {
    expect(
      mergeTagVocabulary({
        recipeTerms: [{ slug: "quick", label: "quick", count: 2 }],
        groupTerms: [
          { slug: "quick", label: "Quick", count: 1 },
          { slug: "weeknight", label: "Weeknight", count: 1 },
        ],
      }),
    ).toEqual([
      /* Recipes win a slug both carry — the corpus is overwhelmingly recipes. */
      { slug: "quick", label: "quick", count: 3 },
      { slug: "weeknight", label: "Weeknight", count: 1 },
    ]);
  });

  it("lists a record with no carriers at count 0", () => {
    expect(
      mergeTagVocabulary({
        recipeTerms: [],
        groupTerms: [],
        tree: { holiday: { label: "Holiday", children: [] } },
      }),
    ).toEqual([{ slug: "holiday", label: "Holiday", count: 0 }]);
  });

  it("is empty when every source is", () => {
    expect(mergeTagVocabulary({})).toEqual([]);
    expect(
      mergeTagVocabulary({ recipeTerms: null, groupTerms: null, tree: null }),
    ).toEqual([]);
  });
});

const TREE: TermTree = {
  dessert: { label: "Dessert", children: ["cookies"] },
  cookies: { label: "Cookies", parent: "dessert", children: ["linzer"] },
  linzer: { label: "Linzer", parent: "cookies", children: [] },
  orphan: { label: "Orphan", parent: "gone", children: [] },
};

describe("breadcrumbOf", () => {
  it("walks the parent chain root first, this term last", () => {
    expect(breadcrumbOf(TREE, "linzer").map((t) => t.slug)).toEqual([
      "dessert",
      "cookies",
      "linzer",
    ]);
  });

  it("gives a root term a trail of one", () => {
    expect(breadcrumbOf(TREE, "dessert").map((t) => t.slug)).toEqual([
      "dessert",
    ]);
  });

  it("keeps a dangling parent out of the trail", () => {
    /* `gone` has no node, so the walk stops at the term that names it. */
    expect(breadcrumbOf(TREE, "orphan").map((t) => t.slug)).toEqual([
      "gone",
      "orphan",
    ]);
  });

  it("terminates on a hand-edited cycle", () => {
    /*
     * The fold is explicitly allowed to hand one of these back — `A.parent = B`
     * and `B.parent = A` is two lines a text editor can write — so the visited
     * set here is what stops a breadcrumb looping forever (D2).
     */
    const cyclic: TermTree = {
      a: { label: "A", parent: "b", children: ["b"] },
      b: { label: "B", parent: "a", children: ["a"] },
    };
    expect(breadcrumbOf(cyclic, "a").map((t) => t.slug)).toEqual(["b", "a"]);
  });

  it("gives a term the tree has never heard of a trail of itself", () => {
    expect(breadcrumbOf(TREE, "nope")).toEqual([
      { slug: "nope", label: "nope", count: 0 },
    ]);
  });

  it("prints the vocabulary's counts when it is given them", () => {
    const counts = new Map([
      ["dessert", { slug: "dessert", label: "Dessert", count: 8 }],
    ]);
    expect(breadcrumbOf(TREE, "cookies", counts)).toEqual([
      { slug: "dessert", label: "Dessert", count: 8 },
      { slug: "cookies", label: "Cookies", count: 0 },
    ]);
  });
});

describe("childrenOf", () => {
  it("lists direct children in the tree's order, with counts", () => {
    const counts = new Map([
      ["cookies", { slug: "cookies", label: "Cookies", count: 8 }],
    ]);
    expect(childrenOf(TREE, "dessert", counts)).toEqual([
      { slug: "cookies", label: "Cookies", count: 8 },
    ]);
  });

  it("is empty for a leaf and for a term the tree does not hold", () => {
    expect(childrenOf(TREE, "linzer")).toEqual([]);
    expect(childrenOf(TREE, "nope")).toEqual([]);
    expect(childrenOf(null, "dessert")).toEqual([]);
  });
});

describe("applyPinned", () => {
  const items = [{ slug: "c" }, { slug: "b" }, { slug: "a" }];

  it("puts the pinned slugs first, in the pinned order", () => {
    expect(applyPinned(items, ["a", "b"])).toEqual([
      { slug: "a" },
      { slug: "b" },
      { slug: "c" },
    ]);
  });

  it("ignores a pinned slug that does not carry the term", () => {
    /*
     * `pinned` and `tags` are independent writes, so a stale pin is an ordinary
     * state and the page's job is to go on reading correctly (D5). 24e's
     * `term_update` is what refuses to store one.
     */
    expect(applyPinned(items, ["ghost", "a"])).toEqual([
      { slug: "a" },
      { slug: "c" },
      { slug: "b" },
    ]);
  });

  it("leaves the list alone for no pins and for pins that all miss", () => {
    expect(applyPinned(items)).toBe(items);
    expect(applyPinned(items, [])).toBe(items);
    expect(applyPinned(items, ["ghost"])).toBe(items);
  });

  it("does not duplicate a slug pinned twice", () => {
    expect(applyPinned(items, ["a", "a"])).toEqual([
      { slug: "a" },
      { slug: "c" },
      { slug: "b" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. The term → featured edge, against the real engine                */
/* ------------------------------------------------------------------ */

describe("the term record's reference edges", () => {
  let contentDirectory: string;
  let ctx: CurationContext;
  let previousContentDirectory: string | undefined;

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "tag-terms-"));
    ctx = { contentDirectory };
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;
    await createRecipe(ctx, { name: "Naan", slug: "naan" });
  });

  afterEach(async () => {
    await closeCachedEnvironments();
    if (previousContentDirectory === undefined) {
      delete process.env.CONTENT_DIRECTORY;
    } else {
      process.env.CONTENT_DIRECTORY = previousContentDirectory;
    }
    await rm(contentDirectory, { recursive: true, force: true });
  });

  function createTerm(slug: string, data: TagTerm) {
    return createContent<TagTerm, TagTermIndexValue, TagTermEntryKey>({
      config: tagTermContentConfig,
      slug,
      data,
      contentDirectory,
    });
  }

  function readFeaturedFile(slug: string): Promise<FeaturedRecipe> {
    return readJson(
      join(
        contentDirectory,
        "featured-recipes/data",
        slug,
        "featured-recipe.json",
      ),
    );
  }

  async function readFeaturedIndexValue(
    slug: string,
  ): Promise<FeaturedRecipeEntryValue | undefined> {
    const { entries } = await readContentIndex<
      FeaturedRecipeEntryValue,
      FeaturedRecipeEntryKey,
      { slug: string; value: FeaturedRecipeEntryValue }
    >({
      config: featuredRecipeContentConfig,
      contentDirectory,
      map: ({ key: [, entrySlug], value }) => ({ slug: entrySlug, value }),
    });
    return entries.find((entry) => entry.slug === slug)?.value;
  }

  it("borrows the record's label and image onto the feature's index", async () => {
    await createTerm("cookies", {
      label: "Cookies",
      date: 1_700_000_000_000,
      description: "Small, sweet, baked.",
      image: "cookies.jpg",
    });

    const result = await feature(ctx, {
      term: "cookies",
      slug: "cookies-feature",
    });
    expect(result).toMatchObject({
      slug: "cookies-feature",
      term: "cookies",
      url: "/featured-recipe/cookies-feature",
    });

    /* Only the key that is set reaches disk, as the other two targets do. */
    const stored = await readFeaturedFile("cookies-feature");
    expect(Object.keys(stored).sort()).toEqual(["date", "term"]);

    expect(await readFeaturedIndexValue("cookies-feature")).toMatchObject({
      term: "cookies",
      termLabel: "Cookies",
      termImage: "cookies.jpg",
    });
  });

  it("writes no term keys at all on a feature of a recipe", async () => {
    /*
     * The byte claim (T16), in the one place a unit test can see it: the three
     * new keys are spread rather than assigned, so a recipe's feature stores the
     * exact object it stored before this phase.
     */
    await feature(ctx, { recipe: "naan", slug: "naan-feature" });
    const value = await readFeaturedIndexValue("naan-feature");
    expect(value && "term" in value).toBe(false);
    expect(value && "termLabel" in value).toBe(false);
    expect(value && "termImage" in value).toBe(false);
  });

  it("rewrites the feature when the term is renamed", async () => {
    await createTerm("cookies", { label: "Cookies", date: 1_700_000_000_000 });
    await feature(ctx, { term: "cookies", slug: "cookies-feature" });

    /*
     * The site's own edge, proved the way 24a proved the engine's self-edge
     * (T8): `updateDependents` finds the feature through
     * `tagTermContentConfig.referencedBy`, rewrites its data-file `term` to the
     * new slug and reprojects its borrowed `termLabel`.
     */
    await updateContent<TagTerm, TagTermIndexValue, TagTermEntryKey>({
      config: tagTermContentConfig,
      slug: "biscuits",
      currentSlug: "cookies",
      currentIndexKey: [1_700_000_000_000, "cookies"],
      data: { label: "Biscuits", date: 1_700_000_000_000 },
      contentDirectory,
    });

    expect((await readFeaturedFile("cookies-feature")).term).toBe("biscuits");
    expect(await readFeaturedIndexValue("cookies-feature")).toMatchObject({
      term: "biscuits",
      termLabel: "Biscuits",
    });
  });

  it("moves the borrowed label when only the label is edited", async () => {
    await createTerm("cookies", { label: "Cookies", date: 1_700_000_000_000 });
    await feature(ctx, { term: "cookies", slug: "cookies-feature" });

    await updateContent<TagTerm, TagTermIndexValue, TagTermEntryKey>({
      config: tagTermContentConfig,
      slug: "cookies",
      currentSlug: "cookies",
      currentIndexKey: [1_700_000_000_000, "cookies"],
      data: { label: "Cookies & Biscuits", date: 1_700_000_000_000 },
      contentDirectory,
    });

    expect(await readFeaturedIndexValue("cookies-feature")).toMatchObject({
      term: "cookies",
      termLabel: "Cookies & Biscuits",
    });
  });

  it("refuses a term with no record, and names it", async () => {
    /*
     * A *record*, not a tag. A bare tag with carriers and no record is an
     * ordinary state and its page renders — but a feature borrows the record's
     * label, so featuring one would produce the nameless card `requireTarget`
     * exists to prevent.
     */
    await expect(
      feature(ctx, { term: "ghost", slug: "ghost-feature" }),
    ).rejects.toMatchObject({
      code: "unknown_term",
      details: { terms: ["ghost"] },
    });
  });

  it("refuses two of the three targets, and none of them", async () => {
    await createTerm("cookies", { label: "Cookies", date: 1_700_000_000_000 });
    await expect(
      feature(ctx, { recipe: "naan", term: "cookies", slug: "both" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(feature(ctx, { slug: "neither" })).rejects.toMatchObject({
      code: "validation",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 3. The import-order tripwire (T17)                                  */
/* ------------------------------------------------------------------ */

describe("import order", () => {
  it("survives a taxonomy module being imported before any content config", async () => {
    /*
     * The trap this phase spent a decision on. `recipeContentConfig` reads
     * `taxonomies: [recipeTagTaxonomy]` as a **direct value at module
     * evaluation**, not through a thunk — so if a taxonomy module ever gained a
     * value import reaching a content config (`recipeTagTaxonomy →
     * tagTermContentConfig → featuredRecipeContentConfig → recipeContentConfig
     * → recipeTagTaxonomy`), the first import that touched a taxonomy module
     * *first* would read a `const` in its temporal dead zone and throw.
     *
     * That is why `TaxonomyConfig.terms` stays declared and unread and why site
     * readers name `tagTermContentConfig` directly. 24d adds `/search/terms`,
     * which would be the import that discovers this the hard way; this case is
     * what discovers it here instead.
     */
    vi.resetModules();
    const [recipeTaxonomy, groupTaxonomy] = await Promise.all([
      import("../websites/recipe-website/common/controller/recipeTagTaxonomy"),
      import("../websites/recipe-website/common/controller/groupTagTaxonomy"),
    ]);
    expect(recipeTaxonomy.recipeTagTaxonomy.name).toBe("tag");
    expect(groupTaxonomy.groupTagTaxonomy.name).toBe("tag");

    /* Only now the configs, which is the order that used to be the safe one. */
    const configs =
      await import("../websites/recipe-website/common/controller/tagTermContentConfig");
    expect(configs.tagTermContentConfig.contentType).toBe("tag-terms");
  });
});
