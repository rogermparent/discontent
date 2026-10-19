// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  durationWords,
  findStepTimes,
  formatCountdown,
  parseTimeText,
} from "recipe-website-common/util/timeText";
import { stepPlainText } from "recipe-website-common/util/stepPlainText";
import { parseTimeText as llmParseTimeText } from "../websites/recipe-website/editor/controller/llm/timeText";

/*
 * 42c2: `parseTimeText` moved here from the editor's `controller/llm/` (the
 * old path re-exports it — `llmExtract.test.ts` keeps its own cases and
 * imports it through the extractor), and `findStepTimes` finds the durations
 * in a step's text for the recipe page's timer buttons.
 */

describe("parseTimeText in its new home", () => {
  it("is the function the LLM code still imports", () => {
    expect(llmParseTimeText).toBe(parseTimeText);
  });

  it.each([
    ["25 minutes", 25],
    ["1 1/2 hours", 90],
    ["1½ hours", 90],
    ["45 to 50 minutes", 50],
    ["10-12 min", 12],
  ])("%s → %d minutes (a range reads as its upper end)", (text, minutes) => {
    expect(parseTimeText(text)).toBe(minutes);
  });

  it.each(["overnight", "350 degrees", "2 cups"])("%s → undefined", (text) => {
    expect(parseTimeText(text)).toBeUndefined();
  });
});

/** The times in a text, as [words, seconds, maxSeconds?]. */
function times(text: string) {
  return findStepTimes(text).map(({ text: words, seconds, maxSeconds }) =>
    maxSeconds === undefined ? [words, seconds] : [words, seconds, maxSeconds],
  );
}

describe("findStepTimes", () => {
  it.each<[string, (string | number)[][]]>([
    ["Bake for 25 minutes.", [["25 minutes", 1500]]],
    ["Simmer 1 1/2 hours, stirring.", [["1 1/2 hours", 5400]]],
    ["Roast 1½ hours.", [["1½ hours", 5400]]],
    ["Rest for ½ hour.", [["½ hour", 1800]]],
    /* Dc2-1: a range runs to its low end and remembers the high one. */
    ["Bake 45 to 50 minutes.", [["45 to 50 minutes", 2700, 3000]]],
    ["Cook 10-12 min, flipping once.", [["10-12 min", 600, 720]]],
    ["Bake 55–60 minutes", [["55–60 minutes", 3300, 3600]]],
    ["Braise 1 1/2 to 2 hours.", [["1 1/2 to 2 hours", 5400, 7200]]],
    ["Chill 30 minutes to 1 hour.", [["30 minutes to 1 hour", 1800, 3600]]],
    ["Bake 1 hour 15 minutes.", [["1 hour 15 minutes", 4500]]],
    ["Bake 1 hour and 15 minutes.", [["1 hour and 15 minutes", 4500]]],
    ["Whisk for 30 seconds.", [["30 seconds", 30]]],
    /* A hyphen before a fraction makes a mixed number, not a range (review). */
    ["Bake 1-1/2 hours.", [["1-1/2 hours", 5400]]],
    ["Bake 1-½ hours.", [["1-½ hours", 5400]]],
    ["Simmer 2-1/2 to 3 hours.", [["2-1/2 to 3 hours", 9000, 10800]]],
    [
      "Braise 1 hour to 1 hour 30 minutes.",
      [["1 hour to 1 hour 30 minutes", 3600, 5400]],
    ],
    ["Let it rest a 10-minute stretch.", [["10-minute", 600]]],
    ["Proof for an hour.", [["an hour", 3600]]],
    ["Wait half an hour.", [["half an hour", 1800]]],
    ["Rise an hour and a half.", [["an hour and a half", 5400]]],
    ["Bake 5 mins", [["5 mins", 300]]],
    ["Cook 2 hrs", [["2 hrs", 7200]]],
    [
      "Cook for 4 minutes until soft. Add the sausage and cook for about 4 minutes.",
      [
        ["4 minutes", 240],
        ["4 minutes", 240],
      ],
    ],
    [
      "Bake about 55-60 minutes. After 25 minutes, cover the edges.",
      [
        ["55-60 minutes", 3300, 3600],
        ["25 minutes", 1500],
      ],
    ],
  ])("%s", (text, expected) => {
    expect(times(text)).toEqual(expected);
  });

  it.each([
    "Set aside to cool overnight.",
    "Preheat the oven to 350 degrees.",
    "Add 2 cups flour.",
    "Refrigerate 2 days.",
    "Marinate up to 48 hours.",
    "Check for doneness at minute 50.",
    "Add a second egg.",
    "Cut into 1-inch cubes.",
    "Bake at 375°F (191°C).",
    "",
  ])("%s → no timer", (text) => {
    expect(findStepTimes(text)).toEqual([]);
  });

  it("gives positions that slice back to the words", () => {
    const text = "Bake for 25 minutes, then 10-12 min more.";
    for (const time of findStepTimes(text)) {
      expect(text.slice(time.start, time.end)).toBe(time.text);
    }
  });
});

describe("durationWords and formatCountdown", () => {
  it.each([
    [1500, "25 minutes"],
    [5400, "1 hour 30 minutes"],
    [3600, "1 hour"],
    [60, "1 minute"],
    [30, "30 seconds"],
  ])("%d s → %s", (seconds, words) => {
    expect(durationWords(seconds)).toBe(words);
  });

  it.each([
    [1_500_000, "25:00"],
    [1_499_001, "25:00"],
    [61_000, "1:01"],
    [5_400_000, "1:30:00"],
    [400, "0:01"],
    [0, "0:00"],
    [-5000, "0:00"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe("stepPlainText (a step checkbox's name)", () => {
  it("keeps the words and numbers, drops the markup", () => {
    expect(
      stepPlainText(
        'Add <Multiplyable baseNumber="2" /> cups of **flour** and the [Pie Crust](/recipe/pie-crust), then bake `25 minutes`.',
      ),
    ).toBe("Add 2 cups of flour and the Pie Crust, then bake 25 minutes.");
    expect(stepPlainText(undefined)).toBe("");
  });
});
