// @vitest-environment node
//
// Usability pass (U3): `/drinks`' pure half — counts are distinct drinks,
// styles come from the documented list, everything else under `drink` is a
// classic, and each holiday with drinks is a seasonal candidate.

import { describe, expect, it } from "vitest";
import {
  alsoLine,
  drinkMeta,
  drinksPageData,
  groupReady,
  holidayPair,
  isNewDrink,
  shelfLabels,
  shelfSourceLine,
} from "../websites/recipe-website/common/controller/drinksPage";
import type { RecipeListEntry } from "../websites/recipe-website/common/controller/paginationConfigs";
import { parseDayKey } from "../websites/recipe-website/common/util/holidays";

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
  });

  it("counts spirits by drinks only, most first, empty ones left out", () => {
    expect(data.spirits).toEqual([
      { slug: "gin", label: "Gin", count: 2 },
      { slug: "tequila", label: "Tequila", count: 2 },
    ]);
  });

  it("splits styles from classics by the documented list", () => {
    expect(data.styles.map((style) => style.slug)).toEqual([
      "sour",
      "highball",
    ]);
    /* 46h (43-Df2): methods (and strength) are listed apart. */
    expect(data.methods.map((method) => method.slug)).toEqual(["shaken"]);
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

  it("gives each card its base and style, and the browser the same lookup", () => {
    expect(data.seasonal[0].drinks[0].meta).toEqual(["Tequila", "Shaken"]);
    const meta = (slug: string) =>
      drinkMeta(recipes.find((entry) => entry.slug === slug)?.tags, data.meta);
    expect(meta("margarita")).toEqual(["Tequila", "Sour"]);
    expect(meta("poison-apple")).toEqual(["Tequila", "Shaken"]);
    expect(meta("negroni")).toEqual(["Gin"]);
    expect(meta("gin-tonic")).toEqual(["Gin", "Highball"]);
    /* Tags as written, not slugs: "Gin" and "Highball" still read. */
    expect(drinkMeta(["Gin", "Highball"], data.meta)).toEqual([
      "Gin",
      "Highball",
    ]);
    expect(drinkMeta(undefined, data.meta)).toEqual([]);
    /* 46h review: a style proper before a method, whatever the tag order. */
    expect(
      drinkMeta(["tequila", "shaken", "batch"], {
        bases: { tequila: "Tequila" },
        styles: { shaken: "Shaken", batch: "Batch" },
      }),
    ).toEqual(["Tequila", "Batch"]);
    expect(data.meta).toEqual({
      bases: { tequila: "Tequila", gin: "Gin", tea: "Tea" },
      styles: { shaken: "Shaken", sour: "Sour", highball: "Highball" },
    });
  });

  it("answers an empty page without a vocabulary", () => {
    const empty = drinksPageData({ tree: null, recipeRows: () => undefined });
    expect(empty).toMatchObject({
      count: 0,
      spirits: [],
      styles: [],
      methods: [],
      classics: [],
      seasonal: [],
      meta: { bases: {}, styles: {} },
      familyOf: {},
    });
  });
});

