import { describe, expect, it } from "vitest";
import {
  buildFacetModel,
  type FacetTerm,
} from "../websites/recipe-website/common/util/facets";
import {
  breadcrumbOf,
  browseRoots,
  isDrinkRecipe,
  kindBands,
  leadingAmount,
  queryWords,
  recipeMeta,
  seasonBands,
  subjectOf,
  whyMatch,
  type ViewRecipe,
} from "../websites/recipe-website/common/components/SearchForm/searchView";
import {
  ingredientOptions,
  pluralKey,
  pluralKeys,
  recipeLineCounter,
} from "../websites/recipe-website/common/components/SearchForm/QueryAutocomplete";
import {
  matchesFilter,
  parseQuery,
} from "../websites/recipe-website/common/components/SearchForm/queryLanguage";

/*
 * 43s: `/search`'s layouts over a real-shaped vocabulary (copied shapes of the
 * content repo's records, trimmed — never read from `editor/content`): the
 * course root with Desserts › Cookies › Linzer, cuisine and effort roots, the
 * bar (styles, a method, a family with a nested family, the spirit root),
 * holidays, and two Collections.
 */
const TERMS: FacetTerm[] = [
  { slug: "course", label: "Course", record: true },
  { slug: "dessert", label: "Desserts", parent: "course", record: true },
  { slug: "cookies", label: "Cookies", parent: "dessert", record: true },
  { slug: "linzer", label: "Linzer Cookies", parent: "cookies", record: true },
  { slug: "salad", label: "Salads", parent: "course", record: true },
  { slug: "sauce", label: "Sauces", parent: "course", record: true },
  { slug: "cuisine", label: "Cuisine", record: true },
  {
    slug: "mexican",
    label: "Mexican & Tex-Mex",
    parent: "cuisine",
    record: true,
  },
  { slug: "effort", label: "Speed & effort", record: true },
  { slug: "quick", label: "Quick", parent: "effort", record: true },
  { slug: "drink", label: "Drinks", record: true },
  { slug: "sour", label: "Sour", parent: "drink", record: true },
  { slug: "highball", label: "Highball", parent: "drink", record: true },
  { slug: "shaken", label: "Shaken", parent: "drink", record: true },
  { slug: "margarita", label: "Margarita", parent: "drink", record: true },
  {
    slug: "frozen-margarita",
    label: "Frozen Margarita",
    parent: "margarita",
    record: true,
  },
  { slug: "spirit", label: "Spirit & base", record: true },
  { slug: "tequila", label: "Tequila", parent: "spirit", record: true },
  { slug: "holidays", label: "Holidays", record: true },
  { slug: "halloween", label: "Halloween", parent: "holidays", record: true },
  {
    slug: "christmas",
    label: "Christmas",
    parent: "holidays",
    aliases: ["Xmas"],
    record: true,
  },
  { slug: "fall", label: "Fall Favorites", record: true },
  { slug: "house", label: "House recipes", record: true },
  /* A carried-only string: resolvable, but no record. */
  { slug: "baked", label: "baked" },
];

const model = buildFacetModel(TERMS);

function recipe(
  slug: string,
  tags: string[],
  extra: Partial<ViewRecipe> = {},
): ViewRecipe {
  return { slug, name: slug, tags, ...extra };
}

/* The canvas's "lime" shape, ranked: a drink first, dishes between drinks. */
const LIME = [
  recipe("lime-rickey", ["drink", "highball", "tequila"], { totalTime: 5 }),
  recipe("key-lime-pie", ["dessert"]),
  recipe("zombie", ["drink", "sour", "shaken"]),
  recipe("cilantro-lime-sauce", ["sauce", "quick"]),
  recipe("margarita", ["drink", "margarita"]),
  recipe("bean-salad", ["salad", "mexican"], { totalTime: 30 }),
  recipe("frozen", ["frozen-margarita"]),
];

const slugs = (list: readonly ViewRecipe[]) => list.map((r) => r.slug);

