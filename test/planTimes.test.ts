import { describe, expect, it } from "vitest";
import {
  formatBake,
  formatChill,
  formatChillShort,
  formatExtra,
  formatKeeps,
  formatMinutes,
  formatOven,
  formatSpan,
  formatYield,
  parseYield,
  readBake,
  readChill,
  readExtra,
  readKeeps,
  readOven,
  readPlanTimes,
  readRest,
  summarizeMakeAhead,
} from "recipe-website-common/util/planTimes";
import type { InstructionEntry } from "recipe-website-common/controller/types";

/*
 * 43p1 (D5): the plan page reads each recipe's clock from its steps — only
 * plain statements, each with its sentence. Every kind has a real-shaped
 * positive (the shapes of the cookie-tray plan's steps) and near misses
 * that must read as nothing.
 */

describe("readChill", () => {
  it.each([
    [
      "Cover the dough tightly and chill for at least 3 hours or up to 3 days.",
      { min: 180, atLeast: true },
    ],
    ["Chill the dough for 1-2 hours.", { min: 60, max: 120 }],
    [
      "Refrigerate the dough for at least 30 minutes.",
      { min: 30, atLeast: true },
    ],
    ["The dough must be chilled for 1 hour before rolling.", { min: 60 }],
    ["Place the dough in the refrigerator for 2 hours.", { min: 120 }],
    [
      "Chill for at least 2 hours, or overnight.",
      { min: 120, atLeast: true, overnight: true },
    ],
    ["Cover and refrigerate overnight.", { overnight: true }],
  ])("reads %j", (sentence, expected) => {
    expect(readChill(sentence)).toEqual(expected);
  });

  it.each([
    "Chill the glass.",
    "Roll out the chilled dough on a floured counter.",
    "Use a refrigerated pie crust.",
    "Refrigerate leftovers for up to 5 days.",
    "Chill for up to 2 hours.",
    "Chill the dough in the freezer for 10 minutes.",
    "Chill until firm.",
    "Store at room temperature, or chill for 2 hours if you like them firm.",
  ])("reads nothing in %j", (sentence) => {
    expect(readChill(sentence)).toBeUndefined();
  });
});

describe("readKeeps", () => {
  it.each([
    [
      "Cover the dough tightly and chill for at least 3 hours or up to 3 days.",
      { count: 3, unit: "day" },
    ],
    ["The dough can be made 2 days ahead.", { count: 2, unit: "day" }],
    ["Refrigerate the dough for up to one week.", { count: 1, unit: "week" }],
    [
      "Make ahead: the dough keeps 2-3 days in the fridge.",
      { count: 2, max: 3, unit: "day" },
    ],
  ])("reads %j", (sentence, expected) => {
    expect(readKeeps(sentence)).toEqual(expected);
  });

  it.each([
    "Leftover cookies keep for up to 5 days.",
    "Cookies stay fresh covered at room temperature for up to 1 week.",
    "Store the baked cookies in the refrigerator for up to 1 week.",
    "Freeze the dough for up to 3 months.",
    "Bake for up to 2 days.",
    "Chill the dough for at least 3 hours.",
  ])("reads nothing in %j", (sentence) => {
    expect(readKeeps(sentence)).toBeUndefined();
  });
});

describe("readRest", () => {
  it.each([
    [
      "If the dough chilled longer, let it sit at room temperature for about 20 minutes before rolling.",
      { min: 20 },
    ],
    ["Let the batter rest for 10 minutes.", { min: 10 }],
    ["Let stand 5-10 minutes.", { min: 5, max: 10 }],
  ])("reads %j", (sentence, expected) => {
    expect(readRest(sentence)).toEqual(expected);
  });

  it.each([
    "Let the cookies cool on the baking sheet for 5 minutes.",
    "Let the dough rise for 1 hour.",
    "Rest your arms.",
    "Let rest until it is easy to roll.",
  ])("reads nothing in %j", (sentence) => {
    expect(readRest(sentence)).toBeUndefined();
  });
});

describe("readBake", () => {
  it.each([
    [
      "Bake for 11-12 minutes or until the edges are set.",
      { min: 11, max: 12 },
    ],
    ["Bake the cookies for 9–10 minutes.", { min: 9, max: 10 }],
    [
      "Bake at 350°F (177°C) on the middle rack for 25 to 30 minutes.",
      { min: 25, max: 30 },
    ],
    [
      "Bake for about 15 minutes, until the bottoms are lightly golden.",
      { min: 15, about: true },
    ],
  ])("reads %j", (sentence, expected) => {
    expect(readBake(sentence)).toEqual(expected);
  });

  it.each([
    "Pre-bake the crust for 15 minutes.",
    "Blind bake the shell for 20 minutes.",
    "Baked cookies keep for 5 days.",
    "Line a baking sheet with parchment and let sit 10 minutes.",
    "Bake until golden brown.",
  ])("reads nothing in %j", (sentence) => {
    expect(readBake(sentence)).toBeUndefined();
  });
});

