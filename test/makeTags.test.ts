// @vitest-environment node
//
// Epic 28, 28g: `/make`'s tag picker — the vocabulary with parents, and the
// pure tree reads the page renders from. 32j: Refine chips and the kind
// switch.

import { describe, expect, it } from "vitest";
import { tagOptions } from "../websites/recipe-website/common/controller/tagVocabulary";
import {
  breadcrumb,
  buildTagIndex,
  childrenInScope,
  refinementsInScope,
  rootsInScope,
  searchTags,
  subtreeUsage,
} from "../websites/recipe-website/common/components/MakePage/tagTree";
import {
  kindOfQuery,
  MAKE_KINDS,
  withKind,
  withoutTagPicks,
} from "../websites/recipe-website/common/components/MakePage/kinds";

const vocabulary = [
  { slug: "drink", label: "Drinks", count: 5 },
  { slug: "highball", label: "Highball", count: 3 },
  { slug: "sour", label: "Sour", count: 1 },
  { slug: "zero-proof", label: "Zero-proof", count: 2 },
  { slug: "dessert", label: "dessert", count: 1 },
  { slug: "gin", label: "gin", count: 1 },
  { slug: "holiday", label: "Holiday", count: 0 },
];
const tree = {
  drink: { label: "Drinks", children: ["highball", "sour", "zero-proof"] },
  highball: { label: "Highball", parent: "drink", children: [] },
  sour: { label: "Sour", parent: "drink", children: [] },
  "zero-proof": { label: "Zero-proof", parent: "drink", children: [] },
  holiday: { label: "Holiday", parent: "nowhere", children: [] },
};
const recipes = [
  { name: "Gin and Tonic", tags: ["drink", "gin", "highball"] },
  { name: "Zero-Proof G&T", tags: ["drink", "zero-proof", "highball"] },
  { name: "Gnista Tonic", tags: ["Zero-proof", "highball"] },
  { name: "Vodka Sour", tags: ["drink", "sour"] },
  { name: "Hand Pies", tags: ["dessert"] },
];

describe("tagOptions", () => {
  it("keeps a known parent and drops an unknown one", () => {
    const options = tagOptions(vocabulary, tree);
    expect(options.find((o) => o.slug === "highball")?.parent).toBe("drink");
    expect(options.find((o) => o.slug === "drink")?.parent).toBeUndefined();
    expect(options.find((o) => o.slug === "holiday")?.parent).toBeUndefined();
  });

  it("makes every term of a hand-edited cycle a root", () => {
    const options = tagOptions(
      [
        { slug: "a", label: "A", count: 1 },
        { slug: "b", label: "B", count: 1 },
      ],
      {
        a: { label: "A", parent: "b", children: ["b"] },
        b: { label: "B", parent: "a", children: ["a"] },
      },
    );
    expect(options).toEqual([
      { slug: "a", label: "A" },
      { slug: "b", label: "B" },
    ]);
  });
});

describe("the tag tree", () => {
  const index = buildTagIndex(tagOptions(vocabulary, tree));
  const usage = subtreeUsage(recipes, index);

  it("counts a recipe once per term in its subtree, by slug or label", () => {
    /* The Gnista tonic carries only children (one by its label spelling),
     * and still counts under `drink`. */
    expect(usage.get("drink")).toBe(4);
    expect(usage.get("highball")).toBe(3);
    expect(usage.get("zero-proof")).toBe(2);
    expect(usage.get("holiday")).toBeUndefined();
  });

  it("offers used roots by use, plus a selected one's root", () => {
    expect(rootsInScope(index, usage, new Set(), 12)).toEqual([
      "drink",
      "dessert",
      "gin",
    ]);
    expect(rootsInScope(index, usage, new Set(), 1)).toEqual(["drink"]);
    expect(rootsInScope(index, usage, new Set(["gin"]), 1)).toEqual([
      "drink",
      "gin",
    ]);
  });

  it("lists a root's used children by use, and a selected unused one", () => {
    expect(childrenInScope(index, usage, new Set(), "drink")).toEqual([
      "highball",
      "zero-proof",
      "sour",
    ]);
    const narrowed = subtreeUsage(recipes.slice(0, 1), index);
    expect(
      childrenInScope(index, narrowed, new Set(["sour"]), "drink"),
    ).toEqual(["highball", "sour"]);
  });

  it("walks a breadcrumb root first", () => {
    expect(breadcrumb(index, "zero-proof").map((n) => n.label)).toEqual([
      "Drinks",
      "Zero-proof",
    ]);
  });

  it("refines a pick with its children first, then what co-occurs (32j)", () => {
    /* Drinks picked: its children by use, then `gin` beside them. */
    const drinks = recipes.slice(0, 4);
    const scoped = subtreeUsage(drinks, index);
    expect(
      refinementsInScope(index, scoped, drinks.length, new Set(["drink"]), 12),
    ).toEqual(["highball", "zero-proof", "sour", "gin"]);
    expect(
      refinementsInScope(index, scoped, drinks.length, new Set(["drink"]), 2),
    ).toEqual(["highball", "zero-proof"]);
    /* A child picked: never it or its root; `highball` is on both, so it
     * would change nothing. */
    const zeroProof = recipes.slice(1, 3);
    expect(
      refinementsInScope(
        index,
        subtreeUsage(zeroProof, index),
        zeroProof.length,
        new Set(["zero-proof"]),
        12,
      ),
    ).toEqual([]);
    /* Nothing picked, nothing to refine. */
    expect(refinementsInScope(index, scoped, 4, new Set(), 12)).toEqual([]);
  });

  it("drills down a flat food vocabulary by co-occurrence (32j)", () => {
    const food = [
      { name: "Shallot Rice Pilaf", tags: ["side", "vegetarian"] },
      { name: "Roasted Vegetables", tags: ["side", "vegetarian", "quick"] },
      { name: "Lemon Garlic Chicken", tags: ["dinner", "quick"] },
      { name: "Chicken Fried Rice", tags: ["dinner"] },
      { name: "Lentil Soup", tags: ["dinner", "vegetarian", "soup"] },
    ];
    const flat = buildTagIndex(
      ["side", "vegetarian", "quick", "dinner", "soup"].map((slug) => ({
        slug,
        label: slug,
      })),
    );
    const vegetarian = food.filter((recipe) =>
      recipe.tags.includes("vegetarian"),
    );
    expect(
      refinementsInScope(
        flat,
        subtreeUsage(vegetarian, flat),
        vegetarian.length,
        new Set(["vegetarian"]),
        12,
      ),
    ).toEqual(["side", "dinner", "quick", "soup"]);
    /* Side picked too: of the two left, only one is quick. */
    const sides = vegetarian.filter((recipe) => recipe.tags.includes("side"));
    expect(
      refinementsInScope(
        flat,
        subtreeUsage(sides, flat),
        sides.length,
        new Set(["vegetarian", "side"]),
        12,
      ),
    ).toEqual(["quick"]);
  });

  it("searches labels and slugs, prefix first, used tags only", () => {
    expect(searchTags(index, usage, "zero", 8).map((n) => n.slug)).toEqual([
      "zero-proof",
    ]);
    expect(searchTags(index, usage, "proof", 8).map((n) => n.slug)).toEqual([
      "zero-proof",
    ]);
    expect(searchTags(index, usage, "holi", 8)).toEqual([]);
    expect(searchTags(index, usage, "", 8)).toEqual([]);
  });
});

