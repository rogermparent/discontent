import { describe, expect, it } from "vitest";
import {
  cookCaption,
  draftChanges,
  draftItems,
  headsUpLine,
  initialDraft,
  labelRuns,
  madeStorageKey,
  moveRow,
  parseTicks,
  planItemsKey,
  readLabel,
  removeRow,
  rowCaption,
  scaleOptionValue,
  scaleOptions,
  setRowScale,
  tickKeys,
  yieldLine,
  type PlanRecipeView,
} from "recipe-website-common/util/planPage";
import { readPlanTimes } from "recipe-website-common/util/planTimes";
import type { GroupItem } from "recipe-website-common/controller/types";

/* 43p1: the plan page's view model — labels, captions, the draft a Save
 * writes (D5's one commit) and the browser's tick keys. */

function recipe(overrides: Partial<PlanRecipeView> = {}): PlanRecipeView {
  return {
    slug: "spritz",
    name: "Spritz Cookies",
    date: 0,
    ingredientCount: 8,
    drink: false,
    times: { extras: [] },
    ...overrides,
  };
}

describe("readLabel", () => {
  it.each([
    ["Wed · dinner", { day: "Wed", rest: "dinner" }],
    ["Tuesday: bake ahead", { day: "Tue", rest: "bake ahead" }],
    ["Thu Thanksgiving", { day: "Thu", rest: "Thanksgiving" }],
    ["sat", { day: "Sat", rest: "" }],
    ["Starter", { rest: "Starter" }],
    ["Sunday-ish brunch", { day: "Sun", rest: "ish brunch" }],
    ["Monster cookies", { rest: "Monster cookies" }],
  ])("reads %j", (label, expected) => {
    expect(readLabel(label)).toEqual(expected);
  });
});

describe("labelRuns", () => {
  it("groups consecutive rows that share a label, and only those", () => {
    const rows = [
      { item: { recipe: "a", label: "Mon · Dinner" } },
      { item: { recipe: "b", label: "Mon · Dinner" } },
      { item: { recipe: "c" } },
      { item: { recipe: "d", label: "Mon · Dinner" } },
    ] as { item: GroupItem }[];
    expect(
      labelRuns(rows).map((run) => [run.label, run.rows.map((r) => r.index)]),
    ).toEqual([
      ["Mon · Dinner", [0, 1]],
      [undefined, [2]],
      ["Mon · Dinner", [3]],
    ]);
  });
});

describe("captions", () => {
  it("says time · yield · lines, or that neither is set", () => {
    expect(
      rowCaption(
        recipe({
          totalTime: 270,
          times: readPlanTimes({ recipeYield: "24 four-inch cookies" }),
        }),
      ),
    ).toBe("4 h 30 m · 24 four-inch cookies · 8 ingredients");
    expect(rowCaption(recipe({ ingredientCount: 14 }))).toBe(
      "14 ingredients · no time or yield set",
    );
  });

  it("scales the yield with the row and says so", () => {
    const potatoes = recipe({
      times: readPlanTimes({ recipeYield: "8 servings" }),
    });
    expect(yieldLine(potatoes, "2")).toBe("16 servings at 2×");
    expect(yieldLine(potatoes)).toBe("8 servings");
    expect(yieldLine(recipe({ yieldText: "One loaf" }), "2")).toBe("One loaf");
  });

  it("joins the heads-up line from the steps, claiming no absence", () => {
    const times = readPlanTimes({
      instructions: [
        {
          text: "Chill the dough for at least 3 hours or up to 3 days.",
        },
        { text: "Preheat the oven to 350°F. Bake for 9-10 minutes." },
      ],
      recipeYield: "24 cookies",
    });
    expect(headsUpLine(times)).toBe(
      "Chill at least 3 h (keeps 3 days) · 9–10 min a batch at 350°F",
    );
    expect(cookCaption(recipe({ times }))).toBe(
      "chill at least 3 h · 9–10 min a batch",
    );
    expect(headsUpLine({ extras: [] })).toBeUndefined();
  });
});