describe("readOven", () => {
  it.each([
    ["Preheat the oven to 350°F (177°C).", { degrees: 350, unit: "F" }],
    [
      "Preheat oven to 375 degrees F and line two sheets.",
      { degrees: 375, unit: "F" },
    ],
    ["Bake at 180°C for 12 minutes.", { degrees: 180, unit: "C" }],
    ["Preheat the oven to 400 F.", { degrees: 400, unit: "F" }],
  ])("reads %j", (sentence, expected) => {
    expect(readOven(sentence)).toEqual(expected);
  });

  it.each([
    "Preheat the oven to 350 degrees.",
    "Heat the syrup to 240°F.",
    "Preheat the oven.",
    "Cool to 100°F before slicing in the oven light.",
  ])("reads nothing in %j", (sentence) => {
    expect(readOven(sentence)).toBeUndefined();
  });
});

describe("readExtra", () => {
  it.each([
    [
      "Transfer the cookies to the freezer for 10 minutes.",
      { kind: "freeze", span: { min: 10 } },
    ],
    [
      "Press a candy into each, then 10 minutes in the freezer.",
      { kind: "freeze", span: { min: 10 } },
    ],
    [
      "Decorate, then allow the icing to set for 24 hours.",
      { kind: "set", span: { min: 1440 }, what: "icing" },
    ],
    [
      "Let the chocolate set, about 1 hour.",
      { kind: "set", span: { min: 60 }, what: "chocolate" },
    ],
  ])("reads %j", (sentence, expected) => {
    expect(readExtra(sentence)).toEqual(expected);
  });

  it.each([
    "Freeze the dough for up to 3 months.",
    "Freezer-friendly: wrap tightly.",
    "Spread the icing over the cookies.",
    "Let the icing set completely.",
  ])("reads nothing in %j", (sentence) => {
    expect(readExtra(sentence)).toBeUndefined();
  });
});

describe("parseYield", () => {
  it.each([
    ["84 bite-size cookies", { min: 84, unit: "bite-size cookies" }],
    ["20-22 cookies", { min: 20, max: 22, unit: "cookies" }],
    ["Makes about 24 cookies", { min: 24, unit: "cookies", about: true }],
    ["Serves 4", { min: 4, unit: "servings" }],
    ["Servings: 8", { min: 8, unit: "servings" }],
    ["2 dozen cookies", { min: 24, unit: "cookies" }],
    ['<Multiplyable baseNumber="36" /> cookies', { min: 36, unit: "cookies" }],
  ])("reads %j", (stored, expected) => {
    expect(parseYield(stored)).toMatchObject(expected);
  });

  it.each(["", "One loaf", "varies", "2 1/2 dozen cookies"])(
    "reads nothing in %j",
    (stored) => {
      expect(parseYield(stored)).toBeUndefined();
    },
  );
});

/* The shape of a cookie recipe's steps, written for this test. */
const BLOSSOMS: InstructionEntry[] = [
  {
    text: "Beat the butter, peanut butter and sugars. Beat in the egg and vanilla.",
  },
  {
    text: "Cover the dough and chill for at least 1 hour or up to 3 days.",
  },
  {
    name: "Bake",
    instructions: [
      { text: "Preheat the oven to 350°F (177°C). Line two baking sheets." },
      {
        text: "Roll into balls and bake for 11-13 minutes. Press a chocolate into each, then place the sheet in the freezer for 10 minutes.",
      },
    ],
  },
];

