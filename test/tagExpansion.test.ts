// @vitest-environment node
//
// Hierarchy-aware `tag:` (epic 31, 31b — 24-D6).
//
// Two halves. The pure one pins the resolver's rules: a term reaches its whole
// subtree, a leaf still reconciles its slug with its label, a hand-edited
// cycle terminates, and an expansion only ever *adds* to the prefix match.
// The fixture half is the parity claim: on a copy of `christmas-cookies` with
// a `linzer` term under `cookies`, the server (`recipe_search`, `list --tag`)
// and the browser (`matchesFilter` over the `/search/terms` vocabulary, and
// `/make`'s scope) answer `tag:cookies` and `tag:dessert` alike — descendants
// included.

import { copy, mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import { createContent } from "@discontent/cms/content/createContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import { termTreeAggregate } from "@discontent/cms/taxonomies/tree";

import {
  matchesFilter,
  parseQuery,
} from "../websites/recipe-website/common/components/SearchForm/queryLanguage";
import { scopeRecipes } from "../websites/recipe-website/common/components/MakePage/scope";
import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import { groupTagTaxonomy } from "../websites/recipe-website/common/controller/groupTagTaxonomy";
import { recipeContentConfig } from "../websites/recipe-website/common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "../websites/recipe-website/common/controller/recipeTagTaxonomy";
import {
  buildTagExpansion,
  buildTagExpansionFromTree,
} from "../websites/recipe-website/common/controller/tagExpansion";
import { tagTermContentConfig } from "../websites/recipe-website/common/controller/tagTermContentConfig";
import {
  mergeTagVocabulary,
  tagOptions,
  termHierarchy,
} from "../websites/recipe-website/common/controller/tagVocabulary";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  createRecipe,
  listRecipes,
  readAllRecipeRows,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import { searchRecipes } from "../websites/recipe-website/editor/controller/curation/search";

/* ------------------------------------------------------------------ */
/* 1. The resolver, pure                                              */
/* ------------------------------------------------------------------ */

const TERMS = [
  { slug: "dessert", label: "Dessert" },
  { slug: "cookies", label: "Cookies", parent: "dessert" },
  { slug: "linzer", label: "Linzer Cookies", parent: "cookies" },
  { slug: "slow-cooker", label: "slow cooker" },
  { slug: "drink", label: "Drinks" },
];

function filterOf(query: string) {
  return parseQuery(query).filter;
}

describe("buildTagExpansion", () => {
  const resolver = buildTagExpansion(TERMS);

  it("reaches the whole subtree, by slug or by label", () => {
    expect([...(resolver.expandTerm("tag", "dessert") ?? [])].sort()).toEqual(
      ["cookies", "dessert", "linzer", "linzer cookies"].sort(),
    );
    expect(resolver.expandTerm("tag", "linzer cookies")).toEqual(
      new Set(["linzer", "linzer cookies"]),
    );
  });

  it("answers a leaf with its own two spellings, and nothing for an unknown value", () => {
    expect(resolver.expandTerm("tag", "slow cooker")).toEqual(
      new Set(["slow-cooker", "slow cooker"]),
    );
    expect(resolver.expandTerm("tag", "drinks")).toEqual(
      new Set(["drink", "drinks"]),
    );
    expect(resolver.expandTerm("tag", "nope")).toBeUndefined();
  });

  it("terminates on a hand-edited cycle, and a term is never its own child", () => {
    const cyclic = buildTagExpansion([
      { slug: "a", label: "A", parent: "b" },
      { slug: "b", label: "B", parent: "a" },
      { slug: "c", label: "C", parent: "c" },
    ]);
    expect(cyclic.expandTerm("tag", "a")).toEqual(new Set(["a", "b"]));
    expect(cyclic.expandTerm("tag", "c")).toEqual(new Set(["c"]));
  });

  it("builds the same expansion from the stored tree", () => {
    const fromTree = buildTagExpansionFromTree({
      dessert: { label: "Dessert", children: ["cookies"] },
      cookies: { label: "Cookies", parent: "dessert", children: [] },
    });
    expect(fromTree.expandTerm("tag", "dessert")).toEqual(
      new Set(["dessert", "cookies"]),
    );
  });
});

describe("matchesFilter with a resolver", () => {
  const resolver = buildTagExpansion(TERMS);
  const linzer = { name: "Linzer bars", tags: ["linzer"] };
  const slow = { name: "Chili", tags: ["slow-cooker"] };

  it("matches a descendant's carrier for a parent term", () => {
    expect(matchesFilter(linzer, filterOf("tag:dessert"), resolver)).toBe(true);
    expect(matchesFilter(linzer, filterOf("tag:cookies"), resolver)).toBe(true);
    /* Without a resolver, today's prefix match: no. */
    expect(matchesFilter(linzer, filterOf("tag:dessert"))).toBe(false);
  });

  it("negates through the expansion, and never loses a prefix match", () => {
    expect(matchesFilter(linzer, filterOf("-tag:dessert"), resolver)).toBe(
      false,
    );
    /* `tag:lin` names no term: the prefix match still answers. */
    expect(matchesFilter(linzer, filterOf("tag:lin"), resolver)).toBe(true);
    /* A label spelling reaches a slug-tagged carrier. */
    expect(matchesFilter(slow, filterOf('tag:"slow cooker"'), resolver)).toBe(
      true,
    );
    expect(matchesFilter(slow, filterOf('tag:"slow cooker"'))).toBe(false);
  });
});

describe("termHierarchy", () => {
  it("totals distinct carriers per subtree and keeps roots with children only", () => {
    const tree = {
      dessert: { label: "Dessert", children: ["cookies"] },
      cookies: { label: "Cookies", parent: "dessert", children: ["linzer"] },
      linzer: { label: "Linzer", parent: "cookies", children: [] },
      holiday: { label: "Holiday", children: [] },
    };
    const carriers: Record<string, string[]> = {
      dessert: ["recipe:a", "recipe:b"],
      cookies: ["recipe:a", "recipe:c"],
      linzer: ["recipe:c", "recipe:d"],
    };
    const counts = new Map(
      Object.entries(carriers).map(([slug, items]) => [
        slug,
        { slug, label: slug, count: items.length },
      ]),
    );
    const [dessert, ...rest] = termHierarchy(
      tree,
      counts,
      (slug) => carriers[slug] ?? [],
    );
    expect(rest).toEqual([]);
    expect(dessert).toMatchObject({ slug: "dessert", count: 2, total: 4 });
    expect(dessert.children[0]).toMatchObject({ slug: "cookies", total: 3 });
    expect(dessert.children[0].children[0]).toMatchObject({
      slug: "linzer",
      total: 2,
      children: [],
    });
  });
});

/* ------------------------------------------------------------------ */
/* 2. Server and browser agree, on the fixture                        */
/* ------------------------------------------------------------------ */

const FIXTURE = resolve(
  __dirname,
  "../websites/recipe-website/editor/playwright/fixtures/test-content/christmas-cookies",
);

describe("server/browser parity on christmas-cookies + a linzer term", () => {
  let contentDirectory: string;
  let ctx: CurationContext;
  let previousContentDirectory: string | undefined;

  beforeAll(async () => {
    await closeCachedEnvironments();
    contentDirectory = await mkdtemp(join(tmpdir(), "tag-expansion-"));
    await copy(FIXTURE, contentDirectory);
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;
    ctx = { contentDirectory };

    /* `linzer` under `cookies` under `dessert`, and a recipe that carries
     * only `linzer`: only the expansion can reach it from either parent. */
    await createContent({
      config: tagTermContentConfig,
      slug: "linzer",
      data: { label: "Linzer", parent: "cookies", date: 1764720000000 },
      contentDirectory,
    });
    await createRecipe(ctx, { name: "Linzer Bars", tags: ["linzer"] });
  });

  afterAll(async () => {
    await closeCachedEnvironments();
    if (previousContentDirectory === undefined) {
      delete process.env.CONTENT_DIRECTORY;
    } else {
      process.env.CONTENT_DIRECTORY = previousContentDirectory;
    }
    await rm(contentDirectory, { recursive: true, force: true });
  });

  /** The browser's resolver: `/search/terms`' vocabulary, read Node-safe. */
  async function browserResolver() {
    const [recipeTerms, groupTerms, tree] = await Promise.all([
      readTaxonomyTerms({
        config: recipeContentConfig,
        taxonomy: recipeTagTaxonomy,
        contentDirectory,
      }),
      readTaxonomyTerms({
        config: groupContentConfig,
        taxonomy: groupTagTaxonomy,
        contentDirectory,
      }),
      readAggregate({
        config: tagTermContentConfig,
        aggregateConfig: termTreeAggregate(),
        contentDirectory,
      }),
    ]);
    return buildTagExpansion(
      tagOptions(mergeTagVocabulary({ recipeTerms, groupTerms, tree }), tree),
    );
  }

  for (const query of ["tag:cookies", "tag:dessert", "tag:Cookies"]) {
    it(`${query}: recipe_search, list --tag, matchesFilter and /make agree, descendants included`, async () => {
      const server = (await searchRecipes(ctx, query, { limit: 100 })).recipes
        .map((row) => row.slug)
        .sort();
      expect(server).toContain("linzer-bars");
      expect(server).toContain("linzer-cookies");
      expect(server).not.toContain("weeknight-chili");

      const rows = await readAllRecipeRows(ctx);
      const resolver = await browserResolver();
      const browser = rows
        .filter((row) => matchesFilter(row, filterOf(query), resolver))
        .map((row) => row.slug)
        .sort();
      expect(browser).toEqual(server);
      expect(
        scopeRecipes(rows, query, resolver)
          .map((row) => row.slug)
          .sort(),
      ).toEqual(server);

      const listed = await listRecipes(ctx, {
        tag: query.slice("tag:".length),
        limit: 100,
      });
      expect(listed.recipes.map((row) => row.slug).sort()).toEqual(server);
    });
  }

  it("tag:cookies is the eight cookies plus the linzer descendant", async () => {
    const result = await searchRecipes(ctx, "tag:cookies", { limit: 100 });
    expect(result.total).toBe(9);
    /* `tag:linzer` is the leaf alone. */
    const linzer = await searchRecipes(ctx, "tag:linzer", { limit: 100 });
    expect(linzer.recipes.map((row) => row.slug)).toEqual(["linzer-bars"]);
  });
});