const ITEMS: GroupItem[] = [
  { recipe: "a", label: "Mon" },
  { recipe: "b", scale: "2" },
  { group: "week" },
  { recipe: "missing" },
];

describe("the draft", () => {
  it("moves, rescales and removes, and writes the items in their new order", () => {
    let draft = initialDraft(ITEMS.length);
    expect(draftChanges(draft, ITEMS)).toBe(0);
    expect(draftItems(draft, ITEMS)).toEqual(ITEMS);

    draft = moveRow(draft, 0, 2);
    draft = setRowScale(draft, 0, "1/2");
    draft = setRowScale(draft, 1, "");
    draft = removeRow(draft, draft.order.indexOf(3));
    expect(draft.order).toEqual([1, 2, 0]);
    /* One for the reorder, two scales, one removal. */
    expect(draftChanges(draft, ITEMS)).toBe(4);
    expect(draftItems(draft, ITEMS)).toEqual([
      { recipe: "b" },
      { group: "week" },
      { recipe: "a", label: "Mon", scale: "1/2" },
    ]);
  });

  it("leaves an item byte-identical when its scale is set back", () => {
    const items: GroupItem[] = [{ recipe: "a", scale: "1" }];
    const draft = setRowScale(initialDraft(1), 0, "");
    expect(draftChanges(draft, items)).toBe(0);
    expect(draftItems(draft, items)).toEqual(items);
  });

  it("never puts a scale on a sub-plan row", () => {
    const draft = setRowScale(initialDraft(ITEMS.length), 2, "2");
    expect(draftItems(draft, ITEMS)[2]).toEqual({ group: "week" });
  });

  it("offers the presets, plus a row's own odd scale", () => {
    expect(scaleOptions(undefined).map((option) => option.label)).toEqual([
      "½×",
      "1×",
      "1½×",
      "2×",
      "3×",
      "4×",
    ]);
    expect(scaleOptions("1.25").map((option) => option.label)).toContain("1¼×");
    expect(scaleOptionValue(undefined)).toBe("1");
    expect(scaleOptionValue("2.0")).toBe("2");
    expect(scaleOptionValue("0.5")).toBe("1/2");
  });
});

describe("ticks", () => {
  it("keys each row by what it names, counting repeats", () => {
    expect(
      tickKeys([
        { recipe: "a" },
        { group: "a" },
        { recipe: "a" },
        { recipe: "b" },
      ]),
    ).toEqual(["recipe:a", "group:a", "recipe:a#1", "recipe:b"]);
    expect(madeStorageKey("christmas-baking")).toBe(
      "plan-made:christmas-baking",
    );
  });

  it("reads stored ticks tolerantly", () => {
    expect(parseTicks(null)).toEqual([]);
    expect(parseTicks("not json")).toEqual([]);
    expect(parseTicks('{"a":1}')).toEqual([]);
    expect(parseTicks('["recipe:a", 3, "group:b"]')).toEqual([
      "recipe:a",
      "group:b",
    ]);
  });
});

describe("planItemsKey", () => {
  /* The review's concurrent-write check: a Save carries the key of the rows
   * its draft was made over; the action refuses when the stored key differs. */
  const rows: GroupItem[] = [
    { recipe: "spritz", label: "Mon", scale: "2" },
    { group: "cookie-tray" },
  ];

  it("ignores key order and absent fields", () => {
    expect(
      planItemsKey([
        { scale: "2", label: "Mon", recipe: "spritz" },
        { group: "cookie-tray", label: undefined } as GroupItem,
      ]),
    ).toBe(planItemsKey(rows));
  });

  it("changes with the rows' order, a value, an added or a removed row", () => {
    const base = planItemsKey(rows);
    expect(planItemsKey([rows[1], rows[0]])).not.toBe(base);
    expect(planItemsKey([{ ...rows[0], scale: "3" }, rows[1]])).not.toBe(base);
    expect(planItemsKey([...rows, { recipe: "linzer" }])).not.toBe(base);
    expect(planItemsKey([rows[0]])).not.toBe(base);
  });
});
