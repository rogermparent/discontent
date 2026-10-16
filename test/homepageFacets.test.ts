import { describe, expect, it } from "vitest";
import {
  FACET_CHILD_LIMIT,
  homepageFacets,
} from "../websites/recipe-website/common/controller/homepageFacets";
import {
  termHierarchy,
  type TermHierarchyNode,
} from "../websites/recipe-website/common/controller/tagVocabulary";

/** A tree node with the fields `homepageFacets` reads. */
function node(
  slug: string,
  total: number,
  children: TermHierarchyNode[] = [],
  image?: string,
): TermHierarchyNode {
  return {
    slug,
    label: slug.toUpperCase(),
    count: 0,
    total,
    children,
    ...(image ? { image } : {}),
  };
}

describe("homepageFacets", () => {
  it("orders the known roots by the preferred list, whatever the tree's order", () => {
    /* `readTagTree` sorts roots by label; the homepage must not. */
    const tree = ["spirit", "cuisine", "course", "holidays", "drink"].map(
      (slug) => node(slug, 5, [node(`${slug}-a`, 1)]),
    );
    expect(homepageFacets(tree).map((facet) => facet.slug)).toEqual([
      "course",
      "cuisine",
      "holidays",
      "drink",
      "spirit",
    ]);
  });

  it("puts unknown roots after the known ones, biggest first, then by label", () => {
    const tree = [
      node("zeta", 2, [node("z1", 2)]),
      node("alpha", 2, [node("a1", 2)]),
      node("big", 9, [node("b1", 9)]),
      node("course", 1, [node("main", 1)]),
    ];
    expect(homepageFacets(tree).map((facet) => facet.slug)).toEqual([
      "course",
      "big",
      "alpha",
      "zeta",
    ]);
  });

  it("shows the biggest children first, caps them, and counts the rest", () => {
    const children = Array.from({ length: FACET_CHILD_LIMIT + 3 }, (_, i) =>
      node(`c${String(i).padStart(2, "0")}`, i + 1),
    );
    const [facet] = homepageFacets([node("course", 50, children)]);
    expect(facet.children).toHaveLength(FACET_CHILD_LIMIT);
    expect(facet.children[0]).toMatchObject({
      slug: `c${FACET_CHILD_LIMIT + 2}`,
      total: FACET_CHILD_LIMIT + 3,
    });
    expect(facet.hidden).toBe(3);
  });

  it("breaks a tie in totals by label, so the order is stable", () => {
    const [facet] = homepageFacets([
      node("course", 3, [node("soup", 1), node("bread", 1), node("main", 2)]),
    ]);
    expect(facet.children.map((child) => child.slug)).toEqual([
      "main",
      "bread",
      "soup",
    ]);
  });

  it("leaves out children nothing carries, and roots left with none", () => {
    const facets = homepageFacets([
      node("course", 1, [node("main", 1), node("brunch", 0)]),
      /* A vocabulary defined ahead of its recipes. */
      node("holidays", 0, [node("easter", 0)]),
    ]);
    expect(facets.map((facet) => facet.slug)).toEqual(["course"]);
    expect(facets[0].children.map((child) => child.slug)).toEqual(["main"]);
    expect(facets[0].hidden).toBe(0);
  });

  it("is empty for an empty tree — the cue for the flat chips", () => {
    expect(homepageFacets([])).toEqual([]);
  });

  it("carries a term's picture through, and only when it has one", () => {
    const [facet] = homepageFacets([
      node("course", 2, [node("main", 1, [], "main.jpg"), node("side", 1)]),
    ]);
    expect(facet.children[0]).toEqual({
      slug: "main",
      label: "MAIN",
      total: 1,
      image: "main.jpg",
    });
    expect(facet.children[1]).not.toHaveProperty("image");
  });

  it("reads the picture off the term tree via termHierarchy", () => {
    const tree = {
      course: { label: "Course", children: ["main"], image: "course.png" },
      main: { label: "Main", parent: "course", children: [], image: "m.png" },
    };
    const [course] = termHierarchy(tree, new Map(), (slug) =>
      slug === "main" ? ["recipe:a"] : [],
    );
    expect(course).toMatchObject({ image: "course.png", total: 1 });
    expect(course.children[0]).toMatchObject({ image: "m.png", total: 1 });
  });
});
