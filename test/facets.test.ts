import { describe, expect, it } from "vitest";
import type { TermTree } from "@discontent/cms/taxonomies/tree";
import {
  DRINK_STRENGTH_METHOD_SLUGS,
  DRINK_STYLE_FACET_SLUGS,
  FACET_GROUPS,
  FOOD_FACET_ROOTS,
  activeFacetSlugs,
  buildFacetModel,
  carriersFromRows,
  countFacets,
  facetGroups,
  facetQuery,
  facetSearchHref,
  facetTermsFromBoard,
  facetTermsFromOptions,
  facetTermsFromTree,
  flattenRows,
  limitRows,
  narrowRows,
  queryKind,
  setQueryKind,
  toggleFacet,
  type FacetGroup,
  type FacetRow,
} from "../websites/recipe-website/common/util/facets";
import { DRINK_STYLE_SLUGS } from "../websites/recipe-website/common/controller/drinksPage";
import { buildTermLookup } from "../websites/recipe-website/common/controller/tagExpansion";
import { tagSlug } from "../websites/recipe-website/common/controller/tagSlug";
import {
  tagOptions,
  termBoard,
  termCarriers,
  vocabularyOfRows,
  type TermRowMap,
} from "../websites/recipe-website/common/controller/tagVocabulary";

/*
 * A real-shaped vocabulary: the shapes of the content repo's term records on
 * 2026-10-19 (copied, trimmed — never read from `editor/content`). Four food
 * facet roots, three Collections (House — 43k's root for the house bar —
 * holds drinks and dishes), holidays with aliases, the bar with styles,
 * strength and method terms and drink-name families, the spirit root, and
 * one nested chain (Desserts › Cookies › Linzer Cookies).
 */
const RECORDS: Record<
  string,
  { label: string; parent?: string; aliases?: string[]; image?: string }
> = {
  course: { label: "Course" },
  dessert: { label: "Desserts", parent: "course" },
  cookies: {
    label: "Cookies",
    parent: "dessert",
    image: "/uploads/cookies.jpg",
  },
  linzer: { label: "Linzer Cookies", parent: "cookies" },
  main: { label: "Mains", parent: "course" },
  salad: { label: "Salads", parent: "course" },
  "bean-salads": { label: "Bean Salads", parent: "salad" },
  breakfast: { label: "Breakfast", parent: "course" },
  "main-ingredient": { label: "Main ingredient" },
  chicken: { label: "Chicken", parent: "main-ingredient" },
  chocolate: { label: "Chocolate", parent: "main-ingredient" },
  cuisine: { label: "Cuisine" },
  american: { label: "American", parent: "cuisine" },
  mexican: { label: "Mexican & Tex-Mex", parent: "cuisine" },
  effort: { label: "Speed & effort" },
  easy: { label: "Easy", parent: "effort" },
  quick: { label: "Quick", parent: "effort" },
  fall: { label: "Fall Favorites" },
  syrup: { label: "Syrups" },
  house: { label: "House" },
  holidays: { label: "Holidays" },
  christmas: {
    label: "Christmas",
    parent: "holidays",
    aliases: ["christmas-cookies"],
  },
  "new-years": {
    label: "New Year's",
    parent: "holidays",
    aliases: ["new-year", "New Years Eve"],
  },
  halloween: { label: "Halloween", parent: "holidays" },
  drink: { label: "Drinks" },
  sour: { label: "Sour", parent: "drink" },
  highball: { label: "Highball", parent: "drink" },
  stirred: { label: "Stirred", parent: "drink" },
  built: { label: "Built", parent: "drink" },
  "warm-drinks": { label: "Warm Drinks", parent: "drink" },
  shaken: { label: "Shaken", parent: "drink" },
  "low-abv": { label: "Low-ABV", parent: "drink" },
  "zero-proof": { label: "Zero-proof", parent: "drink" },
  margarita: { label: "Margarita", parent: "drink" },
  "hibiscus-margarita": { label: "Hibiscus Margarita", parent: "drink" },
  negroni: { label: "Negroni", parent: "drink", aliases: ["Negroni Classico"] },
  "mulled-wine": { label: "Mulled Wine", parent: "drink" },
  spirit: { label: "Spirit & base" },
  tequila: { label: "Tequila", parent: "spirit" },
  gin: { label: "Gin", parent: "spirit" },
  tea: { label: "Tea", parent: "spirit" },
  wine: { label: "Wine", parent: "spirit" },
};

