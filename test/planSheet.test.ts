import { describe, expect, it } from "vitest";
import {
  bakeScale,
  buildPlanSheet,
  dayBeforeNote,
  formatRest,
  formatYieldSum,
  hasRunSheet,
  mixedStorageKey,
  planDocket,
  sumYields,
  yieldNoun,
  yieldNumber,
  yieldSumLabel,
} from "recipe-website-common/util/planSheet";
import {
  madeStorageKey,
  type PlanRowView,
} from "recipe-website-common/util/planPage";
import {
  parseYield,
  readPlanTimes,
} from "recipe-website-common/util/planTimes";
import { buildShoppingView } from "recipe-website-common/util/shoppingView";
import {
  DEFAULT_SHOPPING_SETTINGS,
  type ShoppingFeatures,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import type {
  GroupItem,
  InstructionEntry,
} from "recipe-website-common/controller/types";

/* 43p2: the run sheet's view model — the hero's counts, the day before, the
 * oven bars to scale, the yields added up, and the shopping docket read
 * from `buildShoppingView` (unchanged). Fixtures are shaped like the real
 * Christmas Baking plan's Sally's recipes (their step and yield wording). */

function recipeRow(
  slug: string,
  name: string,
  steps: string[],
  recipeYield?: string,
  item: Partial<GroupItem> = {},
): PlanRowView {
  const instructions: InstructionEntry[] = steps.map((text) => ({ text }));
  return {
    item: { recipe: slug, ...item } as GroupItem,
    recipe: {
      slug,
      name,
      date: 0,
      ingredientCount: 6,
      drink: false,
      ...(recipeYield ? { yieldText: recipeYield } : {}),
      times: readPlanTimes({ instructions, recipeYield }),
    },
  };
}

const SPRITZ = recipeRow(
  "spritz",
  "My Favorite Spritz Cookies",
  [
    "Preheat the oven to 350°F (177°C).",
    "Press cookies onto unlined, ungreased baking sheets. Bake for 7-9 minutes.",
  ],
  "84 bite-size cookies",
);
const GINGERBREAD = recipeRow(
  "gingerbread",
  "Gingerbread Cookies",
  [
    "Divide the dough in half, wrap each in plastic wrap and chill for at least 3 hours and up to 3 days.",
    "Preheat oven to 350°F (177°C). Bake for 9-10 minutes.",
  ],
  "24 four-inch cookies",
);
const CRINKLES = recipeRow(
  "crinkles",
  "Double Chocolate Crinkle Cookies",
  [
    "Cover the dough and chill for at least 3 hours or up to 3 days.",
    "Remove the dough from the refrigerator and let it sit at room temperature for about 20 minutes.",
    "Preheat oven to 350°F (177°C). Bake for 11-12 minutes.",
  ],
  "20-22 cookies",
);
const SNOWBALLS = recipeRow(
  "snowballs",
  "Snowball Cookies",
  [
    "Chill the dough for at least 30 minutes and up to 3 days.",
    "Preheat oven to 350°F (177°C). Bake for about 15 minutes.",
  ],
  "36 cookies",
);
const SUGAR = recipeRow("sugar", "Christmas Sugar Cookies", [
  "Refrigerate the rolled-out dough for 1-2 hours.",
  "Preheat oven to 350°F (177°C). Bake for 11-12 minutes.",
  "Decorate, then allow the icing to set for 24 hours.",
]);
const TRAY = [SPRITZ, GINGERBREAD, CRINKLES, SNOWBALLS, SUGAR];

/** A week of dinners: nothing chills, nothing bakes. */
const SOUP = recipeRow(
  "soup",
  "Lentil Soup",
  ["Add the lentils and stock and simmer for 25 minutes.", "Season and serve."],
  "Serves 6",
);

describe("hasRunSheet", () => {
  it("is a run sheet when a recipe bakes or chills", () => {
    expect(hasRunSheet(TRAY)).toBe(true);
    expect(hasRunSheet([SOUP, SPRITZ])).toBe(true);
    expect(
      hasRunSheet([
        recipeRow("mousse", "Mousse", ["Chill for at least 4 hours."]),
      ]),
    ).toBe(true);
  });

  it("is not for a week of dinners, a sub-plan alone or a dangling row", () => {
    expect(hasRunSheet([SOUP])).toBe(false);
    expect(
      hasRunSheet([
        {
          item: { recipe: "gone" } as GroupItem,
          missing: "Recipe not found: gone",
        },
        {
          item: { group: "tray" } as GroupItem,
          group: { slug: "tray", name: "Tray", recipes: [], thumbs: [] },
        },
      ]),
    ).toBe(false);
  });
});

describe("tick storage", () => {
  it("keeps mixed apart from made", () => {
    expect(mixedStorageKey("christmas-baking")).toBe(
      "plan-mixed:christmas-baking",
    );
    expect(mixedStorageKey("x")).not.toBe(madeStorageKey("x"));
  });
});

describe("formatRest", () => {
  it.each([
    [{ min: 20 }, "rest 20 min"],
    [{ min: 5, max: 10 }, "rest 5–10 min"],
    [{ overnight: true }, "rest overnight"],
  ])("%j → %s", (rest, text) => {
    expect(formatRest(rest)).toBe(text);
  });
});

describe("yields", () => {
  it("reads what a yield counts, singular", () => {
    expect(yieldNoun("bite-size cookies")).toBe(yieldNoun("cookies"));
    expect(yieldNoun("cookie")).toBe(yieldNoun("cookies"));
    expect(yieldNoun("brownies")).toBe(yieldNoun("brownie"));
    expect(yieldNoun("servings")).toBe("serving");
    expect(yieldNoun("cookies")).not.toBe(yieldNoun("servings"));
    /* A key, not a word: "pastry" and "pastries" count the same thing. */
    expect(yieldNoun("pastries")).toBe(yieldNoun("pastry"));
    expect(yieldNoun("glass")).toBe("glass");
    expect(yieldNoun("")).toBe("");
  });

  it("prints a yield's number at a scale", () => {
    expect(yieldNumber(parseYield("20-22 cookies")!)).toBe("20–22");
    expect(yieldNumber(parseYield("24 cookies")!, 2)).toBe("48");
    expect(yieldNumber(parseYield("Serves 3")!, 0.5)).toBe("1.5");
  });

  it("adds up the cookies, and counts the sugar cookies as one more", () => {
    const sum = sumYields(TRAY)!;
    /* 84 + 24 + 20–22 + 36, the sugar cookies' yield not set. */
    expect(sum).toEqual({
      min: 164,
      max: 166,
      noun: "cookies",
      counted: 4,
      more: 1,
    });
    expect(formatYieldSum(sum)).toBe("164–166");
    expect(yieldSumLabel(sum)).toBe("cookies + 1 more");
  });

  it("scales each row, and never adds servings to cookies", () => {
    const doubled = recipeRow(
      "gingerbread",
      "Gingerbread Cookies",
      [],
      "24 four-inch cookies",
      { scale: "2" },
    );
    const sum = sumYields([SPRITZ, doubled, SOUP])!;
    expect(sum).toEqual({
      min: 132,
      noun: "cookies",
      counted: 2,
      more: 1,
    });
    expect(yieldSumLabel(sum)).toBe("cookies + 1 more");
  });

  it("is nothing when no yield reads", () => {
    expect(sumYields([SUGAR])).toBeUndefined();
    expect(
      sumYields([recipeRow("x", "X", [], "One 9-inch pie")]),
    ).toBeUndefined();
  });
});

describe("bakeScale", () => {
  it("ticks round steps when the longest bake lands on one", () => {
    expect(bakeScale(15)).toEqual({ max: 15, caption: "0 · 5 · 10 · 15 min" });
    expect(bakeScale(60)).toEqual({
      max: 60,
      caption: "0 · 15 · 30 · 45 · 60 min",
    });
  });

  it("says the range when it doesn't, and nothing without a bake", () => {
    expect(bakeScale(13)).toEqual({ max: 13, caption: "0–13 min" });
    expect(bakeScale(5)).toEqual({ max: 5, caption: "0–5 min" });
    expect(bakeScale(0)).toEqual({ max: 0, caption: "" });
  });
});

describe("buildPlanSheet", () => {
  const sheet = buildPlanSheet(TRAY);

  it("counts the hero: recipes, doughs, one oven, the yields", () => {
    expect(sheet.recipes).toBe(5);
    expect(sheet.summary.chilling).toHaveLength(4);
    expect(sheet.summary.doughs).toBe(true);
    expect(sheet.oven).toEqual({ degrees: 350, unit: "F" });
    expect(sheet.yields?.min).toBe(164);
  });

  it("draws each bake to the plan's longest", () => {
    expect(sheet.scale).toEqual({ max: 15, caption: "0 · 5 · 10 · 15 min" });
    const [spritz, , crinkles, snowballs] = sheet.rows;
    /* 7–9 of 15. */
    expect(spritz.bake).toEqual({
      low: 46.7,
      high: 60,
      text: "7–9 min a batch",
    });
    expect(crinkles.bake?.low).toBe(73.3);
    expect(snowballs.bake).toEqual({
      low: 100,
      high: 100,
      text: "about 15 min a batch",
    });
  });

  it("reads the day before, and says not set where the steps don't", () => {
    const [spritz, gingerbread, crinkles, , sugar] = sheet.rows;
    expect(spritz.chill).toBeUndefined();
    expect(spritz.dough).toBe(true);
    expect(gingerbread.chill).toBe("≥ 3 h");
    expect(gingerbread.ahead).toEqual(["keeps 3 days"]);
    expect(crinkles.ahead).toEqual(["keeps 3 days", "rest 20 min"]);
    expect(sugar.chill).toBe("1–2 h");
    expect(sugar.ahead).toEqual(["icing sets in 24 h"]);
    expect(sugar.makes).toBeUndefined();
    expect(spritz.makes).toEqual({ number: "84", unit: "bite-size cookies" });
    expect(sheet.noChill).toEqual(["My Favorite Spritz Cookies"]);
    expect(sheet.noYield).toEqual(["Christmas Sugar Cookies"]);
    expect(sheet.rows.map((row) => row.number)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
    ]);
    expect(dayBeforeNote(sheet)).toBe(
      "Doughs keep 3 days. Chill not set: My Favorite Spritz Cookies.",
    );
  });

  it("puts the freezer after the oven", () => {
    const blossoms = buildPlanSheet([
      recipeRow("blossoms", "Peanut Butter Blossoms", [
        "Preheat oven to 350°F (177°C). Bake for 11-13 minutes.",
        "Press a chocolate kiss into each, then place the sheet in the freezer for 10 minutes.",
      ]),
    ]);
    expect(blossoms.rows[0].after).toEqual(["then 10 min in the freezer"]);
    expect(blossoms.rows[0].ahead).toEqual([]);
  });

  it("names each row's oven only when the plan's ovens differ", () => {
    const mixed = buildPlanSheet([
      SPRITZ,
      recipeRow("bread", "Bread", ["Bake at 425°F for 30-35 minutes."]),
    ]);
    expect(mixed.oven).toBeUndefined();
    expect(mixed.summary.ovens).toHaveLength(2);
    expect(mixed.rows[0].bake?.oven).toBe("at 350°F");
    expect(mixed.rows[1].bake).toEqual({
      low: 85.7,
      high: 100,
      text: "30–35 min",
      oven: "at 425°F",
    });
  });

  it("leaves a sub-plan and a dangling row unread", () => {
    const other = buildPlanSheet([
      SOUP,
      {
        item: { recipe: "gone" } as GroupItem,
        missing: "Recipe not found: gone",
      },
      {
        item: { group: "tray" } as GroupItem,
        group: { slug: "tray", name: "Tray", recipes: [], thumbs: [] },
      },
    ]);
    expect(other.recipes).toBe(1);
    expect(other.rows[0].bake).toBeUndefined();
    expect(other.rows[0].dough).toBe(false);
    expect(other.rows.map((row) => row.tick)).toEqual([
      "recipe:soup",
      "recipe:gone",
      "group:tray",
    ]);
    expect(other.scale.max).toBe(0);
    /* Nothing chills: no "chill not set" list to print. */
    expect(dayBeforeNote(other)).toBe("");
  });
});

