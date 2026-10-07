/**
 * Ounces, millilitres and parts — the bar view's three ways to read a spec
 * (27c).
 *
 * Stored data never changes. A stored line reads `<Multiplyable
 * baseNumber="1 1/2" /> oz white rum`; before it is rendered, `markOunces`
 * moves the unit *into* the tag — `<Multiplyable baseNumber="1 1/2" unit="oz"
 * /> white rum` — so `Multiplyable` can render the amount and its unit
 * together in whichever mode the reader picked. Only an amount directly
 * followed by `oz`/`ounce(s)` is marked: dashes, teaspoons, an egg white, a
 * `(1:1)` ratio all render exactly as before in every mode.
 *
 * Pure, so the arithmetic is unit-tested rather than read off a screen.
 */
import Fraction from "fraction.js";

export type UnitMode = "oz" | "ml" | "parts";

export const UNIT_MODES: readonly UnitMode[] = ["oz", "ml", "parts"];

/** Millilitres per US fluid ounce, as bartenders round it. */
export const ML_PER_OZ = 30;

/**
 * `<Multiplyable baseNumber="x" />` followed by `oz`, `ounce` or `ounces`.
 *
 * `fl oz` is not a separate case: the `fl` would sit between the tag and the
 * `oz`, and no drink in the corpus writes it that way.
 */
const OZ_LINE_RE =
  /<Multiplyable\s+baseNumber="([^"]*)"\s*\/>\s*(?:oz|ounces?)\b\.?/gi;

/** A line with its ounce amounts marked for `Multiplyable`'s unit modes. */
export function markOunces(ingredient: string): string {
  return ingredient.replace(
    OZ_LINE_RE,
    (_match, base: string) => `<Multiplyable baseNumber="${base}" unit="oz" />`,
  );
}

function parseAmount(base: string): Fraction | undefined {
  try {
    return new Fraction(base.trim());
  } catch {
    return undefined;
  }
}

/**
 * Every ounce amount in a list of stored lines, in order. A heading line has
 * none; a line with two (`1 oz to 1 1/2 oz`) contributes both.
 */
export function ounceAmounts(lines: readonly string[]): Fraction[] {
  const amounts: Fraction[] = [];
  for (const line of lines) {
    for (const match of line.matchAll(OZ_LINE_RE)) {
      const amount = parseAmount(match[1]);
      if (amount && amount.compare(0) > 0) amounts.push(amount);
    }
  }
  return amounts;
}

/**
 * The amount every line is measured against in parts mode: the smallest
 * ounce amount, so the lowest line reads "1 part". `undefined` with no ounce
 * lines at all.
 */
export function ratioBase(lines: readonly string[]): Fraction | undefined {
  let smallest: Fraction | undefined;
  for (const amount of ounceAmounts(lines)) {
    if (!smallest || amount.compare(smallest) < 0) smallest = amount;
  }
  return smallest;
}

/** The total volume of the ounce lines, unscaled. */
export function sumOunces(lines: readonly string[]): Fraction {
  return ounceAmounts(lines).reduce(
    (total, amount) => total.add(amount),
    new Fraction(0),
  );
}

/** `x oz` in millilitres, to the nearest 5 — and never below 5. */
export function ouncesToMl(ounces: Fraction | number): number {
  const ml = Number(new Fraction(ounces).mul(ML_PER_OZ).valueOf());
  return Math.max(5, Math.round(ml / 5) * 5);
}

/** A ratio as a simple fraction: `1`, `1 1/2`, `2 2/3`. */
export function formatRatio(value: Fraction): string {
  return value.simplify(0.001).toFraction(true);
}

/** `amount ÷ base` as "1 part", "1 1/2 parts", "2 2/3 parts". */
export function formatParts(amount: Fraction, base: Fraction): string {
  const ratio = amount.div(base);
  const text = formatRatio(ratio);
  return `${text} ${ratio.equals(1) ? "part" : "parts"}`;
}

/** An ounce amount as the oz mode writes it: `1 1/2`, scaled. */
export function formatOunces(amount: Fraction): string {
  return amount.simplify(0.0125).toFraction(true);
}

/**
 * The batching note's water: about 20% of the scaled volume when stirred,
 * 25% when shaken, to the nearest quarter ounce.
 */
export function dilutionOunces(
  scaledOunces: Fraction | number,
  method: "stir" | "shake",
): number {
  const share = method === "shake" ? 0.25 : 0.2;
  const water = Number(new Fraction(scaledOunces).valueOf()) * share;
  return Math.round(water * 4) / 4;
}
