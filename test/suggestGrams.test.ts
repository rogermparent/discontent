// Epic 51, 51f: grams for a recipe's lines — the paste aligner on Roger's
// exact paste against Pouding Chômeur (Vivaldi)'s lines from before he added
// the grams by hand (the mock-up's script), the bank's arithmetic against King
// Arthur's chart, the house form, and the model answer's check. Pure.

import { describe, expect, it } from "vitest";

import { createIngredient } from "recipe-website-common/util/parseIngredients";
import { plainLine } from "recipe-website-common/components/Form/Ingredients/ingredientRows";
import {
  BUILT_IN_GRAMS,
  HOUSE_GRAMS_PER_CUP,
  KING_ARTHUR_CHART,
  chartGramsPerCup,
  chartVolumeCups,
} from "recipe-website-common/util/gramsChart";
import {
  densityOf,
  gramsEntriesOf,
  gramsKeyOf,
  gramsPerCupTable,
  gramsTableOf,
} from "recipe-website-common/util/gramsBank";
import {
  alignPaste,
  bankGramsOf,
  checkModelGrams,
  hasStoredGrams,
  pastedGrams,
  readLine,
  roundGrams,
  suggestGrams,
  viewGrams,
  withGrams,
} from "recipe-website-common/util/suggestGrams";
import { GRAMS_PER_CUP } from "recipe-website-common/util/shoppingMerges";

/** Stored as the form stores a typed line. */
const stored = (text: string) => createIngredient(text)!.ingredient;

/* Pouding Chômeur (Vivaldi), before e2396919 (the mock-up's LINES). */
const VIVALDI = [
  "2 cups brown sugar",
  "1 1/2 cups water",
  "1/2 cup maple syrup",
  "1 tbsp flour",
  "1 1/2 cups all-purpose flour",
  "2 1/2 tsp baking powder",
  "a pinch salt",
  "1/2 cup butter",
  "1 cup granulated sugar",
  "2 eggs",
  "3/4 cup milk",
  "1 tsp vanilla extract",
  "1 tbsp butter",
].map((text) => ({ ingredient: stored(text) }));

/* Roger's paste from ReelsMeals, exactly (the mock-up's PASTE). */
const PASTE =
  "400 gbrown sugar\n355 gwater\n160 gmaple syrup\n1 tbspflour\n190 gall-purpose flour\n2½ tspbaking powder\na pinchsalt\n115 gbutter\n200 ggranulated sugar\n2egg\n180 gmilk\n1 tspvanilla extract\n1 tbspbutter";

