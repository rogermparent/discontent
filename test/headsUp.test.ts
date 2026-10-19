import { describe, expect, it } from "vitest";
import {
  findHeadsUps,
  isHeadsUp,
  MAX_HEADS_UPS,
  sentences,
} from "recipe-website-common/util/headsUp";
import type { InstructionEntry } from "recipe-website-common/controller/types";

/* 42c1 (D3): a short list of unambiguous phrases, each sentence quoted. */

const POSITIVES = [
  "Prepare 1 day in advance!",
  "Make the dough the day before.",
  "Cover and refrigerate overnight.",
  "Set aside to cool overnight.",
  "Chill for at least 4 hours, or up to 2 days.",
  "Cover the dough and chill it for 2 hours.",
  "Chill 3-4 hours until firm.",
  "Refrigerate at least 6 hours before serving.",
  "Refrigerate for 8 hours or overnight.",
  "Marinate the chicken in the fridge for 4 to 6 hours.",
  "Make ahead: the filling keeps for 3 days.",
  "This is a great make-ahead side.",
  "The sauce can be made 2 days ahead.",
  "Brine the turkey a day ahead.",
  "Start the night before you plan to bake.",
];

const NEGATIVES = [
  "Top the overnight oats with berries.",
  "Spoon the overnight oats into jars.",
  "Let rest 5 minutes.",
  "Chill for 30 minutes.",
  "Chill the glass.",
  "Refrigerate leftovers.",
  "Marinate for 20 minutes.",
  "Bake for 1 hour.",
  "Let the dough rise for 2 hours.",
  "Serve the next day's leftovers cold.",
  "Make the dressing.",
  "Stir in the rest of the stock.",
  "Simmer for 2 hours.",
];

describe("isHeadsUp", () => {
  it.each(POSITIVES)("counts %s", (sentence) => {
    expect(isHeadsUp(sentence)).toBe(true);
  });
  it.each(NEGATIVES)("does not count %s", (sentence) => {
    expect(isHeadsUp(sentence)).toBe(false);
  });
});

describe("sentences", () => {
  it("splits after a closing bracket and unwraps a bracketed sentence", () => {
    expect(
      sentences(
        "(Prepare 1 day in advance!) Preheat oven to 375°F (191°C). Set aside to cool overnight. Do not cover.",
      ),
    ).toEqual([
      "Prepare 1 day in advance!",
      "Preheat oven to 375°F (191°C).",
      "Set aside to cool overnight.",
      "Do not cover.",
    ]);
  });

  it("undoes the markup a step carries", () => {
    expect(
      sentences('Chill for <Multiplyable baseNumber="2" /> hours.'),
    ).toEqual(["Chill for 2 hours."]);
  });
});

describe("findHeadsUps", () => {
  const stuffing: InstructionEntry[] = [
    {
      name: "Cornbread",
      instructions: [
        {
          text: "(Prepare 1 day in advance!) Preheat oven to 375°F (191°C). Bake for 22-24 minutes. Set aside to cool overnight. Do not cover.",
        },
        {
          text: "Cut the cornbread into 1-inch cubes and bake for 10 minutes.",
        },
      ],
    },
    {
      name: "Stuffing",
      instructions: [
        { text: "Whisk the broth and eggs together." },
        { text: "Cover and refrigerate overnight, then bake." },
      ],
    },
  ];

  it("quotes each sentence with the page's step number", () => {
    expect(findHeadsUps(stuffing)).toEqual([
      { sentence: "Prepare 1 day in advance!", step: 1, source: "step" },
      { sentence: "Set aside to cool overnight.", step: 1, source: "step" },
      {
        sentence: "Cover and refrigerate overnight, then bake.",
        step: 4,
        source: "step",
      },
    ]);
  });

  it("reads a cook schedule's note, after the steps", () => {
    expect(
      findHeadsUps(
        [{ text: "Mix." }],
        [{ note: "Start the night before.", events: [] }],
      ),
    ).toEqual([{ sentence: "Start the night before.", source: "schedule" }]);
  });

  it("says each sentence once and at most a few", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      text: `Chill for ${i + 2} hours.`,
    }));
    expect(findHeadsUps(many)).toHaveLength(MAX_HEADS_UPS);
    expect(
      findHeadsUps([
        { text: "Chill for 2 hours." },
        { text: "Chill for 2 hours." },
      ]),
    ).toHaveLength(1);
  });

  it("finds nothing in a recipe with no long waits", () => {
    expect(
      findHeadsUps([
        { text: "Let rest 5 minutes." },
        { name: "Overnight oats", instructions: [{ text: "Stir and serve." }] },
      ]),
    ).toEqual([]);
    expect(findHeadsUps()).toEqual([]);
  });
});
