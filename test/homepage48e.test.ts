// @vitest-environment node
//
// 48e: the homepage's canvas B, the pure half — Tonight's candidates and the
// day's turn through them, the next holiday as its menu by course (turkey,
// stuffing and pie lead their courses: 47h row 13), the day's answer (a
// recipe once on the page), the batches and cuisines of New in the
// collection, and the plan a menu link fills in.

import { describe, expect, it } from "vitest";
import type { RecipeListEntry } from "../websites/recipe-website/common/controller/paginationConfigs";
import {
  chooseCards,
  classicScore,
  classicWords,
  feastCounts,
  feastEntries,
  leadOrder,
  type FeastCourse,
} from "../websites/recipe-website/common/controller/homepageFeasts";
import { tonightCandidates } from "../websites/recipe-website/common/controller/homepageTonight";
import {
  dayNumber,
  homepageDay,
  rotate,
  type DayFeast,
} from "../websites/recipe-website/common/controller/homepageDay";
import {
  freshBatches,
  freshCuisines,
} from "../websites/recipe-website/common/controller/homepageFresh";
import {
  groupPrefill,
  groupPrefillHref,
} from "../websites/recipe-website/common/controller/groupPrefill";

const tree = {
  holidays: {
    label: "Holidays",
    children: ["thanksgiving", "christmas", "new-years", "fall-favorites"],
  },
  thanksgiving: { label: "Thanksgiving", parent: "holidays", children: [] },
  christmas: { label: "Christmas", parent: "holidays", children: [] },
  "new-years": { label: "New Year's", parent: "holidays", children: [] },
  /* A season, not a day: never "next". */
  "fall-favorites": {
    label: "Fall Favorites",
    parent: "holidays",
    children: [],
  },
  course: {
    label: "Course",
    children: ["dessert", "main", "side", "bread", "snack", "soup", "pies"],
  },
  dessert: { label: "Desserts", parent: "course", children: ["bars"] },
  bars: { label: "Bars & brownies", parent: "dessert", children: [] },
  main: { label: "Mains", parent: "course", children: [] },
  side: { label: "Sides", parent: "course", children: [] },
  bread: { label: "Breads & doughs", parent: "course", children: [] },
  snack: { label: "Snacks & appetizers", parent: "course", children: [] },
  soup: { label: "Soups & stews", parent: "course", children: [] },
  /* 48k: pies is a course, not under dessert; a sweet pie keeps dessert. */
  pies: { label: "Pies & tarts", parent: "course", children: [] },
  cuisine: { label: "Cuisine", children: ["caribbean", "korean"] },
  caribbean: { label: "Caribbean", parent: "cuisine", children: ["jamaican"] },
  jamaican: { label: "Jamaican", parent: "caribbean", children: [] },
  korean: { label: "Korean", parent: "cuisine", children: [] },
  effort: { label: "Speed & effort", children: ["quick", "easy"] },
  quick: { label: "Quick", parent: "effort", children: [] },
  easy: { label: "Easy", parent: "effort", children: [] },
  drink: { label: "Drinks", children: ["batch", "warm-drinks", "zero-proof"] },
  batch: { label: "Batch", parent: "drink", children: [] },
  "warm-drinks": { label: "Warm Drinks", parent: "drink", children: [] },
  "zero-proof": { label: "Zero-proof", parent: "drink", children: [] },
};

const DAY = 86_400_000;
/* 9 November 2026, noon UTC — the canvas's evening — and counting back. */
const NOV_9 = Date.UTC(2026, 10, 9, 12);

function recipe(
  slug: string,
  name: string,
  date: number,
  tags: string[],
  extra: Partial<RecipeListEntry> = {},
): RecipeListEntry {
  return { slug, name, date, tags, ...extra };
}

/*
 * Thanksgiving as the real corpus has it (read 2026-11-18): the newest
 * imports are rolls, pie bars and candied sweet potatoes, all photographed;
 * the turkey, the stuffing and the pumpkin pie are older.
 */