function treeOf(records: typeof RECORDS): TermTree {
  const tree: TermTree = {};
  for (const [slug, record] of Object.entries(records)) {
    tree[slug] = {
      label: record.label,
      ...(record.parent ? { parent: record.parent } : {}),
      ...(record.aliases ? { aliases: record.aliases } : {}),
      ...(record.image ? { image: record.image } : {}),
      children: [],
    };
  }
  for (const [slug, node] of Object.entries(tree)) {
    if (node.parent && node.parent !== slug)
      tree[node.parent]?.children.push(slug);
  }
  return tree;
}

const TREE = treeOf(RECORDS);

/* Recipes as carried: slugs, label spellings, aliases and stray strings. */
const RECIPES = [
  {
    slug: "linzer-cookies",
    tags: ["dessert", "cookies", "linzer", "christmas"],
  },
  {
    slug: "sugar-cookies",
    tags: ["cookies", "christmas-cookies", "easy", "american"],
  },
  { slug: "brownies", tags: ["dessert", "chocolate", "easy", "american"] },
  { slug: "chicken-tacos", tags: ["main", "chicken", "mexican", "quick"] },
  { slug: "three-bean", tags: ["bean salads", "easy", "house"] },
  { slug: "pancakes", tags: ["breakfast", "Easy", "new year's"] },
  { slug: "pumpkin-bread", tags: ["fall", "breakfast", "halloween"] },
  {
    slug: "margarita",
    tags: ["drink", "margarita", "sour", "shaken", "tequila"],
  },
  {
    slug: "hibiscus-margarita",
    tags: ["drink", "hibiscus-margarita", "sour", "shaken", "tequila", "tea"],
  },
  { slug: "negroni", tags: ["drink", "Negroni Classico", "stirred", "gin"] },
  {
    slug: "mulled-wine",
    tags: [
      "drink",
      "mulled-wine",
      "warm-drinks",
      "wine",
      "christmas",
      "low-abv",
    ],
  },
  { slug: "aviation", tags: ["drink", "aviation", "shaken", "gin"] },
  { slug: "nojito", tags: ["drink", "zero-proof", "highball", "house"] },
  { slug: "tea-cake", tags: ["dessert", "tea"] },
  { slug: "simple-syrup", tags: ["syrup"] },
  { slug: "untagged" },
  { slug: "blank", tags: ["", "  "] },
];

const model = buildFacetModel(facetTermsFromTree(TREE));
const counts = countFacets(model, RECIPES);
const groups = facetGroups(model, counts);
const group = (id: string, list: FacetGroup[] = groups) =>
  list.find((entry) => entry.id === id);
const labels = (rows: FacetRow[] | undefined) =>
  (rows ?? []).map((row) => `${row.label} ${row.count}`);

describe("the group constants", () => {
  it("splits DRINK_STYLE_SLUGS into style and strength & method, losing none", () => {
    /* 46h (43-Df2): stirred and built are methods beside shaken. */
    expect(DRINK_STRENGTH_METHOD_SLUGS).toEqual([
      "zero-proof",
      "low-abv",
      "shaken",
      "stirred",
      "built",
    ]);
    expect(
      [...DRINK_STYLE_FACET_SLUGS, ...DRINK_STRENGTH_METHOD_SLUGS].sort(),
    ).toEqual([...DRINK_STYLE_SLUGS].sort());
    expect(DRINK_STYLE_FACET_SLUGS).toEqual([
      "sour",
      "highball",
      "collins",
      "batch",
      "warm-drinks",
    ]);
  });

  it("takes the food roots from FACET_ROOT_ORDER, in its order", () => {
    expect(FOOD_FACET_ROOTS).toEqual([
      "course",
      "main-ingredient",
      "cuisine",
      "effort",
    ]);
  });

  it("lists the groups food first, then drinks", () => {
    expect(FACET_GROUPS.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "food:course",
      "food:main-ingredient",
      "food:cuisine",
      "food:effort",
      "any:collections",
      "food:holidays",
      "drinks:style",
      "drinks:strength-method",
      "drinks:spirit",
      "drinks:families",
    ]);
  });
});