describe("kindBands", () => {
  it("splits drinks and food, each in result order, the best match's band first", () => {
    const bands = kindBands(model, LIME);
    expect(bands?.map((band) => band.kind)).toEqual(["drinks", "food"]);
    expect(slugs(bands![0].recipes)).toEqual([
      "lime-rickey",
      "zombie",
      "margarita",
      "frozen",
    ]);
    expect(slugs(bands![1].recipes)).toEqual([
      "key-lime-pie",
      "cilantro-lime-sauce",
      "bean-salad",
    ]);
  });

  it("is a partition: every result once, relative order kept (42s parity)", () => {
    const bands = kindBands(model, LIME)!;
    const all = bands.flatMap((band) => band.recipes);
    expect(all).toHaveLength(LIME.length);
    expect(new Set(all)).toEqual(new Set(LIME));
    for (const band of bands) {
      const positions = band.recipes.map((r) => LIME.indexOf(r));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
  });

  it("leads with Food when the best match is a dish", () => {
    const [top, ...rest] = LIME;
    const bands = kindBands(model, [rest[0], top, ...rest.slice(1)]);
    expect(bands?.[0].kind).toBe("food");
  });

  it("cuts four cards, five names, then a count", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      recipe(`d${i}`, ["drink"]),
    );
    const [drinks] = kindBands(model, [...many, recipe("pie", ["dessert"])])!;
    expect(slugs(drinks.cards)).toEqual(["d0", "d1", "d2", "d3"]);
    expect(slugs(drinks.also)).toEqual(["d4", "d5", "d6", "d7", "d8"]);
    expect(drinks.more).toBe(3);
  });

  it("is no bands when the results are one kind", () => {
    expect(
      kindBands(
        model,
        LIME.filter((r) => isDrinkRecipe(model, r)),
      ),
    ).toBe(undefined);
    expect(kindBands(model, [])).toBe(undefined);
  });

  it("knows a drink by any tag under drink, nested families included", () => {
    expect(isDrinkRecipe(model, recipe("f", ["frozen-margarita"]))).toBe(true);
    expect(isDrinkRecipe(model, recipe("t", ["tequila"]))).toBe(false);
  });
});

describe("subjectOf", () => {
  it("is the one tag: term a query names", () => {
    expect(subjectOf(model, "tag:cookies")).toBe("cookies");
    expect(subjectOf(model, "tag:Cookies chocolate")).toBe("cookies");
  });

  it("is the deepest of terms on one line (a Narrower chip pressed)", () => {
    expect(subjectOf(model, "tag:cookies tag:linzer")).toBe("linzer");
    expect(subjectOf(model, "tag:linzer tag:dessert")).toBe("linzer");
  });

  it("is nothing for two unrelated terms, the Kind, or a bare string", () => {
    expect(subjectOf(model, "tag:cookies tag:quick")).toBe(undefined);
    expect(subjectOf(model, "tag:drink")).toBe(undefined);
    expect(subjectOf(model, "tag:drink tag:sour")).toBe("sour");
    expect(subjectOf(model, "tag:baked")).toBe(undefined);
    expect(subjectOf(model, "-tag:cookies")).toBe(undefined);
    expect(subjectOf(model, "cookies")).toBe(undefined);
  });

  it("reads an alias as its term", () => {
    expect(subjectOf(model, "tag:xmas")).toBe("christmas");
  });

  it("places the subject root first", () => {
    expect(breadcrumbOf(model, "linzer")).toEqual([
      "Course",
      "Desserts",
      "Cookies",
    ]);
    expect(breadcrumbOf(model, "course")).toEqual([]);
  });
});