const thanksgiving = [
  recipe(
    "honey-butter-rolls",
    "Honey Butter Rolls",
    NOV_9,
    ["thanksgiving", "christmas", "bread"],
    { image: "rolls.jpg" },
  ),
  recipe(
    "pie-bars",
    "Cranberry Crumble Pie Bars",
    NOV_9 - 1,
    ["thanksgiving", "dessert", "bars"],
    { image: "bars.jpg" },
  ),
  recipe(
    "candied-sweet-potatoes",
    "Candied Sweet Potatoes",
    NOV_9 - 2,
    ["thanksgiving", "side", "easy"],
    { image: "yams.jpg" },
  ),
  recipe(
    "indian-pudding",
    "Indian Pudding",
    NOV_9 - 3,
    ["thanksgiving", "dessert"],
    { image: "pudding.jpg" },
  ),
  recipe(
    "roast-turkey",
    "Lagerstrom Roast Turkey",
    NOV_9 - 30 * DAY,
    ["thanksgiving", "main"],
    { image: "turkey.jpg" },
  ),
  recipe(
    "slow-cooker-turkey-breast",
    "Juicy Slow Cooker Turkey Breast",
    NOV_9 - 20 * DAY,
    ["thanksgiving", "main", "easy"],
    { image: "breast.jpg" },
  ),
  recipe(
    "mac-and-cheese",
    "Baked Mac and Cheese",
    NOV_9 - 10 * DAY,
    ["thanksgiving", "main", "side"],
    { image: "mac.jpg" },
  ),
  recipe(
    "cornbread-stuffing",
    "Cornbread Stuffing",
    NOV_9 - 40 * DAY,
    ["thanksgiving", "side"],
    { image: "stuffing.jpg" },
  ),
  recipe(
    "pumpkin-pie",
    "Pumpkin Pie",
    NOV_9 - 50 * DAY,
    ["thanksgiving", "dessert", "pies"],
    { image: "pie.jpg" },
  ),
  recipe("turkey-pot-pie", "Turkey Pot Pie", NOV_9 - 60 * DAY, [
    "thanksgiving",
    "main",
    "pies",
  ]),
  recipe(
    "cheese-ball",
    "Cranberry Pecan Cheese Ball",
    NOV_9 - 5 * DAY,
    ["thanksgiving", "snack"],
    { image: "ball.jpg" },
  ),
  recipe("squash-soup", "Butternut Squash Soup", NOV_9 - 6 * DAY, [
    "thanksgiving",
    "soup",
  ]),
  recipe(
    "mulled-cider",
    "Mulled Cider",
    NOV_9 - 7 * DAY,
    ["drink", "batch", "zero-proof", "warm-drinks", "thanksgiving"],
    { image: "cider.jpg", totalTime: 65 },
  ),
  recipe("dinner-rolls", "Soft Dinner Rolls", NOV_9 - 8 * DAY, [
    "thanksgiving",
    "bread",
  ]),
];

const christmas = [
  recipe(
    "honey-butter-rolls",
    "Honey Butter Rolls",
    NOV_9,
    ["thanksgiving", "christmas", "bread"],
    { image: "rolls.jpg" },
  ),
  recipe(
    "gingerbread",
    "Gingerbread Cookies",
    NOV_9 - 9 * DAY,
    ["christmas", "dessert"],
    { image: "gb.jpg" },
  ),
  recipe(
    "hot-chocolate",
    "Slow Cooker Hot Chocolate",
    NOV_9 - 11 * DAY,
    ["drink", "warm-drinks", "christmas"],
    { prepTime: 10, cookTime: 300 },
  ),
];

const others = [
  recipe("french-75", "French 75", NOV_9 - 12 * DAY, ["drink", "new-years"], {
    image: "f75.jpg",
  }),
  recipe(
    "bulgogi",
    "Spicy Pork Bulgogi",
    NOV_9 - 13 * DAY,
    ["main", "korean", "quick"],
    { image: "bulgogi.jpg", totalTime: 25 },
  ),
  recipe(
    "beef-broccoli",
    "15-Minute Ground Beef & Broccoli",
    NOV_9 - 14 * DAY,
    ["main", "quick", "easy"],
    { totalTime: 15 },
  ),
  recipe(
    "jerk-chicken",
    "Jerk Chicken",
    NOV_9 - 15 * DAY,
    ["main", "jamaican", "quick"],
    { prepTime: 10, cookTime: 20 },
  ),
  /* Quick but not a main: never a quick dinner. */
  recipe("guacamole", "Guacamole", NOV_9 - 16 * DAY, ["snack", "quick"]),
  recipe("apple-crisp", "Apple Crisp", NOV_9 - 17 * DAY, [
    "dessert",
    "fall-favorites",
  ]),
];

