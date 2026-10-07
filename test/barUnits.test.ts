// The bar view's unit arithmetic (27c): oz, ml and parts over stored lines.
//
// Only the pure half is here; the toggle itself is Playwright's (`recipe`).
// The lines are written the way the content repo stores them — `<Multiplyable
// baseNumber="x" /> oz …` — because `markOunces` and `ratioBase` read that
// shape and nothing else.

import Fraction from "fraction.js";
import { describe, expect, it } from "vitest";
import {
  dilutionOunces,
  formatParts,
  markOunces,
  ounceAmounts,
  ouncesToMl,
  ratioBase,
  sumOunces,
} from "recipe-website-common/util/barUnits";

const oz = (amount: string, rest: string) =>
  `<Multiplyable baseNumber="${amount}" /> oz ${rest}`;

/** Every oz line of `lines` in parts, the way parts mode renders them. */
function parts(lines: string[]): string[] {
  const base = ratioBase(lines)!;
  return ounceAmounts(lines).map((amount) => formatParts(amount, base));
}

describe("markOunces", () => {
  it("moves oz, ounce and ounces into the tag, and nothing else", () => {
    expect(markOunces(oz("1 1/2", "white rum"))).toBe(
      '<Multiplyable baseNumber="1 1/2" unit="oz" /> white rum',
    );
    expect(markOunces('<Multiplyable baseNumber="2" /> ounces gin')).toBe(
      '<Multiplyable baseNumber="2" unit="oz" /> gin',
    );
    expect(markOunces('<Multiplyable baseNumber="1" /> ounce. gin')).toBe(
      '<Multiplyable baseNumber="1" unit="oz" /> gin',
    );
  });

  it("leaves dashes, teaspoons, ratios and bare text alone", () => {
    for (const line of [
      '<Multiplyable baseNumber="2" /> dashes Angostura bitters',
      '<Multiplyable baseNumber="1" /> tsp sugar',
      "1 egg white",
      'simple syrup (<Multiplyable baseNumber="1" />:<Multiplyable baseNumber="1" />)',
      "Soda water, to top",
    ]) {
      expect(markOunces(line)).toBe(line);
    }
  });

  it("marks only the oz amount on a line that also carries a ratio", () => {
    expect(
      markOunces(
        '<Multiplyable baseNumber="1/2" /> oz simple syrup (<Multiplyable baseNumber="1" />:<Multiplyable baseNumber="1" />)',
      ),
    ).toBe(
      '<Multiplyable baseNumber="1/2" unit="oz" /> simple syrup (<Multiplyable baseNumber="1" />:<Multiplyable baseNumber="1" />)',
    );
  });
});

describe("ratioBase and parts", () => {
  it("makes the smallest line 1 part: 2 / 3/4 / 3/4 → 2 2/3 / 1 / 1", () => {
    const lines = [
      oz("2", "gin"),
      oz("3/4", "lime juice"),
      oz("3/4", "simple syrup"),
    ];
    expect(ratioBase(lines)?.toFraction()).toBe("3/4");
    expect(parts(lines)).toEqual(["2 2/3 parts", "1 part", "1 part"]);
  });

  it("reads equal parts as 1 / 1 / 1 (the Last Word)", () => {
    const lines = ["gin", "green Chartreuse", "maraschino", "lime juice"].map(
      (name) => oz("3/4", name),
    );
    expect(parts(lines)).toEqual(["1 part", "1 part", "1 part", "1 part"]);
  });

  it("reads a Daiquiri, 2 / 1 / 3/4, as 2 2/3 / 1 1/3 / 1", () => {
    const lines = [
      oz("2", "white rum"),
      oz("1", "lime juice"),
      oz("3/4", "simple syrup"),
    ];
    expect(parts(lines)).toEqual(["2 2/3 parts", "1 1/3 parts", "1 part"]);
  });

  it("ignores lines without an oz amount, and answers undefined with none", () => {
    const lines = [
      oz("1 1/2", "rye"),
      '<Multiplyable baseNumber="2" /> dashes bitters',
      "Orange twist",
    ];
    expect(ounceAmounts(lines).map((f) => f.toFraction(true))).toEqual([
      "1 1/2",
    ]);
    expect(ratioBase(["Orange twist"])).toBeUndefined();
  });
});

describe("ml", () => {
  it("is 30 ml to the ounce, to the nearest 5", () => {
    expect(ouncesToMl(new Fraction("1 1/2"))).toBe(45);
    expect(ouncesToMl(new Fraction("1 1/2").mul(2))).toBe(90);
    expect(ouncesToMl(new Fraction("3/4"))).toBe(25); // 22.5 → 25
    expect(ouncesToMl(new Fraction("1/4"))).toBe(10); // 7.5 → 10
  });

  it("never rounds a real amount down to nothing", () => {
    expect(ouncesToMl(new Fraction("1/16"))).toBe(5);
  });
});

describe("sumOunces and the batching note", () => {
  it("sums the oz lines and nothing else", () => {
    const lines = [
      oz("2", "white rum"),
      oz("1", "lime juice"),
      oz("3/4", "simple syrup"),
      '<Multiplyable baseNumber="2" /> dashes bitters',
    ];
    expect(sumOunces(lines).toFraction(true)).toBe("3 3/4");
    expect(sumOunces(["Orange twist"]).valueOf()).toBe(0);
  });

  it("waters a 4× daiquiri ~25% shaken and ~20% stirred, to the quarter ounce", () => {
    const total = sumOunces([
      oz("2", "white rum"),
      oz("1", "lime juice"),
      oz("3/4", "simple syrup"),
    ]).mul(4); // 15 oz
    expect(dilutionOunces(total, "shake")).toBe(3.75);
    expect(dilutionOunces(total, "stir")).toBe(3);
  });
});