describe("buildFacetModel", () => {
  it("builds every group the vocabulary has, labelled by its root record", () => {
    expect(
      model.groups.map((entry) => [entry.id, entry.label, entry.root]),
    ).toEqual([
      ["course", "Course", "course"],
      ["main-ingredient", "Main ingredient", "main-ingredient"],
      ["cuisine", "Cuisine", "cuisine"],
      ["effort", "Speed & effort", "effort"],
      ["collections", "Collections", undefined],
      ["holidays", "Holidays", "holidays"],
      ["style", "Style", undefined],
      ["strength-method", "Strength & method", undefined],
      ["spirit", "Spirit & base", "spirit"],
      ["families", "Families", "drink"],
    ]);
  });

  it("separates drink styles, strength & method, and families", () => {
    const rowsOf = (id: string) =>
      [...(model.groups.find((entry) => entry.id === id)?.rows ?? [])].sort();
    expect(rowsOf("style")).toEqual(["highball", "sour", "warm-drinks"]);
    /* 46h (43-Df2): stirred and built are methods, beside shaken. */
    expect(rowsOf("strength-method")).toEqual([
      "built",
      "low-abv",
      "shaken",
      "stirred",
      "zero-proof",
    ]);
    expect(rowsOf("families")).toEqual([
      "hibiscus-margarita",
      "margarita",
      "mulled-wine",
      "negroni",
    ]);
  });

  it("makes Collections of recorded roots outside every facet", () => {
    expect(
      model.groups.find((entry) => entry.id === "collections")?.rows,
    ).toEqual(["fall", "syrup", "house"]);
  });

  it("leaves out a group whose root the vocabulary lacks", () => {
    const { cuisine: _c, american: _a, mexican: _m, ...rest } = RECORDS;
    const without = buildFacetModel(facetTermsFromTree(treeOf(rest)));
    expect(without.groups.map((entry) => entry.id)).not.toContain("cuisine");
  });

  it("breaks a hand-edited cycle instead of hanging", () => {
    const cyclic = buildFacetModel([
      { slug: "a", label: "A", parent: "b", record: true },
      { slug: "b", label: "B", parent: "a", record: true },
      { slug: "c", label: "C", parent: "c", record: true },
    ]);
    expect(cyclic.ancestors("a").length).toBeLessThanOrEqual(2);
    expect(cyclic.ancestors("c")).toEqual(["c"]);
    const tally = countFacets(cyclic, [{ tags: ["a", "b", "c"] }]);
    expect(tally.total).toBe(1);
    expect(facetGroups(cyclic, tally).length).toBeGreaterThan(0);
  });

  it("resolves a tag by slug, label, slugged spelling and alias", () => {
    expect(model.resolve("bean salads")).toBe("bean-salads");
    expect(model.resolve("Bean Salads")).toBe("bean-salads");
    expect(model.resolve("new year's")).toBe("new-years");
    expect(model.resolve("New Years Eve")).toBe("new-years");
    expect(model.resolve("christmas-cookies")).toBe("christmas");
    expect(model.resolve("EASY")).toBe("easy");
    expect(model.resolve("aviation")).toBeUndefined();
  });
});