// --- the docket --------------------------------------------------------------

let next = 0;
function line(text: string, recipe: string): ShoppingItem {
  next += 1;
  return {
    id: `01j${String(next).padStart(8, "0")}`,
    text,
    recipe,
    via: ["christmas-baking"],
  };
}

function settings(features: Partial<ShoppingFeatures> = {}): ShoppingSettings {
  return {
    ...DEFAULT_SHOPPING_SETTINGS,
    features: { ...DEFAULT_SHOPPING_SETTINGS.features, ...features },
  };
}

const LINES = [
  line("1 cup unsalted butter, softened", "spritz"),
  line("2 1/4 cups all-purpose flour", "spritz"),
  line("1 large egg", "spritz"),
  line("3/4 cup unsalted butter, softened", "gingerbread"),
  line("3 cups all-purpose flour", "gingerbread"),
  line("1 tablespoon ground ginger", "gingerbread"),
  line("1 large egg", "gingerbread"),
  line("2 cups all-purpose flour", "snowballs"),
  line("1 teaspoon vanilla extract", "snowballs"),
];

describe("planDocket", () => {
  it("counts the rows by aisle, most first, and names the big ones", () => {
    const view = buildShoppingView(LINES, settings({ aisles: true }));
    const docket = planDocket(view);
    const total = docket.aisles.reduce((sum, { rows }) => sum + rows, 0);
    expect(total).toBe(view.counts.rows);
    expect(docket.aisles[0].rows).toBeGreaterThanOrEqual(
      docket.aisles.at(-1)!.rows,
    );
    expect(docket.aisles.map(({ label }) => label)).toContain("Spices");
    /* Flour is in three recipes; butter and eggs in two; the rest in one. */
    expect(docket.big).toHaveLength(3);
    expect(docket.big[0]).toMatch(/flour/);
    expect(docket.big.join(" ")).toMatch(/butter/);
    expect(docket.big.join(" ")).toMatch(/egg/);
    expect(docket.big.join(" ")).not.toMatch(/ginger|vanilla/);
  });

  it("has no aisles when they are off, and no big ones without a merge", () => {
    const off = planDocket(
      buildShoppingView(LINES, settings({ aisles: false })),
    );
    expect(off.aisles).toEqual([]);
    const unmerged = planDocket(
      buildShoppingView(LINES, settings({ merge: false })),
    );
    expect(unmerged.big).toEqual([]);
  });

  it("counts ticked and on-hand rows in their aisles too", () => {
    const ticked = LINES.map((each) =>
      each.text.includes("ginger") ? { ...each, checked: true } : each,
    );
    const view = buildShoppingView(ticked, settings({ aisles: true }));
    expect(view.checked.length).toBe(1);
    const docket = planDocket(view);
    expect(docket.aisles.reduce((sum, { rows }) => sum + rows, 0)).toBe(
      view.counts.rows,
    );
  });
});
