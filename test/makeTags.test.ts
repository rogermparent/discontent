// @vitest-environment node
//
// Epic 28, 28g: `/make`'s tag picker — the vocabulary with parents, and the
// pure tree reads the page renders from.

import { describe, expect, it } from "vitest";
import { tagOptions } from "../websites/recipe-website/common/controller/tagVocabulary";
import {
  breadcrumb,
  buildTagIndex,
  childrenInScope,
  rootsInScope,
  searchTags,
  subtreeUsage,
} from "../websites/recipe-website/common/components/MakePage/tagTree";

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