describe("countFacets", () => {
  it("counts the set and its kinds", () => {
    expect(counts.total).toBe(RECIPES.length);
    expect(counts.kinds).toEqual({ drinks: 6, food: RECIPES.length - 6 });
  });

  it("counts a subtree's recipes once each, however many of its terms they carry", () => {
    /* linzer-cookies carries dessert, cookies and linzer: one dessert. */
    expect(counts.subtree.get("dessert")).toBe(4);
    expect(counts.subtree.get("cookies")).toBe(2);
    expect(counts.subtree.get("linzer")).toBe(1);
    expect(counts.own.get("dessert")).toBe(3);
    expect(counts.own.get("cookies")).toBe(2);
    expect(group("course")?.total).toBe(8);
  });

  it("counts an alias and a label spelling towards the term", () => {
    /* sugar-cookies carries the alias christmas-cookies. */
    expect(counts.subtree.get("christmas")).toBe(3);
    expect(counts.own.get("christmas")).toBe(3);
    expect(counts.subtree.get("new-years")).toBe(1);
    expect(counts.subtree.get("bean-salads")).toBe(1);
    expect(counts.subtree.get("negroni")).toBe(1);
    expect(counts.subtree.get("easy")).toBe(4);
  });

  it("counts drinks groups over drinks only", () => {
    /* tea-cake carries `tea` but is no drink. */
    expect(counts.subtree.get("tea")).toBe(2);
    expect(counts.drinks.get("tea")).toBe(1);
    const spirit = group("spirit");
    expect(labels(spirit?.rows)).toEqual([
      "Gin 2",
      "Tequila 2",
      "Tea 1",
      "Wine 1",
    ]);
    expect(spirit?.total).toBe(5);
    expect(spirit?.rows.find((row) => row.slug === "tea")?.ownCount).toBe(1);
  });

  it("collects unplaced tags as other tags, most carried first", () => {
    expect(counts.other).toEqual([
      { slug: "aviation", label: "aviation", count: 1 },
    ]);
    /* A string only recipes carry — no record — is an other tag too. */
    const loose = countFacets(model, [{ tags: ["zzz"] }, { tags: ["ZZZ "] }]);
    expect(loose.other).toEqual([{ slug: "zzz", label: "zzz", count: 2 }]);
  });

  it("finds the same other tags from the browser's terms, carried-only ones included", () => {
    const vocabulary = vocabularyOfRows({
      recipeRows: rowsOf(RECIPES),
      tree: TREE,
    });
    const browser = buildFacetModel(
      facetTermsFromOptions(tagOptions(vocabulary, TREE)),
    );
    const tally = countFacets(browser, RECIPES);
    /* `aviation` is a carried-only term here, not an unknown string. */
    expect(browser.terms.get("aviation")?.record).toBeUndefined();
    expect(tally.other.map((tag) => [tag.slug, tag.count])).toEqual([
      ["aviation", 1],
    ]);
    /* `TagOption` carries no picture; everything else is the same. */
    expect(withoutImages(facetGroups(browser, tally))).toEqual(
      withoutImages(groups),
    );
  });

  it("is empty for an empty set", () => {
    const none = countFacets(model, []);
    expect(none.total).toBe(0);
    expect(facetGroups(model, none)).toEqual([]);
    expect(facetGroups(model, none, { includeEmpty: true }).length).toBe(
      model.groups.length,
    );
  });

  it("counts within a result set", () => {
    const results = RECIPES.filter((recipe) =>
      ["margarita", "hibiscus-margarita", "chicken-tacos", "nojito"].includes(
        recipe.slug,
      ),
    );
    const tally = countFacets(model, results);
    const found = facetGroups(model, tally);
    expect(tally.kinds).toEqual({ drinks: 3, food: 1 });
    expect(found.map((entry) => `${entry.label} ${entry.total}`)).toEqual([
      "Course 1",
      "Main ingredient 1",
      "Cuisine 1",
      "Speed & effort 1",
      "Collections 1",
      "Style 3",
      "Strength & method 3",
      "Spirit & base 2",
      "Families 2",
    ]);
    expect(labels(group("style", found)?.rows)).toEqual([
      "Sour 2",
      "Highball 1",
    ]);
  });
});

