// @vitest-environment node
//
// 42e: the holiday pages' pure half — the almanac (which holidays, in what
// order, where on a year's ruler, undated last, a rule found through an
// alias) and one holiday's menu (dishes by course, drinks by style, "More",
// pins first, the kinds).

import { describe, expect, it } from "vitest";
import {
  almanacView,
  holidayAfter,
  holidayAliasTarget,
  holidayEntries,
  holidayKeys,
  holidayMenuData,
  holidayRecipeOf,
  kindCounts,
  menuCourses,
  menuGroups,
  recipesOfKind,
  rulerLanes,
  type HolidayRecipe,
} from "../websites/recipe-website/common/controller/holidaysPage";
import type { RecipeListEntry } from "../websites/recipe-website/common/controller/paginationConfigs";
import {
  holidayRuleKey,
  orderByNextOccurrence,
  parseDayKey,
  withinComingUpWindow,
} from "../websites/recipe-website/common/util/holidays";

const day = (key: string) => parseDayKey(key);

const tree = {
  holidays: {
    label: "Holidays",
    children: ["halloween", "xmas", "fall-favorites", "easter", "valentines"],
  },
  halloween: { label: "Halloween", parent: "holidays", children: [] },
  /* Dated through its alias, and carried by recipes under the alias too. */
  xmas: {
    label: "Christmas",
    parent: "holidays",
    children: ["christmas-cookies"],
    aliases: ["Christmas"],
  },
  "christmas-cookies": {
    label: "Christmas cookies",
    parent: "xmas",
    children: [],
  },
  /* A season, not a day: no rule. */
  "fall-favorites": {
    label: "Fall Favorites",
    parent: "holidays",
    children: [],
  },
  easter: { label: "Easter", parent: "holidays", children: [] },
  /* Nothing carries it: left off the almanac. */
  valentines: { label: "Valentine's Day", parent: "holidays", children: [] },
  course: {
    label: "Course",
    children: ["dessert", "main", "snack", "pizza"],
  },
  dessert: { label: "Desserts", parent: "course", children: ["cookies"] },
  cookies: { label: "Cookies", parent: "dessert", children: [] },
  main: { label: "Mains", parent: "course", children: [] },
  snack: { label: "Snacks & appetizers", parent: "course", children: [] },
  pizza: { label: "Pizza", parent: "course", children: [] },
  "main-ingredient": { label: "Main ingredient", children: ["chocolate"] },
  chocolate: {
    label: "Chocolate",
    parent: "main-ingredient",
    children: [],
  },
  drink: { label: "Drinks", children: ["sour", "warm-drinks", "punch"] },
  sour: { label: "Sour", parent: "drink", children: [] },
  "warm-drinks": { label: "Warm Drinks", parent: "drink", children: [] },
  /* A family, not a style: its drinks go under "More". */
  punch: {
    label: "Punch",
    parent: "drink",
    children: [],
    aliases: ["Punches"],
  },
  spirit: { label: "Spirit & base", children: ["rum"] },
  rum: { label: "Rum", parent: "spirit", children: [] },
};

const recipe = (
  slug: string,
  date: number,
  tags: string[],
  image?: string,
): RecipeListEntry => ({
  slug,
  date,
  name: slug,
  tags,
  ...(image ? { image } : {}),
});

const recipes = [
  recipe("zombie", 9, ["drink", "rum", "sour", "Halloween"], "zombie.jpg"),
  recipe("witches-brew", 8, ["punches", "halloween"]),
  recipe("spider-eggs", 7, ["snack", "halloween"], "eggs.jpg"),
  recipe("brownies", 6, ["dessert", "chocolate", "halloween"]),
  recipe("pumpkin-pizza", 5, ["pizza", "halloween"]),
  recipe("roast", 4, ["main", "halloween"]),
  recipe("hand-pies", 3, ["halloween"]),
  recipe("crinkles", 2, ["cookies", "christmas-cookies"]),
  recipe("wassail", 1, ["drink", "warm-drinks", "christmas"]),
  recipe("apple-crisp", 10, ["dessert", "fall-favorites"]),
  recipe("hot-cross-buns", 11, ["easter"]),
];

