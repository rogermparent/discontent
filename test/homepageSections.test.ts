import { describe, expect, it } from "vitest";
import {
  HOMEPAGE_INTENTS,
  countLabel,
  homepageIntents,
  termTotals,
} from "../websites/recipe-website/common/controller/homepageIntents";
import {
  comingUpEntries,
  courseLabels,
  findTermNode,
  termSummary,
} from "../websites/recipe-website/common/controller/homepageComingUp";
import type { TermHierarchyNode } from "../websites/recipe-website/common/controller/tagVocabulary";

function node(
  slug: string,
  total: number,
  children: TermHierarchyNode[] = [],
  image?: string,
): TermHierarchyNode {
  return {
    slug,
    label: slug[0].toUpperCase() + slug.slice(1),
    count: 0,
    total,
    children,
    ...(image ? { image } : {}),
  };
}

describe("homepage intents", () => {
  it("shows the configured tiles that have something, in order, with counts", () => {
    const tree = [
      node("effort", 9, [node("quick", 4), node("project", 0)]),
      node("drink", 7, [node("sour", 3)]),
    ];
    const intents = homepageIntents(termTotals(tree));
    expect(intents.map((intent) => [intent.slug, intent.count])).toEqual([
      ["quick", 4],
      ["drink", 7],
    ]);
    expect(countLabel(7, intents[1].noun)).toBe("7 drinks");
    expect(countLabel(1, "recipe")).toBe("1 recipe");
  });

  it("falls back to the flat vocabulary for bare tags", () => {
    const intents = homepageIntents(new Map(), [
      { slug: "vegetarian", label: "vegetarian", count: 2 },
    ]);
    expect(intents).toEqual([{ ...HOMEPAGE_INTENTS[1], count: 2 }]);
  });

  it("is empty for a corpus with none of the terms", () => {
    expect(homepageIntents(new Map(), [])).toEqual([]);
  });
});

describe("coming up", () => {
  const recipes: Record<
    string,
    { slug: string; date: number; image?: string; name: string }[]
  > = {
    christmas: [
      { slug: "linzer", date: 3, name: "Linzer" },
      { slug: "stollen", date: 2, image: "stollen.jpg", name: "Stollen" },
    ],
    "christmas-cookies": [
      { slug: "linzer", date: 3, name: "Linzer" },
      { slug: "spritz", date: 5, image: "spritz.jpg", name: "Spritz" },
    ],
    halloween: [{ slug: "mummy-dogs", date: 1, name: "Mummy Dogs" }],
  };
  const groups: Record<string, { slug: string }[]> = {
    christmas: [{ slug: "christmas-baking" }],
  };
  const rows = (slug: string) => recipes[slug] ?? [];
  const groupRows = (slug: string) => groups[slug] ?? [];

  it("is null with no holidays root", () => {
    expect(
      comingUpEntries([node("course", 1, [node("main", 1)])], rows, groupRows),
    ).toBe(null);
  });

  it("counts each holiday's subtree once and picks the newest photo", () => {
    const tree = [
      node("holidays", 6, [
        node("christmas", 4, [node("christmas-cookies", 2)]),
        node("halloween", 1),
        node("easter", 0),
        node("thanksgiving", 0, [], "turkey.png"),
      ]),
    ];
    const entries = comingUpEntries(tree, rows, groupRows)!;
    expect(entries.map((entry) => entry.slug)).toEqual([
      "christmas",
      "halloween",
    ]);
    expect(entries[0]).toMatchObject({
      recipes: 3,
      groups: 1,
      recipeImage: { slug: "spritz", image: "spritz.jpg" },
    });
    expect(entries[1]).not.toHaveProperty("recipeImage");
  });

  it("prefers the term's own picture", () => {
    const tree = [node("holidays", 1, [node("christmas", 3, [], "tree.png")])];
    const [entry] = comingUpEntries(tree, rows, groupRows)!;
    expect(entry.image).toBe("tree.png");
    expect(entry).not.toHaveProperty("recipeImage");
  });

  it("summarises any term for the featured strip, in the tree or not", () => {
    const tree = [
      node("holidays", 6, [
        node("christmas", 4, [node("christmas-cookies", 2)]),
      ]),
    ];
    const nested = findTermNode(tree, "christmas-cookies");
    expect(nested?.slug).toBe("christmas-cookies");
    expect(findTermNode(tree, "nowhere")).toBe(undefined);

    expect(
      termSummary(findTermNode(tree, "christmas")!, rows, groupRows),
    ).toMatchObject({ recipes: 3, groups: 1, recipeImage: { slug: "spritz" } });
    /* A bare tag outside the hierarchy counts its own carriers. */
    expect(
      termSummary({ slug: "halloween", children: [] }, rows, groupRows),
    ).toEqual({ recipes: 1, groups: 0 });
  });
});

describe("course labels", () => {
  it("names each recipe's biggest course, and nothing for the rest", () => {
    const tree = [
      node("course", 9, [
        node("dessert", 2, [node("cookies", 1)]),
        node("main", 5),
      ]),
    ];
    const rows = (slug: string) =>
      ({
        main: [{ slug: "chili" }, { slug: "pie" }],
        cookies: [{ slug: "linzer" }],
        dessert: [{ slug: "pie" }],
      })[slug] ?? [];
    const labels = courseLabels(tree, rows);
    expect(Object.fromEntries(labels)).toEqual({
      chili: "Main",
      pie: "Main",
      linzer: "Dessert",
    });
    expect(
      courseLabels([node("cuisine", 1, [node("thai", 1)])], rows).size,
    ).toBe(0);
  });
});