describe("the holiday pair (42d)", () => {
  const holidays = [
    { slug: "halloween" },
    { slug: "christmas" },
    { slug: "thanksgiving" },
    /* No rule: never in the pair. */
    { slug: "game-day" },
  ];
  const pair = (today: string, list: { slug: string }[] = holidays) => {
    const found = holidayPair(list, parseDayKey(today));
    return [
      ...found.pair.map(
        (holiday) => `${holiday.slug} ${holiday.days} ${holiday.slot}`,
      ),
      ...(found.then ? [`then ${found.then.slug} ${found.then.days}`] : []),
    ];
  };

  it("is the two soonest within 38a's 60-day window", () => {
    expect(pair("2026-10-15")).toEqual([
      "halloween 16 now",
      "thanksgiving 42 next",
    ]);
    /* After Thanksgiving, Christmas alone: next Halloween is 338 days off,
     * past even the 180-day window, so there is no "Then" line. */
    expect(pair("2026-11-27")).toEqual(["christmas 28 now"]);
  });

  it("names the next past 60 days on a quiet line, within 180", () => {
    const two = [{ slug: "halloween" }, { slug: "christmas" }];
    expect(pair("2026-10-15", two)).toEqual([
      "halloween 16 now",
      "then christmas 71",
    ]);
  });

  it("hides when nothing is within 60 days", () => {
    /* The day after Christmas: next Halloween is 309 days off. */
    expect(pair("2026-12-26")).toEqual([]);
    /* Halloween 77 days off: past the seasonal window, no section. */
    expect(pair("2027-08-15")).toEqual([]);
  });

  it("dates a holiday by its rule when the slug has none", () => {
    expect(
      holidayPair(
        [{ slug: "xmas", rule: "christmas" }, { slug: "game-day" }],
        parseDayKey("2026-12-01"),
      ),
    ).toEqual({
      pair: [{ slug: "xmas", rule: "christmas", days: 24, slot: "now" }],
    });
  });

  it("takes each holiday's rule from its slug, then its aliases (42e)", () => {
    const holidayTree = {
      drink: { label: "Drinks", children: [] },
      holidays: { label: "Holidays", children: ["xmas", "new-years"] },
      xmas: {
        label: "Xmas",
        parent: "holidays",
        children: [],
        aliases: ["Christmas"],
      },
      /* 42e's Te2: its own slug's rule wins over an alias's. */
      "new-years": {
        label: "New Year's",
        parent: "holidays",
        children: [],
        aliases: ["New Year's Eve"],
      },
    };
    const eggnog = recipe("eggnog", 1, ["drink", "xmas", "new-years"]);
    const page = drinksPageData({
      tree: holidayTree,
      recipeRows: (key) =>
        eggnog.tags?.includes(key)
          ? { label: key, items: [eggnog] }
          : undefined,
    });
    expect(
      page.seasonal.map((holiday) => [holiday.slug, holiday.rule]),
    ).toEqual([
      ["xmas", "christmas"],
      ["new-years", "new-years"],
    ]);
  });
});

describe("the shelf (42d)", () => {
  it("shows the list Count from counts, and this browser's uncounted", () => {
    const browser = ["vodka", "Gin"];
    const saved = ["gin", "tonic water"];
    expect(shelfLabels("browser", browser, saved)).toEqual([
      { item: "vodka", kind: "have", counted: true },
      { item: "Gin", kind: "have", counted: true },
    ]);
    /* The saved list alone leads; this browser's own follow, muted, as on
     * /make — what is on both lists shows once, counted. */
    expect(shelfLabels("saved", browser, saved)).toEqual([
      { item: "gin", kind: "saved", counted: true },
      { item: "tonic water", kind: "saved", counted: true },
      { item: "vodka", kind: "have", counted: false },
    ]);
    /* Both: this browser's first, then what only the second list has. */
    expect(shelfLabels("both", browser, saved)).toEqual([
      { item: "vodka", kind: "have", counted: true },
      { item: "Gin", kind: "have", counted: true },
      { item: "tonic water", kind: "saved", counted: true },
    ]);
    /* No second list: this browser's, whatever was chosen on another page. */
    expect(shelfLabels("saved", browser)).toEqual([
      { item: "vodka", kind: "have", counted: true },
      { item: "Gin", kind: "have", counted: true },
    ]);
  });

  it("says whose list it is", () => {
    expect(shelfSourceLine("browser", undefined, 2)).toBe(
      "From this browser's list — 2 things on the shelf.",
    );
    expect(shelfSourceLine("saved", "saved", 23)).toBe(
      "From your saved list — 23 things on the shelf.",
    );
    expect(shelfSourceLine("saved", "house", 1)).toBe(
      "From the house list — 1 thing on the shelf.",
    );
    expect(shelfSourceLine("both", "saved", 3)).toBe(
      "From this browser and your saved list — 3 things on the shelf.",
    );
    expect(shelfSourceLine("browser", "saved", 0)).toBe(
      "Nothing on the shelf yet — this browser's list is empty.",
    );
    expect(shelfSourceLine("both", "house", 0)).toBe(
      "Nothing on the shelf yet.",
    );
  });
});