const rows = new Map<string, RecipeListEntry[]>();
for (const entry of recipes) {
  for (const tag of entry.tags ?? []) {
    const key = tag.toLowerCase();
    rows.set(key, [...(rows.get(key) ?? []), entry]);
  }
}
for (const list of rows.values()) list.sort((a, b) => b.date - a.date);
const recipeRows = (key: string) => {
  const items = rows.get(key);
  return items ? { label: key, items } : undefined;
};

const records: Record<string, { pinned?: string[]; image?: string }> = {
  halloween: { pinned: ["roast", "missing-recipe"] },
};

const entries = holidayEntries({
  tree,
  records: (slug) => records[slug],
  recipeRows,
})!;

describe("holidayRuleKey", () => {
  it("dates a term by its slug, then by an alias", () => {
    expect(holidayRuleKey("halloween")).toBe("halloween");
    expect(holidayRuleKey("xmas", ["christmas"])).toBe("christmas");
    expect(holidayRuleKey("xmas", ["yule", "christmas"])).toBe("christmas");
    expect(holidayRuleKey("fall-favorites", ["autumn"])).toBeUndefined();
    /* 42k's shape: the slug's own rule wins over an alias with another
     * date (New Year's Eve is 31 December). */
    expect(
      holidayRuleKey("new-years", [
        "new-year",
        "new-years-day",
        "new-years-eve",
      ]),
    ).toBe("new-years");
    expect(holidayRuleKey("fourth-of-july", ["july-4th"])).toBe(
      "fourth-of-july",
    );
  });

  it("lets an item's rule order it", () => {
    const items = [
      { slug: "xmas", rule: "christmas" },
      { slug: "halloween" },
      { slug: "xmas-plain" },
    ];
    expect(
      orderByNextOccurrence(items, day("2026-10-18")).map((item) => [
        item.slug,
        item.days,
      ]),
    ).toEqual([
      ["halloween", 13],
      ["xmas", 68],
      ["xmas-plain", undefined],
    ]);
    expect(
      withinComingUpWindow(items, day("2026-10-18")).map((item) => item.slug),
    ).toEqual(["halloween", "xmas"]);
  });
});

describe("holidayEntries", () => {
  it("is null without a holidays root", () => {
    expect(
      holidayEntries({ tree: {}, records: () => undefined, recipeRows }),
    ).toBeNull();
  });

  it("keeps the holidays that have recipes, in the tree's order", () => {
    expect(entries.map((entry) => entry.slug)).toEqual([
      "halloween",
      "xmas",
      "fall-favorites",
      "easter",
    ]);
  });

  it("dates by alias and counts the subtree, aliases included, by kind", () => {
    const xmas = entries.find((entry) => entry.slug === "xmas")!;
    expect(xmas.rule).toBe("christmas");
    expect(xmas).toMatchObject({ recipes: 2, dishes: 1, drinks: 1 });
    const halloween = entries[0];
    expect(halloween).toMatchObject({ recipes: 7, dishes: 5, drinks: 2 });
    expect(
      entries.find((entry) => entry.slug === "fall-favorites")!.rule,
    ).toBeUndefined();
  });

  it("lists the pinned first, then the newest, and the newest photo", () => {
    const halloween = entries[0];
    expect(halloween.top.map((top) => top.slug)).toEqual([
      "roast",
      "zombie",
      "witches-brew",
    ]);
    expect(halloween.recipeImage).toEqual({
      slug: "zombie",
      image: "zombie.jpg",
      name: "zombie",
    });
  });

  it("reads every key of every holiday's subtree", () => {
    expect(holidayKeys(tree)).toEqual(
      expect.arrayContaining([
        "halloween",
        "xmas",
        "christmas",
        "christmas-cookies",
        "fall-favorites",
        "easter",
        "valentines",
      ]),
    );
  });
});