describe("facetGroups", () => {
  it("nests children under their parent, sorted the same way", () => {
    const course = group("course");
    expect(labels(course?.rows)).toEqual([
      "Desserts 4",
      "Breakfast 2",
      "Mains 1",
      "Salads 1",
    ]);
    const dessert = course?.rows[0];
    expect(dessert?.children.map((row) => [row.label, row.depth])).toEqual([
      ["Cookies", 1],
    ]);
    expect(
      dessert?.children[0].children.map((row) => [
        row.label,
        row.count,
        row.depth,
      ]),
    ).toEqual([["Linzer Cookies", 1, 2]]);
    expect(dessert?.children[0].image).toBe("/uploads/cookies.jpg");
    expect(flattenRows(course?.rows ?? []).map((row) => row.slug)).toEqual([
      "dessert",
      "cookies",
      "linzer",
      "breakfast",
      "main",
      "salad",
      "bean-salads",
    ]);
  });

  it("dates holiday rows and lists their own aliases", () => {
    const holidays = group("holidays");
    expect(
      holidays?.rows.map((row) => [row.slug, row.count, row.rule]),
    ).toEqual([
      ["christmas", 3, "christmas"],
      ["halloween", 1, "halloween"],
      ["new-years", 1, "new-years"],
    ]);
    expect(holidays?.rows[0].aliases).toEqual(["christmas-cookies"]);
    expect(holidays?.rows[2].aliases).toEqual(["new-year", "New Years Eve"]);
  });

  it("dates a holiday by an alias when its own slug has no rule", () => {
    const xmas = buildFacetModel(
      facetTermsFromTree(
        treeOf({
          holidays: { label: "Holidays" },
          xmas: { label: "Xmas", parent: "holidays", aliases: ["Christmas"] },
          harvest: { label: "Harvest", parent: "holidays" },
        }),
      ),
    );
    const rows = group(
      "holidays",
      facetGroups(xmas, countFacets(xmas, []), { includeEmpty: true }),
    )?.rows;
    expect(rows?.map((row) => [row.slug, row.rule])).toEqual([
      ["harvest", undefined],
      ["xmas", "christmas"],
    ]);
  });

  it("counts Collections over every recipe, for either kind", () => {
    const collections = group("collections");
    expect(collections?.kind).toBe("any");
    expect(labels(collections?.rows)).toEqual([
      "House 2",
      "Fall Favorites 1",
      "Syrups 1",
    ]);
    expect(collections?.total).toBe(4);
    /* A drinks-only set still has its House row; a food set its Fall one. */
    const drinksOnly = countFacets(
      model,
      RECIPES.filter((recipe) => recipe.slug === "nojito"),
    );
    expect(
      labels(
        group("collections", facetGroups(model, drinksOnly, { kind: "drinks" }))
          ?.rows,
      ),
    ).toEqual(["House 1"]);
    const foodOnly = countFacets(
      model,
      RECIPES.filter((recipe) => recipe.slug === "pumpkin-bread"),
    );
    expect(
      labels(
        group("collections", facetGroups(model, foodOnly, { kind: "food" }))
          ?.rows,
      ),
    ).toEqual(["Fall Favorites 1"]);
    expect(
      group(
        "collections",
        facetGroups(model, countFacets(model, []), { kind: "drinks" }),
      ),
    ).toBeUndefined();
  });

  it("drops empty rows unless asked, and keeps a selected one", () => {
    expect(labels(group("cuisine")?.rows)).toEqual([
      "American 2",
      "Mexican & Tex-Mex 1",
    ]);
    const tally = countFacets(model, RECIPES.slice(0, 1));
    expect(group("cuisine", facetGroups(model, tally))).toBeUndefined();
    const kept = facetGroups(model, tally, { keep: ["mexican"] });
    expect(labels(group("cuisine", kept)?.rows)).toEqual([
      "Mexican & Tex-Mex 0",
    ]);
    const all = facetGroups(model, tally, { includeEmpty: true });
    expect(labels(group("cuisine", all)?.rows)).toEqual([
      "American 0",
      "Mexican & Tex-Mex 0",
    ]);
  });

  it("sorts by label for the edit form's picker, ties stable by slug", () => {
    const byLabel = facetGroups(model, counts, {
      sort: "label",
      includeEmpty: true,
    });
    expect(group("course", byLabel)?.rows.map((row) => row.label)).toEqual([
      "Breakfast",
      "Desserts",
      "Mains",
      "Salads",
    ]);
    const tied = buildFacetModel([
      { slug: "spirit", label: "Spirit", record: true },
      { slug: "b", label: "Same", parent: "spirit", record: true },
      { slug: "a", label: "Same", parent: "spirit", record: true },
    ]);
    const rows = group(
      "spirit",
      facetGroups(tied, countFacets(tied, []), { includeEmpty: true }),
    )?.rows;
    expect(rows?.map((row) => row.slug)).toEqual(["a", "b"]);
  });

  it("filters by kind and orders by total when asked", () => {
    expect(
      facetGroups(model, counts, { kind: "drinks" }).map((entry) => entry.id),
    ).toEqual([
      "collections",
      "style",
      "strength-method",
      "spirit",
      "families",
    ]);
    expect(
      facetGroups(model, counts, { kind: "food" }).map((entry) => entry.id),
    ).toEqual([
      "course",
      "main-ingredient",
      "cuisine",
      "effort",
      "collections",
      "holidays",
    ]);
    const byTotal = facetGroups(model, counts, { order: "total" });
    expect(byTotal[0].id).toBe("course");
    expect(byTotal.map((entry) => entry.total)).toEqual(
      [...byTotal.map((entry) => entry.total)].sort((a, b) => b - a),
    );
  });
});

