// @vitest-environment node
import Fraction from "fraction.js";
import { describe, expect, it } from "vitest";

import {
  drinkCount,
  drinkCountLabel,
  drinkYieldBase,
  isDrinkRecipe,
  multiplierForDrinks,
} from "recipe-website-common/util/drinkCount";

/* 42c2: the scaler counts drinks on a drink. */
describe("drink count", () => {
  it("knows a drink by its spec or its tag", () => {
    expect(isDrinkRecipe({ drink: { method: "shaken" } })).toBe(true);
    expect(isDrinkRecipe({ tags: ["Drink", "vodka"] })).toBe(true);
    expect(isDrinkRecipe({ tags: ["dessert"] })).toBe(false);
    expect(isDrinkRecipe({})).toBe(false);
  });

  it.each<[string | undefined, number | undefined]>([
    [undefined, 1],
    ["", 1],
    ["1 drink", 1],
    ["2 servings", 2],
    ["4 cocktails", 4],
    ['<Multiplyable baseNumber="2" /> drinks', 2],
    ["Serves 4", 4],
    ["makes 6 drinks", 6],
    ["2", 2],
    ["1 pitcher", undefined],
    ["about 6 cups", undefined],
    ["2 to 4 servings", undefined],
    ["0 drinks", undefined],
  ])("yield %s → %s drinks at 1×", (recipeYield, base) => {
    expect(drinkYieldBase(recipeYield)).toBe(base);
  });

  it.each<[number, number | Fraction, string]>([
    [1, 1, "1 drink"],
    [1, 2, "2 drinks"],
    [1, 4, "4 drinks"],
    [2, 1, "2 drinks"],
    [2, new Fraction(1, 2), "1 drink"],
    [1, new Fraction(1, 2), "1/2 drink"],
    [1, new Fraction(3, 2), "1 1/2 drinks"],
  ])("base %d × %s → %s", (base, multiplier, label) => {
    expect(drinkCountLabel(drinkCount(base, new Fraction(multiplier)))).toBe(
      label,
    );
  });

  it("reads 1× as the yield's own count", () => {
    expect(drinkCountLabel(drinkCount(2))).toBe("2 drinks");
  });

  it("finds the multiplier for a count", () => {
    expect(multiplierForDrinks(1, 2)).toBe("2");
    expect(multiplierForDrinks(2, 1)).toBe("1/2");
    expect(multiplierForDrinks(2, 4)).toBe("2");
    expect(multiplierForDrinks(3, 4)).toBe("1 1/3");
  });
});