describe("almanacView", () => {
  it("orders by the next date, undated last, each on a year's ruler", () => {
    const view = almanacView(entries, day("2026-10-18"));
    expect(view.dated.map((holiday) => [holiday.slug, holiday.days])).toEqual([
      ["halloween", 13],
      ["xmas", 68],
      ["easter", 161],
    ]);
    expect(view.dated[0].position).toBeCloseTo(13 / 365);
    expect(view.dated[2].date).toEqual(day("2027-03-28"));
    expect(view.undated.map((holiday) => holiday.slug)).toEqual([
      "fall-favorites",
    ]);
    expect(view.end).toEqual(day("2027-10-18"));
  });

  it("ticks each month across the year end, with the year on January", () => {
    const { ticks } = almanacView([], day("2026-10-18"));
    expect(ticks.map((tick) => tick.label)).toEqual([
      "Nov",
      "Dec",
      "Jan 2027",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
    ]);
    expect(ticks[0].position).toBeCloseTo(14 / 365);
    expect(ticks.at(-1)!.position).toBeLessThanOrEqual(1);
  });

  it("rolls a holiday just past over to next year", () => {
    const view = almanacView(entries, day("2026-12-26"));
    expect(view.dated.map((holiday) => holiday.slug)).toEqual([
      "easter",
      "halloween",
      "xmas",
    ]);
    expect(view.dated.at(-1)!.days).toBe(364);
    expect(view.dated.at(-1)!.position).toBeCloseTo(364 / 365);
  });

  it("keeps a holiday past the window off the ruler", () => {
    /* A late Easter after an early one: 2008-03-24 → 2009-04-12. */
    const view = almanacView([{ slug: "easter" }], day("2008-03-24"));
    expect(view.dated[0].days).toBe(384);
    expect(view.dated[0].position).toBeUndefined();
  });

  it("puts labels that crowd each other in separate lanes", () => {
    expect(rulerLanes([0, 0.03, 0.2, 0.9, 0.93, 0.95], 0.1)).toEqual([
      0, 1, 0, 0, 1, 2,
    ]);
  });

  it("names the holiday after this one", () => {
    const today = day("2026-10-18");
    expect(holidayAfter(entries, "halloween", today)?.slug).toBe("xmas");
    expect(holidayAfter(entries, "easter", today)).toBeUndefined();
    expect(holidayAfter(entries, "fall-favorites", today)).toBeUndefined();
  });
});