describe("limitRows and narrowRows", () => {
  it("caps the top-level rows, keeping a selected one past the cut", () => {
    const rows = group("course")?.rows ?? [];
    expect(limitRows(rows, 2)).toMatchObject({ hidden: 2 });
    const kept = limitRows(rows, 2, ["bean-salads"]);
    expect(kept.rows.map((row) => row.slug)).toEqual([
      "dessert",
      "breakfast",
      "salad",
    ]);
    expect(kept.hidden).toBe(1);
  });

  it("offers the rows that narrow a term's recipes, minus its own line", () => {
    const christmas = RECIPES.filter((recipe) =>
      (recipe.tags ?? []).some((tag) => model.resolve(tag) === "christmas"),
    );
    const tally = countFacets(model, christmas);
    const chips = narrowRows(model, tally, { exclude: ["christmas"] });
    expect(chips.map((row) => row.slug)).not.toContain("christmas");
    expect(chips.map((row) => row.slug)).not.toContain("holidays");
    /* Every Christmas recipe here is no narrowing; Cookies (2 of 3) is. */
    expect(chips.map((row) => `${row.label} ${row.count}`).slice(0, 2)).toEqual(
      ["Cookies 2", "Desserts 2"],
    );
    expect(chips.every((row) => row.count < tally.total)).toBe(true);
    expect(
      narrowRows(model, tally, { exclude: ["dessert"] }).map((row) => row.slug),
    ).not.toContain("linzer");
    expect(narrowRows(model, tally, { limit: 1 })).toHaveLength(1);
  });
});