describe("readPlanTimes", () => {
  it("reads every kind with its sentence and step number", () => {
    const times = readPlanTimes({
      instructions: BLOSSOMS,
      recipeYield: "24 cookies",
    });
    expect(times.chill).toEqual({
      value: { min: 60, atLeast: true },
      sentence:
        "Cover the dough and chill for at least 1 hour or up to 3 days.",
      step: 2,
    });
    expect(times.keeps?.value).toEqual({ count: 3, unit: "day" });
    expect(times.oven).toMatchObject({
      value: { degrees: 350, unit: "F" },
      step: 3,
    });
    expect(times.bake).toMatchObject({
      value: { min: 11, max: 13, perBatch: true },
      sentence: "Roll into balls and bake for 11-13 minutes.",
      step: 4,
    });
    expect(times.extras).toEqual([
      {
        value: { kind: "freeze", span: { min: 10 } },
        sentence:
          "Press a chocolate into each, then place the sheet in the freezer for 10 minutes.",
        step: 4,
      },
    ]);
    expect(times.yield).toMatchObject({ min: 24, unit: "cookies" });
    expect(times.rest).toBeUndefined();
  });

  it("reads a bake that is the dish's, not a batch's", () => {
    const times = readPlanTimes({
      instructions: [{ text: "Bake for 50 minutes, until set." }],
      recipeYield: "1 9-inch pie",
    });
    expect(times.bake?.value).toEqual({ min: 50, perBatch: false });
  });

  it("reads nothing from a recipe with no times, and never the description", () => {
    const times = readPlanTimes({
      instructions: [
        { text: "Mix the molasses into the creamed butter and sugar." },
        { text: "Roll, cut and bake until the edges firm up." },
      ],
      recipeYield: "",
    });
    expect(times).toEqual({ extras: [] });
  });
});

describe("wording", () => {
  it("formats spans, chills, keeps, ovens, bakes, extras and yields", () => {
    expect(formatMinutes(30)).toBe("30 min");
    expect(formatMinutes(180)).toBe("3 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatSpan({ min: 11, max: 12 })).toBe("11–12 min");
    expect(formatSpan({ min: 60, max: 120 })).toBe("1–2 h");
    expect(formatSpan({ min: 45, max: 90 })).toBe("45 min–1 h 30 min");
    expect(formatChill({ min: 180, atLeast: true })).toBe("at least 3 h");
    expect(formatChill({ min: 120, atLeast: true, overnight: true })).toBe(
      "at least 2 h or overnight",
    );
    expect(formatChill({ overnight: true })).toBe("overnight");
    expect(formatChillShort({ min: 30, atLeast: true })).toBe("≥ 30 min");
    expect(formatKeeps({ count: 3, unit: "day" })).toBe("3 days");
    expect(formatKeeps({ count: 1, unit: "week" })).toBe("1 week");
    expect(formatKeeps({ count: 2, max: 3, unit: "day" })).toBe("2–3 days");
    expect(formatOven({ degrees: 350, unit: "F" })).toBe("350°F");
    expect(formatBake({ min: 7, max: 9, perBatch: true })).toBe(
      "7–9 min a batch",
    );
    expect(formatBake({ min: 15, about: true, perBatch: true })).toBe(
      "about 15 min a batch",
    );
    expect(formatExtra({ kind: "freeze", span: { min: 10 } })).toBe(
      "then 10 min in the freezer",
    );
    expect(
      formatExtra({ kind: "set", span: { min: 1440 }, what: "icing" }),
    ).toBe("icing sets in 24 h");
    expect(
      formatYield({ min: 8, unit: "servings", text: "8 servings" }, 2),
    ).toBe("16 servings");
    expect(
      formatYield({ min: 20, max: 22, unit: "cookies", text: "20-22 cookies" }),
    ).toBe("20–22 cookies");
  });
});

describe("summarizeMakeAhead", () => {
  it("lists the chills longest first, the keeps span and the ovens", () => {
    const blossoms = readPlanTimes({
      instructions: BLOSSOMS,
      recipeYield: "24 cookies",
    });
    const gingerbread = readPlanTimes({
      instructions: [
        {
          text: "Divide the dough, wrap and chill for at least 3 hours or up to 2 days.",
        },
        { text: "Preheat the oven to 350°F. Bake for 9-10 minutes." },
      ],
    });
    const spritz = readPlanTimes({
      instructions: [
        { text: "Preheat the oven to 350°F. Bake for 7-9 minutes." },
      ],
    });
    const summary = summarizeMakeAhead([
      { name: "Blossoms", times: blossoms },
      { name: "Gingerbread", times: gingerbread },
      { name: "Spritz", times: spritz },
    ]);
    expect(summary.recipes).toBe(3);
    expect(summary.chilling.map(({ name }) => name)).toEqual([
      "Gingerbread",
      "Blossoms",
    ]);
    expect(summary.doughs).toBe(true);
    expect(summary.keepsDays).toEqual({ min: 2, max: 3 });
    expect(summary.ovens).toEqual([
      { oven: { degrees: 350, unit: "F" }, count: 3 },
    ]);
    expect(summary.extras).toEqual([
      { name: "Blossoms", extra: { kind: "freeze", span: { min: 10 } } },
    ]);
  });
});