describe("the paste aligner (Roger's paste on Vivaldi's lines)", () => {
  it("matches every pasted line to its own line, the two butters in order", () => {
    const { matches, unmatched } = alignPaste(VIVALDI, PASTE);
    expect(unmatched).toEqual([]);
    expect(matches.map((match) => match.line)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("reads the grams glued to the name, and none where there are none", () => {
    const { matches } = alignPaste(VIVALDI, PASTE);
    expect(
      Object.fromEntries(matches.map((match) => [match.line, match.grams])),
    ).toEqual({
      0: 400,
      1: 355,
      2: 160,
      3: undefined,
      4: 190,
      5: undefined,
      6: undefined,
      7: 115,
      8: 200,
      9: undefined,
      10: 180,
      11: undefined,
      12: undefined,
    });
  });

  it("gives 7 lines grams from the paste; the bank fills 4; the eggs are left", () => {
    const plan = suggestGrams(VIVALDI, { paste: PASTE, table: gramsTableOf() });
    const by = Object.fromEntries(
      plan.suggestions.map((s) => [s.line, `${s.source} ${s.grams}`]),
    );
    expect(by).toEqual({
      0: "paste 400",
      1: "paste 355",
      2: "paste 160",
      /* 1 tbsp flour: 120 g a cup ÷ 16 = 7.5, whole grams from 5 g. */
      3: "bank 8",
      4: "paste 190",
      /* 2½ tsp baking powder: King Arthur's 4 g a teaspoon. */
      5: "bank 10",
      7: "paste 115",
      8: "paste 200",
      10: "paste 180",
      /* 1 tsp vanilla: 14 g a tablespoon ÷ 3, to the half gram. */
      11: "bank 4.5",
      /* 1 tbsp butter: 227 g a cup ÷ 16. */
      12: "bank 14",
    });
    /* The eggs are counted: a paste or the model only; the pinch, never. */
    expect(plan.left).toEqual([9]);
    expect(plan.unmatched).toEqual([]);
  });

  it("leaves a line the paste can't place as unmatched", () => {
    const { unmatched } = alignPaste(
      VIVALDI,
      "50 gcocoa powder\n400 gbrown sugar",
    );
    expect(unmatched).toEqual(["50 gcocoa powder"]);
  });

  it("reads pasted grams in their usual shapes", () => {
    expect(pastedGrams("400 gbrown sugar")).toBe(400);
    expect(pastedGrams("400g brown sugar")).toBe(400);
    expect(pastedGrams("1.2 kg flour")).toBe(1200);
    expect(pastedGrams("brown sugar (400 g)")).toBe(400);
    expect(pastedGrams("200 grams sugar")).toBe(200);
    expect(pastedGrams("1 tbspflour")).toBeUndefined();
    expect(pastedGrams("2egg")).toBeUndefined();
    expect(pastedGrams("2½ tspbaking powder")).toBeUndefined();
  });

  /* Review finding 5: a comma before exactly three digits is thousands. */
  it("reads a thousands comma as thousands, and a decimal comma as a decimal", () => {
    expect(pastedGrams("1,000 g flour")).toBe(1000);
    expect(pastedGrams("1,000 gall-purpose flour")).toBe(1000);
    expect(pastedGrams("flour (1,250 g)")).toBe(1250);
    expect(pastedGrams("2,500.5 g water")).toBe(2500.5);
    expect(pastedGrams("1,5 kg flour")).toBe(1500);
    expect(pastedGrams("0,5 kg sugar")).toBe(500);
    const { matches } = alignPaste(
      [{ ingredient: stored("8 cups all-purpose flour") }],
      "1,000 g all-purpose flour",
    );
    expect(matches).toEqual([
      { line: 0, pasted: "1,000 g all-purpose flour", grams: 1000 },
    ]);
  });

  /* Review finding 6: the line's own name, then the key's last word. */
  it("matches by the line's own name, then the key's last word, when no key fits", () => {
    const lines = [
      { ingredient: stored("1 cup sugar") },
      { ingredient: stored("1 tbsp all-purpose flour") },
      { ingredient: stored("1 cup brown sugar") },
    ];
    /* `1 cup sugar` keys as granulated sugar; `all-purpose flour` as all purpose flour. */
    const { matches, unmatched } = alignPaste(
      lines,
      "200 g sugar\n1 tbspflour\n213 gbrown sugar",
    );
    expect(unmatched).toEqual([]);
    expect(
      matches.map((match) => [match.pasted, match.line, match.grams]),
    ).toEqual([
      ["200 g sugar", 0, 200],
      ["1 tbspflour", 1, undefined],
      ["213 gbrown sugar", 2, 213],
    ]);
    /* A key that fits still wins over a fallback: brown sugar first. */
    expect(
      alignPaste(lines, "213 gbrown sugar\n200 g sugar").matches.map(
        (match) => match.line,
      ),
    ).toEqual([2, 0]);
  });
});

describe("the house form (answer 1)", () => {
  it("puts the grams after the unit, in a Multiplyable, no space before g", () => {
    expect(withGrams(stored("2 cups brown sugar"), 400)).toBe(
      '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="400" />g) brown sugar',
    );
    /* The same string a typed "2 cups (400g) brown sugar" stores. */
    expect(withGrams(stored("2 cups brown sugar"), 400)).toBe(
      stored("2 cups (400g) brown sugar"),
    );
  });

  it("puts a counted line's grams after its name", () => {
    expect(withGrams(stored("2 eggs"), 100)).toBe(
      '<Multiplyable baseNumber="2" /> eggs (<Multiplyable baseNumber="100" />g)',
    );
    expect(plainLine(withGrams(stored("2 large eggs, beaten"), 100)!)).toBe(
      "2 large eggs (100g), beaten",
    );
  });

  it("writes half grams under 5 g", () => {
    expect(plainLine(withGrams(stored("1 tsp vanilla extract"), 4.67)!)).toBe(
      "1 tsp (4.5g) vanilla extract",
    );
    expect(roundGrams(4.67)).toBe(4.5);
    expect(roundGrams(7.5)).toBe(8);
    expect(roundGrams(425.6)).toBe(426);
  });

  it("keeps a line's remark after the grams", () => {
    expect(
      plainLine(
        withGrams(stored("1 cup (2 sticks) unsalted butter, softened"), 227)!,
      ),
    ).toBe("1 cup (227g) (2 sticks) unsalted butter, softened");
  });

  it("leaves a line with no amount markup alone", () => {
    expect(withGrams("salt to taste", 5)).toBeUndefined();
  });

  it("sees grams a line gives already", () => {
    expect(hasStoredGrams(stored("2 cups (400g) brown sugar"))).toBe(true);
    expect(hasStoredGrams(stored("2 cups (400 g) brown sugar"))).toBe(true);
    expect(hasStoredGrams(stored("1.2 kg flour"))).toBe(true);
    expect(hasStoredGrams(stored("2 garlic cloves"))).toBe(false);
    expect(hasStoredGrams(stored("2 cups brown sugar"))).toBe(false);
  });
});

describe("what gets grams (answer 4)", () => {
  it("never a pinch, a dash, to taste or a splash", () => {
    for (const text of [
      "a pinch salt",
      "1 pinch salt",
      "salt to taste",
      "a splash of milk",
      "1 dash bitters",
    ]) {
      expect(readLine(stored(text)).kind, text).toBe("as-needed");
      expect(bankGramsOf(stored(text), gramsTableOf()), text).toBeUndefined();
    }
  });

  it("a counted line only from a paste or the model", () => {
    expect(readLine(stored("2 eggs")).kind).toBe("counted");
    expect(bankGramsOf(stored("2 eggs"), gramsTableOf())).toBeUndefined();
  });
});

describe("the bank (answer 3: King Arthur's chart, the house values kept)", () => {
  it("reads every chart volume", () => {
    for (const row of KING_ARTHUR_CHART) {
      expect(chartVolumeCups(row.volume), row.row).toBeGreaterThan(0);
    }
    expect(chartVolumeCups("2 1/4 teaspoons")).toBeCloseTo(2.25 / 48);
    expect(chartVolumeCups("8 tablespoons (1/2 cup)")).toBe(0.5);
  });

  it("gives back each chart row's own grams for its own volume, within rounding", () => {
    for (const row of KING_ARTHUR_CHART) {
      for (const key of row.keys) {
        if (Object.hasOwn(HOUSE_GRAMS_PER_CUP, key)) continue;
        const line = stored(`${row.volume.replace(/ \(.*\)$/, "")} ${key}`);
        const bank = bankGramsOf(line, gramsTableOf());
        expect(bank?.grams, `${row.row} as "${plainLine(line)}"`).toBe(
          roundGrams(row.grams),
        );
      }
    }
  });

  it("is reached by the keys a typed line keys as", () => {
    const unreachable = KING_ARTHUR_CHART.flatMap((row) =>
      row.keys.filter((key) => gramsKeyOf(stored(`1 cup ${key}`)) !== key),
    );
    expect(unreachable).toEqual([]);
  });

  it("keeps epic 49's values where they differ (water 237, sugar 200)", () => {
    expect(BUILT_IN_GRAMS.water.gramsPerCup).toBe(237);
    expect(BUILT_IN_GRAMS["granulated sugar"].gramsPerCup).toBe(200);
    expect(BUILT_IN_GRAMS["powdered sugar"].gramsPerCup).toBe(120);
    expect(GRAMS_PER_CUP.water).toBe(237);
    /* Every one of 49a's and 50a's names still has a density. */
    for (const key of [
      "all purpose flour",
      "bread flour",
      "wheat flour",
      "flour",
      "brown sugar",
      "light brown sugar",
      "dark brown sugar",
      "butter",
      "unsalted butter",
      "salted butter",
      "rice",
      "rolled oats",
      "semisweet chocolate chip",
      "heavy cream",
      "whipping cream",
      "light cream",
      "half and half",
      "milk",
      "whole milk",
      "buttermilk",
      "sour cream",
      "cream cheese",
      "yogurt",
      "greek yogurt",
    ]) {
      expect(GRAMS_PER_CUP[key], key).toBeGreaterThan(0);
    }
  });

  it("works out a cup's grams from a teaspoon row", () => {
    const powder = KING_ARTHUR_CHART.find(
      (row) => row.row === "Baking powder",
    )!;
    expect(chartGramsPerCup(powder)).toBe(192);
  });

  it("keeps a preparation the shopping key drops (Df2)", () => {
    expect(gramsKeyOf(stored("1 cup sliced almonds"))).toBe("sliced almond");
    expect(gramsKeyOf(stored("1 cup almonds"))).toBe("almond");
    expect(gramsKeyOf(stored("1/2 cup dried cranberries"))).toBe(
      "dried cranberry",
    );
    expect(gramsKeyOf(stored("1 cup packed light brown sugar"))).toBe(
      "light brown sugar",
    );
    /* Diced is chopped; shredded is grated. */
    expect(gramsKeyOf(stored("1 cup diced onion"))).toBe("chopped onion");
    expect(gramsKeyOf(stored("2 cups shredded cheddar cheese"))).toBe(
      "grated cheddar cheese",
    );
    const table = gramsTableOf();
    expect(bankGramsOf(stored("1 cup sliced almonds"), table)?.grams).toBe(86);
    expect(bankGramsOf(stored("1 cup almonds"), table)?.grams).toBe(142);
    expect(bankGramsOf(stored("1/2 cup dried cranberries"), table)?.grams).toBe(
      57,
    );
  });

  it("lays a person's entries over the seed, and Reset is the entry gone", () => {
    const entries = gramsEntriesOf({
      entries: [
        { key: "brown sugar", name: "brown sugar", gramsPerCup: 200 },
        { key: "cardamom", name: "ground cardamom", gramsPerCup: 96 },
        { key: "bad", name: "bad", gramsPerCup: -1 },
      ],
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "brown sugar",
      "cardamom",
    ]);
    const table = gramsTableOf(entries);
    expect(table.get("brown sugar")).toMatchObject({
      gramsPerCup: 200,
      origin: "changed",
      builtIn: 213,
    });
    expect(table.get("cardamom")?.origin).toBe("yours");
    expect(gramsTableOf().get("brown sugar")?.origin).toBe("built-in");
    expect(gramsPerCupTable(table)["brown sugar"]).toBe(200);
    expect(densityOf(table, stored("2 cups brown sugar"))?.gramsPerCup).toBe(
      200,
    );
  });

  it("says its arithmetic", () => {
    expect(bankGramsOf(stored("2 cups brown sugar"), gramsTableOf())).toEqual({
      grams: 426,
      gramsPerCup: 213,
      why: "213 g a cup × 2 cups (built in)",
      key: "brown sugar",
    });
  });
});

describe("the model's answer, checked (answer 5)", () => {
  it("takes a sane number, rounded", () => {
    expect(checkModelGrams(stored("2 eggs"), 100)).toEqual({
      ok: true,
      grams: 100,
    });
    expect(checkModelGrams(stored("1 tsp vanilla extract"), 4.2)).toEqual({
      ok: true,
      grams: 4,
    });
  });

  it("refuses what is not a number, not positive, or not sane for the line", () => {
    expect(checkModelGrams(stored("2 eggs"), "100")).toMatchObject({
      ok: false,
    });
    expect(checkModelGrams(stored("2 eggs"), null)).toMatchObject({
      ok: false,
    });
    expect(checkModelGrams(stored("2 eggs"), 0)).toMatchObject({ ok: false });
    expect(checkModelGrams(stored("2 eggs"), -5)).toMatchObject({ ok: false });
    expect(checkModelGrams(stored("2 eggs"), Number.NaN)).toMatchObject({
      ok: false,
    });
    /* ½ cup maple syrup is not 4 kg. */
    expect(checkModelGrams(stored("1/2 cup maple syrup"), 4000)).toMatchObject({
      ok: false,
    });
    expect(checkModelGrams(stored("2 eggs"), 50_000)).toMatchObject({
      ok: false,
    });
    expect(checkModelGrams(stored("a pinch salt"), 1)).toMatchObject({
      ok: false,
    });
  });

  /* Review finding 7: the 10 kg cap holds when no cup can be had. */
  it("caps a measure with no cup to compare at 10 kg too", () => {
    expect(
      checkModelGrams("some flour", 50_000, { kind: "volume" }),
    ).toMatchObject({ ok: false, problem: "more than 10 kg for this line" });
    expect(checkModelGrams("some flour", 500, { kind: "volume" })).toEqual({
      ok: true,
      grams: 500,
    });
  });
});

describe("nothing that rounds to 0 g (review finding 7)", () => {
  it("drops a bank suggestion that rounds to 0 g", () => {
    const table = gramsTableOf([
      { key: "saffron", name: "saffron", gramsPerCup: 3 },
    ]);
    /* ⅛ tsp at 3 g a cup is 0.008 g. */
    expect(bankGramsOf(stored("1/8 tsp saffron"), table)).toBeUndefined();
    const plan = suggestGrams([{ ingredient: stored("1/8 tsp saffron") }], {
      table,
    });
    expect(plan.suggestions).toEqual([]);
  });

  it("drops a pasted 0.2 g", () => {
    const plan = suggestGrams([{ ingredient: stored("1/8 tsp saffron") }], {
      paste: "0.2 g saffron",
      table: gramsTableOf(),
    });
    expect(plan.suggestions).toEqual([]);
  });
});

describe("Show grams on the recipe page (answer 6)", () => {
  it("works grams out for measured lines without stored grams only", () => {
    const lines = [
      { ingredient: stored("2 cups brown sugar") },
      { ingredient: stored("2 cups (400g) brown sugar") },
      { ingredient: stored("2 eggs") },
      { ingredient: "Topping", type: "heading" },
      { ingredient: stored("a pinch salt") },
    ];
    expect(viewGrams(lines, gramsTableOf())).toEqual([
      426,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