describe("NEW and the names after the cards (42d)", () => {
  const day = 24 * 60 * 60 * 1000;
  it("marks a drink NEW for 30 days", () => {
    const now = Date.parse("2026-10-19");
    expect(isNewDrink(now - day, now)).toBe(true);
    expect(isNewDrink(now - 29 * day, now)).toBe(true);
    expect(isNewDrink(now - 30 * day, now)).toBe(false);
    /* Dated earlier today, judged against the clock (not a day key read
     * as UTC midnight, which west of UTC would put it in the future). */
    expect(isNewDrink(now - 60 * 60 * 1000, now)).toBe(true);
    /* Dated after today (a clock behind): not new, not negative. */
    expect(isNewDrink(now + day, now)).toBe(false);
  });

  it("names what the cards leave out", () => {
    const names = [
      "Cranberry Moscow Mule (Spend With Pennies)",
      "Cranberry Thyme Spritzer",
      "Apple Cider Mimosa (A Couple Cooks)",
      "Mulled Cider",
      "Apple Cider Sangria",
      "Homemade Apple Cider",
    ];
    expect(alsoLine(names, 7, 2)).toBe(
      "Also: Apple Cider Mimosa, Mulled Cider, Apple Cider Sangria and 2 more.",
    );
    expect(alsoLine(names.slice(0, 4), 4, 2)).toBe(
      "Also: Apple Cider Mimosa and Mulled Cider.",
    );
    expect(alsoLine(names.slice(0, 3), 3, 2)).toBe("Also: Apple Cider Mimosa.");
    expect(alsoLine(names.slice(0, 2), 2, 2)).toBe("");
    expect(alsoLine(names.slice(0, 4), 4, 4)).toBe("");
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
    /* Two families: the list picks between them by what is ready. */
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
    const daiquiri = { slug: "daiquiri", label: "Daiquiri" };
    expect(page.familyOf).toEqual({
      daiquiri: [daiquiri],
      "daiquiri-no-2": [daiquiri],
      /* Most drinks first: Daiquiri (three), then Hemingway (one). */
      "hemingway-daiquiri": [
        daiquiri,
        { slug: "hemingway", label: "Hemingway" },
      ],
      margarita: [{ slug: "margarita", label: "Margarita" }],
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

  it("puts a drink in two families with the one that has more ready drinks", () => {
    const match = (slug: string) => ({ recipe: { slug, name: slug } });
    const families = {
      a: [{ slug: "hemingway", label: "Hemingway" }],
      b: [{ slug: "hemingway", label: "Hemingway" }],
      /* Daiquiri has more drinks in all, Hemingway more ready ones. */
      both: [
        { slug: "daiquiri", label: "Daiquiri" },
        { slug: "hemingway", label: "Hemingway" },
      ],
      c: [{ slug: "daiquiri", label: "Daiquiri" }],
    };
    const label = (entries: ReturnType<typeof groupReady>) =>
      entries.map((entry) =>
        entry.kind === "family"
          ? `${entry.label} ×${entry.matches.length}`
          : entry.match.recipe.slug,
      );
    expect(
      label(groupReady([match("both"), match("a"), match("b")], families)),
    ).toEqual(["Hemingway ×3"]);
    /* A tie on ready drinks: the family with more drinks (listed first). */
    expect(
      label(groupReady([match("both"), match("a"), match("c")], families)),
    ).toEqual(["Daiquiri ×2", "a"]);
  });
});
