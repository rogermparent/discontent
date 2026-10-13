// @vitest-environment node
//
// 34a (D2): what `resolveTermPage` *reads*, with the cached readers mocked.
//
// The page's cache behaviour is exactly its reads: a term page expires when a
// tag on one of them fires. So the claim "a carrier change expires only the
// pages whose subtree it touches" is the claim that the page reads one
// by-term key per subtree slug and alias — including keys nothing carries yet
// — and never the whole `terms` clouds.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TermTree } from "@discontent/cms/taxonomies/tree";

const reads = vi.hoisted(() => ({
  recipeKeys: [] as string[],
  groupKeys: [] as string[],
  clouds: 0,
}));

const TREE: TermTree = {
  course: { label: "Course", children: ["dessert"] },
  dessert: {
    label: "Dessert",
    parent: "course",
    children: ["cookies", "bars"],
    aliases: ["Sweets"],
  },
  cookies: { label: "Cookies", parent: "dessert", children: [] },
  bars: { label: "Bars", parent: "dessert", children: [] },
};

const ROWS: Record<string, { label: string; items: unknown[] }> = {
  cookies: {
    label: "cookies",
    items: [{ slug: "linzer", date: 2, name: "Linzer", tags: ["cookies"] }],
  },
  sweets: {
    label: "sweets",
    items: [{ slug: "fudge", date: 1, name: "Fudge", tags: ["sweets"] }],
  },
};

function taxonomyReads(keys: string[]) {
  return {
    terms: {
      read: async () => {
        reads.clouds += 1;
        return [];
      },
    },
    byTerm: {
      read: async () => {
        throw new Error("a term page must not read the whole by-term map");
      },
      readKey: async (key: string) => {
        keys.push(key);
        return keys === reads.recipeKeys ? (ROWS[key] ?? null) : null;
      },
    },
  };
}

vi.mock(
  "../websites/recipe-website/common/controller/data/readRecipeTagIndex",
  () => ({ recipeTagReads: taxonomyReads(reads.recipeKeys) }),
);
vi.mock(
  "../websites/recipe-website/common/controller/data/readGroupTagIndex",
  () => ({ groupTagReads: taxonomyReads(reads.groupKeys) }),
);
vi.mock(
  "../websites/recipe-website/common/controller/data/readTagTerms",
  () => ({
    tagTermReads: {
      tree: { read: async () => TREE },
      items: {
        read: async (slug: string) =>
          TREE[slug] ? { label: TREE[slug].label } : null,
      },
    },
  }),
);

const { resolveTermPage } =
  await import("../websites/recipe-website/common/controller/data/readTermPage");

beforeEach(() => {
  reads.recipeKeys.length = 0;
  reads.groupKeys.length = 0;
  reads.clouds = 0;
});

describe("resolveTermPage's reads (34a)", () => {
  it("reads one key per subtree slug and alias, and no cloud", async () => {
    const page = await resolveTermPage("course");
    const expected = ["course", "dessert", "sweets", "cookies", "bars"];
    expect(reads.recipeKeys).toEqual(expected);
    expect(reads.groupKeys).toEqual(expected);
    expect(reads.clouds).toBe(0);
    /* `bars` carries nothing yet and is still read: its first carrier
     * fires its key tag, which this page's read of it carries. */
    expect(page?.recipes.map((recipe) => recipe.slug)).toEqual([
      "linzer",
      "fudge",
    ]);
    expect(page?.recipeCount).toBe(2);
  });

  it("reads only its own key for a leaf", async () => {
    await resolveTermPage("cookies");
    expect(reads.recipeKeys).toEqual(["cookies"]);
    expect(reads.groupKeys).toEqual(["cookies"]);
    expect(reads.clouds).toBe(0);
  });
});
