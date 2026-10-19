import { describe, expect, it } from "vitest";
import {
  HOMEPAGE_INTENTS,
  countLabel,
  homepageIntents,
  intentSearchHref,
  termTotals,
} from "../websites/recipe-website/common/controller/homepageIntents";
import {
  SEASON_LIMIT,
  comingUpEntries,
  courseLabels,
  datedHolidays,
  featureCandidates,
  findTermNode,
  markFeaturedHolidays,
  seasonPicks,
  seasonRows,
  termSummary,
  withoutSeasonFeatures,
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

  it("opens each chip's tag query in search (42f)", () => {
    expect(intentSearchHref("quick")).toBe("/search?q=tag%3Aquick");
    expect(HOMEPAGE_INTENTS.map((intent) => intent.slug)).toEqual([
      "quick",
      "vegetarian",
      "project",
      "drink",
    ]);
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

describe("this season (42f)", () => {
  const rows: Record<
    string,
    { slug: string; date: number; image?: string; name: string }[]
  > = {
    christmas: [
      { slug: "linzer", date: 6, name: "Linzer" },
      { slug: "stollen", date: 2, image: "stollen.jpg", name: "Stollen" },
      { slug: "wassail", date: 1, name: "Wassail" },
    ],
    "christmas-cookies": [
      { slug: "linzer", date: 6, name: "Linzer" },
      { slug: "spritz", date: 5, image: "spritz.jpg", name: "Spritz" },
      { slug: "snowballs", date: 4, name: "Snowballs" },
    ],
  };
  const recipeRows = (slug: string) => rows[slug] ?? [];
  const tree = [
    node("holidays", 6, [
      node("christmas", 5, [node("christmas-cookies", 3)]),
      node("halloween", 0),
    ]),
  ];

  it("picks a holiday's photographed recipes first, newest first, once each", () => {
    const christmas = findTermNode(tree, "christmas")!;
    expect(seasonPicks(christmas, recipeRows)).toEqual([
      { slug: "spritz", name: "Spritz", image: "spritz.jpg" },
      { slug: "stollen", name: "Stollen", image: "stollen.jpg" },
      { slug: "linzer", name: "Linzer" },
      { slug: "snowballs", name: "Snowballs" },
    ]);
    expect(seasonPicks(christmas, recipeRows, 1)).toEqual([
      { slug: "spritz", name: "Spritz", image: "spritz.jpg" },
    ]);
    /* The entries carry them. */
    const [entry] = comingUpEntries(tree, recipeRows, () => [])!;
    expect(entry.picks.map((pick) => pick.slug)).toEqual([
      "spritz",
      "stollen",
      "linzer",
      "snowballs",
    ]);
  });

  it("shows the next three holidays within the window, soonest first", () => {
    const items = [
      { slug: "christmas" },
      { slug: "halloween" },
      { slug: "thanksgiving" },
      { slug: "valentines" },
      { slug: "fall-favorites" },
    ];
    const today = { year: 2026, month: 10, day: 18 };
    expect(SEASON_LIMIT).toBe(3);
    expect(
      seasonRows(items, today).map((item) => [item.slug, item.days]),
    ).toEqual([
      ["halloween", 13],
      ["thanksgiving", 39],
      ["christmas", 68],
    ]);
    /* The day after Christmas: all three rolled a year out, past 180 days. */
    expect(
      seasonRows(items, { year: 2026, month: 12, day: 26 }).map(
        (item) => item.slug,
      ),
    ).toEqual(["valentines"]);
  });

  it("shows a featured holiday once: marked on its row, off the featured list", () => {
    const entries = comingUpEntries(tree, recipeRows, () => [])!;
    const marked = markFeaturedHolidays(entries, new Set(["christmas"]));
    expect(marked[0].featured).toBe(true);
    expect(markFeaturedHolidays(entries, new Set())[0]).not.toHaveProperty(
      "featured",
    );

    const features = [
      { slug: "f1", holiday: "christmas" },
      { slug: "f2" },
      { slug: "f3" },
      { slug: "f4", holiday: "easter" },
    ];
    expect(
      withoutSeasonFeatures(features, new Set(["christmas", "halloween"])).map(
        (entry) => entry.slug,
      ),
    ).toEqual(["f2", "f3", "f4"]);
  });

  it("hands over enough features that six remain once the holidays hide", () => {
    const items = ["h1", "a", "h2", "b", "c", "h3", "d"];
    const isHoliday = (item: string) => item.startsWith("h");
    expect(featureCandidates(items, isHoliday, 2)).toEqual([
      "h1",
      "a",
      "h2",
      "b",
    ]);
    expect(featureCandidates(items, isHoliday, 4)).toEqual(items);
    expect(featureCandidates(items, () => false, 3)).toEqual(["h1", "a", "h2"]);
  });

  it("dates a holiday by an alias's rule (42e's holidayRuleKey)", () => {
    const xmas = {
      ...node("xmas", 1),
      label: "Xmas",
      aliases: ["Christmas"],
    };
    const [entry] = comingUpEntries(
      [node("holidays", 1, [xmas])],
      (slug) =>
        slug === "xmas" ? [{ slug: "stollen", date: 1, name: "Stollen" }] : [],
      () => [],
    )!;
    expect(entry.rule).toBe("christmas");
    expect(datedHolidays([entry]).map((e) => e.slug)).toEqual(["xmas"]);
    expect(
      seasonRows([entry], { year: 2026, month: 12, day: 20 }).map((row) => [
        row.slug,
        row.days,
      ]),
    ).toEqual([["xmas", 5]]);
  });

  it("rows only the holidays a rule dates", () => {
    expect(
      datedHolidays([
        { slug: "christmas" },
        { slug: "fall-favorites" },
        { slug: "constructor" },
        { slug: "halloween" },
      ]).map((entry) => entry.slug),
    ).toEqual(["christmas", "halloween"]);
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