const all = [
  ...new Map(
    [...thanksgiving, ...christmas, ...others].map((r) => [r.slug, r]),
  ).values(),
];

/* The by-term map: each tag slug's own carriers, as the index has them. */
const byTerm: Record<string, { label: string; items: RecipeListEntry[] }> = {};
for (const row of all) {
  for (const tag of row.tags ?? []) {
    (byTerm[tag] ??= { label: tag, items: [] }).items.push(row);
  }
}
const recipeRows = (key: string) => byTerm[key];

const records: Record<string, { description?: string; pinned?: string[] }> = {
  thanksgiving: {
    description:
      "The whole table: turkey, stuffing and sides, cranberry sauce, rolls, and pumpkin, pecan and apple pies.",
  },
};

describe("the next holiday as its menu by course (47h row 13)", () => {
  const { feasts, recipes } = feastEntries({
    tree,
    records: (slug) => records[slug],
    recipeRows,
    featuredTerms: new Set(["thanksgiving"]),
  });
  const feast = feasts.find((entry) => entry.slug === "thanksgiving")!;
  const lead = (course: string) =>
    feast.cards.find((card) => card.slug === course)?.picks[0];

  it("hands over each dated holiday with a recipe, never an undated one", () => {
    expect(feasts.map((entry) => entry.slug)).toEqual([
      "thanksgiving",
      "christmas",
      "new-years",
    ]);
    expect(feast.rule).toBe("thanksgiving");
    expect(feast.featured).toBe(true);
    expect(feast.counts).toEqual({ recipes: 14, dishes: 13, drinks: 1 });
    expect(feastCounts(feast.counts, feast.featured)).toBe(
      "13 dishes · 1 drink · featured",
    );
    expect(recipes.get("roast-turkey")?.name).toBe("Lagerstrom Roast Turkey");
  });

  it("puts the turkey, the stuffing and the pie in their courses, and at their heads", () => {
    expect(lead("main")).toMatch(/turkey/);
    expect(lead("side")).toBe("cornbread-stuffing");
    expect(lead("dessert")).toBe("pumpkin-pie");
    /* Rolls the description names; the newest import leads only by date. */
    expect(lead("bread")).toBe("honey-butter-rolls");
    /* The newest photographed imports are still on the menu, just not first. */
    const desserts = feast.cards.find((card) => card.slug === "dessert")!;
    expect(desserts.count).toBe(3);
    expect(desserts.picks).toContain("pie-bars");
    /* A turkey pot pie is a main, though tagged `pies` (48k). */
    expect(feast.cards.find((card) => card.slug === "main")!.count).toBe(4);
  });

  it("shows mains, sides, desserts and drinks, then the biggest of the rest, in menu order", () => {
    /* Breads (2) before Snacks and Soups (1 each, in menu order). */
    expect(feast.cards.map((card) => card.slug)).toEqual([
      "snack",
      "main",
      "side",
      "bread",
      "dessert",
      "drinks",
    ]);
    expect(feast.cards.at(-1)).toMatchObject({ label: "Drinks", count: 1 });
    expect(feast.also).toEqual([
      { slug: "soup", label: "Soups & stews", count: 1 },
    ]);
  });

  it("lets a pin lead its course over the description", () => {
    const pinned = feastEntries({
      tree,
      records: () => ({
        ...records.thanksgiving,
        pinned: ["slow-cooker-turkey-breast", "indian-pudding"],
      }),
      recipeRows,
    }).feasts.find((entry) => entry.slug === "thanksgiving")!;
    const of = (course: string) =>
      pinned.cards.find((card) => card.slug === course)?.picks[0];
    expect(of("main")).toBe("slow-cooker-turkey-breast");
    expect(of("dessert")).toBe("indian-pudding");
    expect(pinned.top.slice(0, 2)).toEqual([
      "slow-cooker-turkey-breast",
      "indian-pudding",
    ]);
  });

  it("falls back to a photo, then the newest, with no description", () => {
    const bare = feastEntries({
      tree,
      records: () => undefined,
      recipeRows,
    }).feasts.find((entry) => entry.slug === "thanksgiving")!;
    expect(bare.cards.find((card) => card.slug === "dessert")!.picks).toEqual([
      "pie-bars",
      "indian-pudding",
      "pumpkin-pie",
    ]);
    expect(bare.cards.find((card) => card.slug === "main")!.picks[0]).toBe(
      "mac-and-cheese",
    );
  });

  it("reads a description's dish words, plural or not", () => {
    const words = classicWords(records.thanksgiving.description);
    expect(words).toEqual(
      expect.arrayContaining(["turkey", "stuffing", "rolls", "pies"]),
    );
    expect(words).not.toContain("the");
    expect(words).not.toContain("whole");
    /* Two words, and the dish itself is one: a pie. */
    expect(classicScore("Pumpkin Pie", words)).toBe(3);
    /* Pie bars say "pie", but they are bars. */
    expect(classicScore("Cranberry Crumble Pie Bars", words)).toBe(2);
    expect(classicScore("Soft Dinner Rolls", words)).toBe(2);
    expect(classicScore("Mulled Cider (A Couple Cooks)", ["cider"])).toBe(2);
    expect(classicScore("Indian Pudding", words)).toBe(0);
    expect(classicScore("Cranberry Sauce", ["cranberries"])).toBe(1);
  });

  it("orders pinned, then named, then pictured, then newest", () => {
    const rows = [
      { slug: "a", name: "Plain", date: 3, image: "a.jpg" },
      { slug: "b", name: "Plain", date: 2 },
      { slug: "c", name: "Turkey", date: 1 },
      { slug: "d", name: "Plain", date: 4 },
    ];
    expect(leadOrder(rows, [], ["turkey"]).map((r) => r.slug)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
    expect(leadOrder(rows, ["b"], ["turkey"])[0].slug).toBe("b");
  });

  it("chooses cards: essentials first, More only when nothing else is left", () => {
    const course = (slug: string, count: number): FeastCourse => ({
      slug,
      label: slug,
      count,
      picks: [],
    });
    const { cards, also } = chooseCards(
      [
        course("breakfast", 1),
        course("snack", 5),
        course("main", 2),
        course("more", 9),
        course("drinks", 1),
      ],
      4,
    );
    /* Main and drinks, then Snacks (5), then Breakfast (1) over More (9). */
    expect(cards.map((card) => card.slug)).toEqual([
      "breakfast",
      "snack",
      "main",
      "drinks",
    ]);
    expect(also.map((card) => card.slug)).toEqual(["more"]);
    expect(
      chooseCards([course("more", 9), course("salad", 1)], 1).cards[0].slug,
    ).toBe("salad");
  });
});

describe("tonight's candidates", () => {
  const tonight = tonightCandidates({ tree, recipeRows });

  it("finds the quick mains, by slug, with their time, cuisine and easy", () => {
    expect(tonight.quick.map((recipe) => recipe.slug)).toEqual([
      "beef-broccoli",
      "bulgogi",
      "jerk-chicken",
    ]);
    expect(tonight.quick[0]).toMatchObject({ minutes: 15, meta: ["easy"] });
    expect(tonight.quick[1]).toMatchObject({ minutes: 25, meta: ["Korean"] });
    /* Prep + cook when there is no total (48a); Jamaican is Caribbean. */
    expect(tonight.quick[2]).toMatchObject({
      minutes: 30,
      meta: ["Caribbean"],
    });
  });

  it("finds the warm drinks and the holidays that make their season", () => {
    expect(tonight.warm.map((recipe) => recipe.slug)).toEqual([
      "hot-chocolate",
      "mulled-cider",
    ]);
    expect(tonight.warm[1]).toMatchObject({
      minutes: 65,
      meta: ["Batch", "Zero-proof"],
    });
    expect(tonight.warmHolidays).toEqual([
      { slug: "thanksgiving", rule: "thanksgiving" },
      { slug: "christmas", rule: "christmas" },
    ]);
  });

  it("has nothing to offer a site without the terms", () => {
    const none = tonightCandidates({ tree: {}, recipeRows: () => undefined });
    expect(none).toEqual({ quick: [], warm: [], warmHolidays: [] });
  });
});

describe("the day's answer", () => {
  const nov9 = { year: 2026, month: 11, day: 9 };
  const feasts: DayFeast[] = [
    {
      slug: "thanksgiving",
      rule: "thanksgiving",
      cards: [
        { slug: "main", picks: ["turkey", "breast"] },
        { slug: "bread", picks: ["rolls", "biscuits"] },
        { slug: "drinks", picks: ["cider"] },
      ],
      top: ["turkey", "rolls", "pie"],
    },
    {
      slug: "christmas",
      rule: "christmas",
      cards: [{ slug: "dessert", picks: ["cookies"] }],
      top: ["rolls", "cookies", "fudge", "nog", "stollen", "ham"],
      plan: "christmas-baking",
    },
    {
      slug: "new-years",
      rule: "new-years",
      cards: [],
      top: ["french-75", "rolls", "kir"],
    },
    { slug: "valentines", rule: "valentines", cards: [], top: ["cake"] },
    /* Past on 9 November, a year out: outside the window. */
    { slug: "halloween", rule: "halloween", cards: [], top: ["dirt"] },
  ];
  const base = {
    today: nov9,
    quick: ["a", "b", "c"],
    warm: ["cider", "nog"],
    warmHolidays: [{ slug: "thanksgiving", rule: "thanksgiving" }],
    feasts,
    featured: [],
    featuredLimit: 5,
    fresh: [],
    freshLimit: 6,
  };

  it("turns through tonight's candidates once a day", () => {
    expect(rotate(["a", "b", "c"], 4, 2)).toEqual(["b", "c"]);
    expect(rotate(["a", "b", "c"], 5, 2)).toEqual(["c", "a"]);
    expect(rotate(["a"], 5, 2)).toEqual(["a"]);
    expect(rotate([], 5, 2)).toEqual([]);
    const today = homepageDay(base).tonight.quick;
    const tomorrow = homepageDay({
      ...base,
      today: { year: 2026, month: 11, day: 10 },
    }).tonight.quick;
    expect(today).toHaveLength(2);
    expect(tomorrow).not.toEqual(today);
    expect(dayNumber({ year: 2026, month: 11, day: 10 })).toBe(
      dayNumber(nov9) + 1,
    );
  });

  it("offers something warm only within 60 days of a holiday with warm drinks", () => {
    expect(homepageDay(base).tonight.warm).toHaveLength(2);
    /* 1 July: Thanksgiving is 148 days off. */
    expect(
      homepageDay({ ...base, today: { year: 2026, month: 7, day: 1 } }).tonight
        .warm,
    ).toEqual([]);
  });

  it("makes the soonest holiday next, the two after it Then, and one After that", () => {
    const day = homepageDay(base);
    expect(day.next).toMatchObject({ slug: "thanksgiving", days: 17 });
    expect(day.then.map((row) => [row.slug, row.days])).toEqual([
      ["christmas", 46],
      ["new-years", 53],
    ]);
    expect(day.after).toEqual({ slug: "valentines", days: 97 });
  });

  it("shows a recipe once: a card gives way, a plan replaces pictures", () => {
    const day = homepageDay({ ...base, quick: ["turkey"] });
    /* The turkey is tonight's quick dinner, so Mains leads with the breast. */
    expect(day.tonight.quick).toEqual(["turkey"]);
    expect(day.next!.cards).toEqual([
      { slug: "main", pick: "breast" },
      { slug: "bread", pick: "rolls" },
      /* The cider is tonight's warm drink, and the only drink: shown anyway. */
      { slug: "drinks", pick: "cider" },
    ]);
    /* Christmas shows its plan; New Year's its pictures less the rolls. */
    expect(day.then[0].picks).toEqual([]);
    expect(day.then[1].picks).toEqual(["french-75", "kir"]);
  });

  it("leaves out of Featured what the page shows, and keeps a dangling slot", () => {
    const day = homepageDay({
      ...base,
      planGroup: "connors-birthday",
      featured: [
        { key: "0-term-halloween", holiday: "halloween" },
        { key: "1-term-thanksgiving", holiday: "thanksgiving" },
        { key: "2-group-connor", group: "connors-birthday" },
        { key: "3-group-baking", group: "christmas-baking" },
        { key: "4-recipe-rolls", recipe: "rolls" },
        { key: "5-dangling", dangling: true },
        { key: "6-term-fall" },
        { key: "7-recipe-soup", recipe: "soup" },
        { key: "8-recipe-soup-again", recipe: "soup" },
      ],
      featuredLimit: 2,
    });
    expect(day.featured).toEqual(["6-term-fall"]);
    expect(day.planShown).toBe(false);
  });

  it("hides On the plan when its plan is a holiday's shown above", () => {
    const day = homepageDay({ ...base, planGroup: "christmas-baking" });
    expect(day.planShown).toBe(true);
  });

  it("fills New in the collection with what nothing above shows, else the newest", () => {
    expect(
      homepageDay({ ...base, fresh: ["rolls", "soup", "salad"], freshLimit: 2 })
        .fresh,
    ).toEqual(["soup", "salad"]);
    expect(homepageDay({ ...base, fresh: ["rolls"] }).fresh).toEqual(["rolls"]);
  });

  it("has no next holiday when none is within 180 days", () => {
    const day = homepageDay({
      ...base,
      feasts: [feasts[3]],
      today: { year: 2026, month: 3, day: 1 },
    });
    expect(day.next).toBeUndefined();
    expect(day.then).toEqual([]);
  });
});

describe("new in the collection", () => {
  const dayOf = (date: number) => new Date(date).toISOString().slice(0, 10);
  const newest = [
    ...thanksgiving.slice(0, 4),
    recipe("bulgogi-2", "Bo Ssam", NOV_9 - DAY, ["main", "korean"], {
      image: "bossam.jpg",
    }),
    recipe("jerk-pork", "Jerk Pork Shoulder", NOV_9 - DAY, [
      "main",
      "jamaican",
    ]),
    recipe("kimchi", "Kimchi Fried Rice", NOV_9 - 2 * DAY, ["main", "korean"]),
  ];

  it("groups the newest by the day they were added, and says what each is", () => {
    const batches = freshBatches(newest, tree, dayOf);
    expect(batches.map((batch) => [batch.day, batch.slugs.length])).toEqual([
      ["2026-11-09", 4],
      ["2026-11-08", 2],
      ["2026-11-07", 1],
    ]);
    expect(batches[0].summary).toBe(
      "Thanksgiving · Desserts and Breads & doughs",
    );
    expect(batches[1].summary).toBe("Mains");
  });

  it("names the cuisines the newest bring, a child under its root", () => {
    expect(freshCuisines(newest, tree)).toEqual([
      {
        slug: "korean",
        label: "Korean",
        count: 2,
        names: ["Bo Ssam", "Kimchi Fried Rice"],
        picture: { slug: "bulgogi-2", image: "bossam.jpg", name: "Bo Ssam" },
      },
      {
        slug: "caribbean",
        label: "Caribbean",
        count: 1,
        names: ["Jerk Pork Shoulder"],
      },
    ]);
  });
});

describe("a plan filled in from the menu", () => {
  it("round-trips a name, tags and labelled rows", () => {
    const href = groupPrefillHref({
      name: "Thanksgiving",
      tags: ["thanksgiving"],
      items: [
        { recipe: "roast-turkey", label: "Mains" },
        { recipe: "cornbread-stuffing", label: "Sides" },
      ],
    });
    expect(href).toBe(
      "/group/new?name=Thanksgiving&tags=thanksgiving&recipe=roast-turkey&recipe=cornbread-stuffing&label=Mains&label=Sides",
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(
      groupPrefill({
        name: params.get("name") ?? undefined,
        tags: params.getAll("tags"),
        recipe: params.getAll("recipe"),
        label: params.getAll("label"),
      }),
    ).toEqual({
      name: "Thanksgiving",
      tags: ["thanksgiving"],
      items: [
        { recipe: "roast-turkey", label: "Mains" },
        { recipe: "cornbread-stuffing", label: "Sides" },
      ],
    });
  });

  it("keeps a recipe page's plain ?recipe= link, and drops what is not a slug", () => {
    expect(groupPrefillHref({ items: [{ recipe: "first-recipe" }] })).toBe(
      "/group/new?recipe=first-recipe",
    );
    expect(groupPrefill({ recipe: "first-recipe" })).toEqual({
      items: [{ recipe: "first-recipe" }],
    });
    expect(
      groupPrefill({ recipe: ["../etc", "Not A Slug", "ok"], tags: ["", " "] }),
    ).toEqual({ items: [{ recipe: "ok" }] });
    expect(groupPrefill({})).toBeUndefined();
    expect(groupPrefill({ name: "x".repeat(500) })!.name).toHaveLength(120);
  });
});
