// @vitest-environment node
//
// Usability pass (U3): `/drinks`' pure half — counts are distinct drinks,
// styles come from the documented list, everything else under `drink` is a
// classic, and each holiday with drinks is a seasonal candidate.

import { describe, expect, it } from "vitest";
import {
  drinksPageData,
  groupReady,
} from "../websites/recipe-website/common/controller/drinksPage";
import type { RecipeListEntry } from "../websites/recipe-website/common/controller/paginationConfigs";

const tree = {
  drink: {
    label: "Drinks",
    children: ["sour", "highball", "margarita", "negroni", "shaken"],
  },
  sour: { label: "Sour", parent: "drink", children: [] },
  highball: { label: "Highball", parent: "drink", children: [] },
  shaken: { label: "Shaken", parent: "drink", children: [] },
  margarita: { label: "Margarita", parent: "drink", children: [] },
  negroni: { label: "Negroni", parent: "drink", children: [] },
  spirit: { label: "Spirit & base", children: ["tequila", "gin", "tea"] },
  tequila: { label: "Tequila", parent: "spirit", children: [] },
  gin: { label: "Gin", parent: "spirit", children: [] },
  tea: { label: "Tea", parent: "spirit", children: [] },
  holidays: { label: "Holidays", children: ["halloween", "christmas"] },
  halloween: { label: "Halloween", parent: "holidays", children: [] },
  christmas: { label: "Christmas", parent: "holidays", children: [] },
};

const recipe = (
  slug: string,
  date: number,
  tags: string[],
): RecipeListEntry => ({ slug, date, name: slug, tags });

const recipes = [
  recipe("margarita", 5, ["drink", "tequila", "sour", "shaken", "margarita"]),
  recipe("poison-apple", 4, ["drink", "tequila", "shaken", "halloween"]),
  recipe("negroni", 3, ["drink", "gin", "negroni"]),
  recipe("gin-tonic", 2, ["drink", "gin", "highball"]),
  /* Tea that is not a drink, and Halloween food: neither counts. */
  recipe("tea-cake", 6, ["tea", "dessert"]),
  recipe("pumpkin-bread", 7, ["halloween", "bread"]),
];

const rows = new Map<string, RecipeListEntry[]>();
for (const entry of recipes) {
  for (const tag of entry.tags ?? []) {
    rows.set(tag, [...(rows.get(tag) ?? []), entry]);
  }
}
for (const list of rows.values()) list.sort((a, b) => b.date - a.date);

const data = drinksPageData({
  tree,
  recipeRows: (key) => {
    const items = rows.get(key);
    return items ? { label: key, items } : undefined;
  },
});

describe("drinksPageData", () => {
  it("counts every drink once", () => {
    expect(data.count).toBe(4);
    expect(data.latest.map((card) => card.slug)).toEqual([
      "margarita",
      "poison-apple",
      "negroni",
      "gin-tonic",
    ]);
  });

  it("counts spirits by drinks only, most first, empty ones left out", () => {
    expect(data.spirits).toEqual([
      { slug: "gin", label: "Gin", count: 2 },
      { slug: "tequila", label: "Tequila", count: 2 },
    ]);
  });

  it("splits styles from classics by the documented list", () => {
    expect(data.styles.map((style) => style.slug)).toEqual([
      "shaken",
      "sour",
      "highball",
    ]);
    expect(data.classics.map((term) => term.slug)).toEqual([
      "margarita",
      "negroni",
    ]);
    expect(data.classicsCount).toBe(2);
  });

  it("offers each holiday with drinks, and only its drinks", () => {
    expect(data.seasonal).toHaveLength(1);
    expect(data.seasonal[0]).toMatchObject({
      slug: "halloween",
      label: "Halloween",
      count: 1,
    });
    expect(data.seasonal[0].drinks.map((card) => card.slug)).toEqual([
      "poison-apple",
    ]);
  });

  it("gives each card its base and style", () => {
    const meta = new Map(data.latest.map((card) => [card.slug, card.meta]));
    expect(meta.get("margarita")).toEqual(["Tequila", "Sour"]);
    expect(meta.get("poison-apple")).toEqual(["Tequila", "Shaken"]);
    expect(meta.get("negroni")).toEqual(["Gin"]);
    expect(meta.get("gin-tonic")).toEqual(["Gin", "Highball"]);
  });

  it("answers an empty page without a vocabulary", () => {
    const empty = drinksPageData({ tree: null, recipeRows: () => undefined });
    expect(empty).toMatchObject({
      count: 0,
      spirits: [],
      styles: [],
      classics: [],
      seasonal: [],
      latest: [],
      familyOf: {},
    });
  });
});

describe("drink families (38a)", () => {
  const familyTree = {
    drink: {
      label: "Drinks",
      children: ["sour", "daiquiri", "margarita", "hemingway"],
    },
    sour: { label: "Sour", parent: "drink", children: [] },
    daiquiri: {
      label: "Daiquiri",
      parent: "drink",
      children: [],
      aliases: ["Daiquiris"],
    },
    margarita: { label: "Margarita", parent: "drink", children: [] },
    hemingway: { label: "Hemingway", parent: "drink", children: [] },
  };
  const drinks = [
    recipe("daiquiri", 5, ["drink", "daiquiri", "sour"]),
    /* Only the family's alias: still a Daiquiri, and still a drink. */
    recipe("daiquiri-no-2", 4, ["daiquiris"]),
    /* Two families: the bigger one (Daiquiri, three drinks) claims it. */
    recipe("hemingway-daiquiri", 3, ["drink", "daiquiri", "hemingway"]),
    recipe("margarita", 2, ["drink", "margarita", "sour"]),
    recipe("gimlet", 1, ["drink", "sour"]),
  ];
  const familyRows = new Map<string, RecipeListEntry[]>();
  for (const entry of drinks) {
    for (const tag of entry.tags ?? []) {
      familyRows.set(tag, [...(familyRows.get(tag) ?? []), entry]);
    }
  }
  const page = drinksPageData({
    tree: familyTree,
    recipeRows: (key) => {
      const items = familyRows.get(key);
      return items ? { label: key, items } : undefined;
    },
  });

  it("maps each drink to its family, styles aside, aliases included", () => {
    expect(page.count).toBe(5);
    expect(page.familyOf).toEqual({
      daiquiri: { slug: "daiquiri", label: "Daiquiri" },
      "daiquiri-no-2": { slug: "daiquiri", label: "Daiquiri" },
      "hemingway-daiquiri": { slug: "daiquiri", label: "Daiquiri" },
      margarita: { slug: "margarita", label: "Margarita" },
    });
  });

  it("groups two or more ready drinks of one family, in the judge's order", () => {
    const match = (slug: string) => ({ recipe: { slug, name: slug } });
    const entries = groupReady(
      [
        match("daiquiri"),
        match("gimlet"),
        match("daiquiri-no-2"),
        match("margarita"),
      ],
      page.familyOf,
    );
    expect(
      entries.map((entry) =>
        entry.kind === "family"
          ? `${entry.label} ×${entry.matches.length}`
          : entry.match.recipe.slug,
      ),
    ).toEqual(["Daiquiri ×2", "gimlet", "margarita"]);
    /* A family of one is the drink itself. */
    expect(groupReady([match("margarita")], page.familyOf)).toEqual([
      { kind: "recipe", match: match("margarita") },
    ]);
  });
});