describe("the kind switch (32j)", () => {
  const [anything, food, drinks] = MAKE_KINDS;

  it("is site config: anything, food (not a drink) and drinks", () => {
    expect(MAKE_KINDS.map(({ id, query }) => [id, query])).toEqual([
      ["any", ""],
      ["food", "-tag:drink"],
      ["drinks", "tag:drink"],
    ]);
  });

  it("reads the kind back from the query", () => {
    expect(kindOfQuery("")).toBe(anything);
    expect(kindOfQuery("tag:vegetarian chicken")).toBe(anything);
    expect(kindOfQuery("-tag:drink tag:vegetarian")).toBe(food);
    expect(kindOfQuery("tag:quick NOT tag:drink")).toBe(food);
    expect(kindOfQuery("tag:Drink tag:highball")).toBe(drinks);
    /* Inside an OR it is a choice of the person's, not a kind. */
    expect(kindOfQuery("tag:drink OR tag:dessert")).toBe(anything);
  });

  it("switches the kind and keeps the picks and the words", () => {
    expect(withKind("tag:vegetarian chicken", food)).toBe(
      "-tag:drink tag:vegetarian chicken",
    );
    expect(withKind("-tag:drink tag:vegetarian", drinks)).toBe(
      "tag:drink tag:vegetarian",
    );
    expect(withKind("tag:drink tag:highball", anything)).toBe("tag:highball");
    expect(withKind("", drinks)).toBe("tag:drink");
    expect(withKind("tag:a OR tag:b", food)).toBe(
      "-tag:drink (tag:a OR tag:b)",
    );
  });

  it("drops a pick with nothing under the new kind (32j review)", () => {
    /* `sour` exists only among drinks; `quick` in both. */
    const has: Record<string, string[]> = {
      food: ["quick", "side"],
      drinks: ["quick", "sour"],
      any: ["quick", "side", "sour"],
    };
    const keepTag = (tag: string, kind: (typeof MAKE_KINDS)[number]) =>
      has[kind.id].includes(tag);
    expect(
      withKind("tag:drink tag:sour tag:quick", food, MAKE_KINDS, keepTag),
    ).toBe("-tag:drink tag:quick");
    expect(withKind("tag:drink tag:sour", anything, MAKE_KINDS, keepTag)).toBe(
      "tag:sour",
    );
    /* Excluded tags and free words are never the kind's to drop. */
    expect(withKind("tag:sour -tag:side lime", food, MAKE_KINDS, keepTag)).toBe(
      "-tag:drink -tag:side lime",
    );
  });

  it("drops the tag picks for the top row, never the kind", () => {
    expect(withoutTagPicks("-tag:drink tag:side tag:quick")).toBe("-tag:drink");
    expect(withoutTagPicks("tag:drink tag:highball")).toBe("tag:drink");
    expect(withoutTagPicks("tag:side -tag:quick ingredient:rice")).toBe(
      "-tag:quick ingredient:rice",
    );
    expect(withoutTagPicks("")).toBe("");
  });
});