describe("holidayMenuData", () => {
  const menu = holidayMenuData({
    slug: "halloween",
    tree,
    record: { pinned: ["roast"], description: "Spooky." },
    recipeRows,
  })!;

  it("is null for anything but a holiday", () => {
    expect(holidayMenuData({ slug: "dessert", tree, recipeRows })).toBeNull();
    expect(holidayMenuData({ slug: "holidays", tree, recipeRows })).toBeNull();
  });

  it("sends an alias of a holiday to it, and nothing else", () => {
    expect(holidayAliasTarget(tree, "christmas")).toEqual({
      slug: "xmas",
      label: "Christmas",
    });
    expect(holidayAliasTarget(tree, "punches")).toBeUndefined();
    expect(holidayAliasTarget(tree, "halloween")).toBeUndefined();
    /* An alias spelled like another record's slug is that record's. */
    const clash = {
      ...tree,
      xmas: { ...tree.xmas, aliases: ["Christmas", "Cookies"] },
    };
    expect(holidayAliasTarget(clash, "cookies")).toBeUndefined();
    expect(holidayAliasTarget(clash, "christmas")?.slug).toBe("xmas");
  });

  it("puts the pinned first, then the newest", () => {
    expect(menu.recipes.map((recipe) => recipe.slug)).toEqual([
      "roast",
      "zombie",
      "witches-brew",
      "spider-eggs",
      "brownies",
      "pumpkin-pizza",
      "hand-pies",
    ]);
    expect(menu.counts).toEqual({ recipes: 7, dishes: 5, drinks: 2 });
    expect(menu.description).toBe("Spooky.");
  });

  it("groups dishes by course in a meal's order, the rest under More", () => {
    expect(
      menu.courses.map((group) => [
        group.label,
        group.recipes.map((recipe) => recipe.slug),
      ]),
    ).toEqual([
      ["Snacks & appetizers", ["spider-eggs"]],
      ["Mains", ["roast"]],
      ["Desserts", ["brownies"]],
      ["Pizza", ["pumpkin-pizza"]],
      ["More", ["hand-pies"]],
    ]);
    expect(menu.recipes.find((r) => r.slug === "brownies")?.base).toBe(
      "Chocolate",
    );
  });

  it("groups drinks by style, a family's under More, with their base", () => {
    expect(
      menu.styles.map((group) => [
        group.slug,
        group.recipes.map((recipe) => recipe.slug),
      ]),
    ).toEqual([
      ["sour", ["zombie"]],
      ["more", ["witches-brew"]],
    ]);
    expect(menu.recipes.find((r) => r.slug === "zombie")?.base).toBe("Rum");
  });

  it("sees a cookie as a dessert through the course's subtree", () => {
    const xmas = holidayMenuData({ slug: "xmas", tree, recipeRows })!;
    expect(xmas.courses.map((group) => group.label)).toEqual(["Desserts"]);
    expect(xmas.styles.map((group) => group.label)).toEqual(["Warm Drinks"]);
    expect(xmas.rule).toBe("christmas");
  });

  it("filters and counts by kind", () => {
    expect(recipesOfKind(menu.recipes, "drinks").map((r) => r.slug)).toEqual([
      "zombie",
      "witches-brew",
    ]);
    expect(recipesOfKind(menu.recipes, "food")).toHaveLength(5);
    expect(recipesOfKind(menu.recipes, "any")).toHaveLength(7);
    expect([...kindCounts(menu.counts)]).toEqual([
      ["any", 7],
      ["food", 5],
      ["drinks", 2],
    ]);
  });
});

describe("holidayRecipeOf", () => {
  const withBreakfast = {
    ...tree,
    course: {
      ...tree.course,
      children: [...tree.course.children, "breakfast"],
    },
    breakfast: { label: "Breakfast", parent: "course", children: [] },
  };
  const view = holidayRecipeOf(withBreakfast);

  it("puts a two-course dish under the earlier course on a menu", () => {
    /* Breakfast comes before desserts and mains, whatever the tag order. */
    for (const tags of [
      ["dessert", "breakfast"],
      ["breakfast", "dessert"],
    ]) {
      expect(view(recipe("pie", 1, tags)).course).toBe("breakfast");
    }
    expect(view(recipe("roast", 1, ["side", "pizza", "main"])).course).toBe(
      "main",
    );
  });

  it("puts a two-style drink under the earlier style", () => {
    expect(
      view(recipe("toddy", 1, ["drink", "warm-drinks", "sour"])).style,
    ).toBe("sour");
  });
});

describe("menuGroups and menuCourses", () => {
  it("orders the courses for a meal, unknown ones after in tree order", () => {
    expect(menuCourses(tree).map((course) => course.slug)).toEqual([
      "snack",
      "main",
      "dessert",
      "pizza",
    ]);
  });

  it("drops empty groups and adds More only when needed", () => {
    const dish = (slug: string, course?: string): HolidayRecipe => ({
      slug,
      name: slug,
      date: 0,
      kind: "food",
      ...(course ? { course } : {}),
    });
    const terms = [
      { slug: "main", label: "Mains" },
      { slug: "side", label: "Sides" },
    ];
    expect(menuGroups([dish("a", "main")], terms, "course")).toEqual([
      { slug: "main", label: "Mains", recipes: [dish("a", "main")] },
    ]);
    expect(
      menuGroups([dish("a"), dish("b", "main")], terms, "course").map(
        (group) => group.slug,
      ),
    ).toEqual(["main", "more"]);
  });
});