describe("the query (D3)", () => {
  it("reads the active rows through any spelling", () => {
    expect([
      ...activeFacetSlugs(model, 'tag:Mains tag:"bean salads" -tag:sour'),
    ]).toEqual(["main", "bean-salads"]);
  });

  it("toggles a row's tag: term, removing every spelling of it", () => {
    expect(toggleFacet(model, "", "main")).toBe("tag:main");
    expect(toggleFacet(model, "tacos", "chicken")).toBe("tacos tag:chicken");
    expect(toggleFacet(model, "tacos tag:Mains tag:chicken", "main")).toBe(
      "tacos tag:chicken",
    );
    expect(toggleFacet(model, "tag:main tag:main", "main")).toBe("");
    /* An excluded row goes back to neutral: the exclusion is removed. */
    expect(toggleFacet(model, "-tag:sour", "sour")).toBe("");
    expect(toggleFacet(model, "lime NOT tag:Sour tag:gin", "sour")).toBe(
      "lime tag:gin",
    );
  });

  it("reads and writes the Kind row as tag:drink / -tag:drink", () => {
    expect(queryKind(model, "lime")).toBeUndefined();
    expect(queryKind(model, "lime tag:drink")).toBe("drinks");
    expect(queryKind(model, "lime -tag:Drinks")).toBe("food");
    expect(queryKind(model, "tag:drink -tag:drink")).toBeUndefined();
    expect(setQueryKind(model, "lime", "drinks")).toBe("lime tag:drink");
    expect(setQueryKind(model, "lime tag:drink tag:sour", "food")).toBe(
      "lime tag:sour -tag:drink",
    );
    expect(setQueryKind(model, "lime -tag:drink", undefined)).toBe("lime");
  });

  it("builds a fresh query and its search link", () => {
    expect(facetQuery(["main", "chicken", "main"])).toBe(
      "tag:main tag:chicken",
    );
    expect(facetQuery(["sour"], "drinks")).toBe("tag:sour tag:drink");
    expect(facetQuery([], "food")).toBe("-tag:drink");
    expect(facetSearchHref(["main", "chicken"])).toBe(
      "/search?q=tag%3Amain%20tag%3Achicken",
    );
  });
});

function withoutImages(list: FacetGroup[]): unknown {
  return JSON.parse(
    JSON.stringify(list, (key, value) => (key === "image" ? undefined : value)),
  );
}

/** A by-term map as the fold writes it: tag slug → carriers. */
function rowsOf(recipes: typeof RECIPES): TermRowMap {
  const rows: TermRowMap = {};
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      if (!tag.trim()) continue;
      const key = tagSlug(tag);
      (rows[key] ??= { label: tag, items: [] }).items.push({
        slug: recipe.slug,
      });
    }
  }
  return rows;
}

describe("the server's inputs", () => {
  it("reads the same terms from /tags' board as from the tree", () => {
    const recipeRows = rowsOf(RECIPES);
    const vocabulary = new Map(
      vocabularyOfRows({ recipeRows, tree: TREE }).map((entry) => [
        entry.slug,
        entry,
      ]),
    );
    const board = termBoard(
      TREE,
      vocabulary,
      termCarriers(TREE, recipeRows, null),
    );
    const fromBoard = buildFacetModel(facetTermsFromBoard(board));
    expect(facetGroups(fromBoard, countFacets(fromBoard, RECIPES))).toEqual(
      groups,
    );
  });

  it("counts from a by-term map as from the recipes", () => {
    const carriers = carriersFromRows(rowsOf(RECIPES));
    expect(
      carriers.find((entry) => entry.slug === "sugar-cookies")?.tags,
    ).toEqual(["cookies", "christmas-cookies", "easy", "american"]);
    const tally = countFacets(model, carriers);
    /* The untagged recipes sit under no key, so the map has two fewer. */
    expect(tally.total).toBe(RECIPES.length - 2);
    expect(facetGroups(model, tally)).toEqual(groups);
  });

  it("buildTermLookup answers what tag: starts its expansion from", () => {
    const lookup = buildTermLookup([
      { slug: "biscuits", label: "Biscuits", record: true },
      {
        slug: "cookies",
        label: "Cookies",
        aliases: ["Biscuits", "bikkies"],
        record: true,
      },
      { slug: "bikkies", label: "bikkies" },
    ]);
    /* A record's own spelling beats another's alias; an alias beats a carried-only term. */
    expect(lookup("Biscuits")).toBe("biscuits");
    expect(lookup("bikkies")).toBe("cookies");
    expect(lookup("  COOKIES ")).toBe("cookies");
    expect(lookup("nothing")).toBeUndefined();
  });
});