describe("seasonBands", () => {
  /* 2026-10-18: Halloween in 13 days, Christmas in 68 (the canvas's day). */
  const today = { year: 2026, month: 10, day: 18 };
  const COOKIES = [
    recipe("oreos", ["cookies", "halloween"]),
    recipe("gingerbread", ["cookies", "christmas"]),
    recipe("spritz", ["cookies", "xmas", "fall"]),
    recipe("pumpkin", ["cookies", "fall"]),
    recipe("linzer", ["linzer", "christmas"]),
    recipe("breakfast", ["cookies"]),
    recipe("smore", ["cookies", "baked"]),
  ];

  it("bands holidays soonest first, then collections, then the rest", () => {
    const view = seasonBands(model, COOKIES, "cookies", today)!;
    expect(view.bands.map((band) => [band.slug, band.days])).toEqual([
      ["halloween", 13],
      ["christmas", 68],
      ["fall", undefined],
    ]);
    expect(slugs(view.bands[1].recipes)).toEqual([
      "gingerbread",
      "spritz",
      "linzer",
    ]);
    /* Spritz sits in Christmas and in Fall: a recipe in every band it is in. */
    expect(slugs(view.bands[2].recipes)).toEqual(["spritz", "pumpkin"]);
    expect(slugs(view.rest)).toEqual(["breakfast", "smore"]);
  });

  it("keeps result order inside every band (42s parity)", () => {
    const reversed = [...COOKIES].reverse();
    const view = seasonBands(model, reversed, "cookies", today)!;
    for (const band of [...view.bands.map((b) => b.recipes), view.rest]) {
      const positions = band.map((r) => reversed.indexOf(r));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
  });

  it("leaves out a band on the subject's own line", () => {
    const view = seasonBands(model, COOKIES, "christmas", today)!;
    expect(view.bands.map((band) => band.slug)).toEqual(["halloween", "fall"]);
  });

  it("is nothing when no band holds a result", () => {
    expect(
      seasonBands(model, [recipe("a", ["cookies"])], "cookies", today),
    ).toBe(undefined);
  });
});

describe("recipeMeta", () => {
  it("says a drink's style, else its family, then the time", () => {
    expect(recipeMeta(model, LIME[0])).toEqual(["Highball", "5m"]);
    expect(recipeMeta(model, LIME[2])).toEqual(["Sour"]);
    expect(recipeMeta(model, recipe("f", ["frozen-margarita"]))).toEqual([
      "Margarita",
    ]);
  });

  it("says a dish's course at its most specific, then time or effort", () => {
    expect(recipeMeta(model, recipe("l", ["dessert", "linzer"]))).toEqual([
      "Linzer Cookies",
    ]);
    expect(recipeMeta(model, LIME[3])).toEqual(["Sauces", "Quick"]);
    expect(recipeMeta(model, LIME[5])).toEqual(["Salads", "30m"]);
    expect(
      recipeMeta(model, recipe("t", [], { prepTime: 20, cookTime: 70 })),
    ).toEqual(["1h 30m"]);
    expect(recipeMeta(model, recipe("n", ["baked"]))).toEqual([]);
  });
});

describe("leadingAmount", () => {
  it.each([
    ["1 1/2 oz lime juice", "1 1/2 oz", "lime juice"],
    ["1/2 oz lime juice", "1/2 oz", "lime juice"],
    ["120 g key lime juice", "120 g", "key lime juice"],
    ["1 T fresh lime juice", "1 T", "fresh lime juice"],
    ["2 tbsp lime juice", "2 tbsp", "lime juice"],
    ["1 lime (juice of)", "1", "lime (juice of)"],
    ["1 1/2 tsp salt", "1 1/2 tsp", "salt"],
    ["½ cup sugar", "½ cup", "sugar"],
    ["2-3 limes", "2-3", "limes"],
    ["3 fl oz tonic water", "3 fl oz", "tonic water"],
    ["1 cup of flour", "1 cup", "flour"],
  ])("%s → %s | %s", (line, amount, rest) => {
    expect(leadingAmount(line)).toEqual({ amount, rest });
  });

  it.each([
    "juice of 2 limes",
    "Kosher salt",
    "salt, to taste",
    "lime wedges",
    "",
  ])("%s has no leading column", (line) => {
    expect(leadingAmount(line)).toBe(undefined);
  });
});

describe("whyMatch", () => {
  const pie = recipe("pie", ["dessert"], {
    name: "Key Lime Pie",
    description: "A tart custard pie with a graham crust.",
    ingredients: ["1 can sweetened condensed milk", "120 g key lime juice"],
  });

  it("is the first ingredient line the words mark, with its amount", () => {
    expect(whyMatch(pie, queryWords("lime"))).toEqual({
      kind: "ingredient",
      line: "120 g key lime juice",
      amount: "120 g",
      rest: "key lime juice",
    });
  });

  it("falls back to the description, and to nothing", () => {
    expect(whyMatch(pie, queryWords("graham"))).toEqual({
      kind: "description",
      text: "A tart custard pie with a graham crust.",
    });
    expect(whyMatch(pie, queryWords("quince"))).toBe(undefined);
    expect(whyMatch(pie, [])).toBe(undefined);
  });

  it("shows no line before the ingredients have loaded (42s)", () => {
    const { ingredients: _lines, ...display } = pie;
    expect(whyMatch(display, queryWords("lime"))).toBe(undefined);
  });

  it("folds accents as the highlighter does", () => {
    const brulee = recipe("b", [], { ingredients: ["2 cups crème fraîche"] });
    expect(whyMatch(brulee, queryWords("creme"))).toMatchObject({
      amount: "2 cups",
      rest: "crème fraîche",
    });
  });
});

describe("browseRoots", () => {
  it("lists the facet roots with their term counts, not the Kind", () => {
    expect(browseRoots(model)).toEqual([
      { slug: "course", label: "Course", terms: 5 },
      { slug: "cuisine", label: "Cuisine", terms: 1 },
      { slug: "effort", label: "Speed & effort", terms: 1 },
      { slug: "holidays", label: "Holidays", terms: 2 },
      { slug: "spirit", label: "Spirit & base", terms: 1 },
    ]);
  });
});

describe("ingredient completions (43s)", () => {
  const lines = {
    a: ["1 cup pumpkin seeds", "2 cups pumpkin puree"],
    b: ["1/4 cup pumpkin seeds"],
    c: ["1 tsp pumpkin pie spice", "1 cup pumpkin puree"],
  };

  it("counts the recipes ingredient: would find", () => {
    const count = recipeLineCounter(lines);
    expect(count("pumpkin")).toBe(3);
    expect(count("pumpkin seed")).toBe(2);
    expect(count("puree")).toBe(2);
    expect(count("quince")).toBe(0);
  });

  it("offers one of 'seed' and 'seeds' — the shortest — with counts", () => {
    expect(pluralKey("pumpkin seeds")).toBe(pluralKey("pumpkin seed"));
    const options = ingredientOptions("pump", {
      names: ["pumpkin puree", "pumpkin seeds", "pumpkin seed"],
      matches: () => true,
      count: recipeLineCounter(lines),
    });
    // In the more used one's place, spelled the way that finds both.
    expect(options.map((o) => [o.label, o.count])).toEqual([
      ["pumpkin puree", 2],
      ["pumpkin seed", 2],
    ]);
  });

  it("still finds a singular-only recipe from the offered form", () => {
    const shelled = {
      plural: ["1 cup pumpkin seeds"],
      singular: ["1 cup pumpkin seed kernels"],
    };
    const [option] = ingredientOptions("pumpkin s", {
      names: ["pumpkin seeds", "pumpkin seed"],
      matches: () => true,
      count: recipeLineCounter(shelled),
    });
    expect(option.label).toBe("pumpkin seed");
    expect(option.count).toBe(2);
    const { filter } = parseQuery(option.replacement);
    for (const ingredients of Object.values(shelled))
      expect(matchesFilter({ name: "R", ingredients }, filter)).toBe(true);
  });

  it("dedupes the -e plurals and the -es ones", () => {
    expect(pluralKeys("limes")).toContain(pluralKey("lime"));
    expect(pluralKeys("cheeses")).toContain(pluralKey("cheese"));
    expect(pluralKeys("tomatoes")).toContain(pluralKey("tomato"));
    expect(pluralKey("swiss")).toBe("swiss");
    const labels = (prefix: string, names: string[]) =>
      ingredientOptions(prefix, { names, matches: () => true }).map(
        (o) => o.label,
      );
    expect(labels("", ["limes", "lime", "apples", "apple"])).toEqual([
      "lime",
      "apple",
    ]);
    expect(labels("c", ["cheeses", "cheese", "cherries"])).toEqual([
      "cheese",
      "cherries",
    ]);
    expect(labels("t", ["tomato", "tomatoes"])).toEqual(["tomato"]);
  });

  it("judges a group by its members that pass, not its first", () => {
    // "lime" no line matches; "limes" does, so the group still offers.
    expect(
      ingredientOptions("li", {
        names: ["lime", "limes"],
        matches: (needle) => needle === "limes",
      }).map((o) => o.label),
    ).toEqual(["limes"]);
    // A typed member finds the whole group: nothing to narrow to.
    expect(
      ingredientOptions("lime", {
        names: ["limes", "lime"],
        matches: () => true,
      }),
    ).toEqual([]);
  });
});
