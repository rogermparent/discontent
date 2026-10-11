import Fraction from "fraction.js";

/**
 * A recipe multiplier as text: a meal-plan item's `scale` and a recipe page's
 * `?scale=` (epic 32, D4).
 *
 * One parser for both, so a plan can never store a value its own link would
 * then ignore. Anything `fraction.js` reads is accepted — `"2"`, `"1/2"`,
 * `"1.5"`, `"1 1/2"` — provided it is **positive**: zero would empty every
 * quantity and a negative one makes no sense to cook. Surrounding whitespace
 * is trimmed first, since `fraction.js` itself refuses `" 2 "`.
 */
export function parseScale(value: string | null | undefined): Fraction | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const fraction = new Fraction(trimmed);
    return fraction.s > 0 && fraction.n > 0 ? fraction : null;
  } catch {
    return null;
  }
}

export function isValidScale(value: string): boolean {
  return parseScale(value) !== null;
}

/** What a validator says about a value `parseScale` refuses. */
export const SCALE_MESSAGE =
  "Scale must be a positive number, like 2, 1/2 or 1.5";

/** The vulgar fractions a badge can draw as one glyph. */
const GLYPHS: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/8": "⅛",
};

/**
 * A short label for a multiplier: `2×`, `½×`, `1½×`, `1.2×`.
 *
 * A whole part plus a glyph when the remainder has one; otherwise a decimal
 * of at most two places, which is what anyone reading a badge wants rather
 * than `6/5`. A valid scale too small for two places (`0.001`) would round to
 * `0×`, which reads as "nothing"; that one shows its fraction instead
 * (`1/1000×`), since `parseScale` accepts any positive value (32-close).
 */
export function formatScale(scale: Fraction): string {
  const whole = scale.floor();
  const rest = scale.sub(whole);
  if (rest.n === BigInt(0)) return `${whole.toString()}×`;
  const glyph = GLYPHS[rest.toFraction()];
  if (glyph) return `${whole.n === BigInt(0) ? "" : whole.toString()}${glyph}×`;
  const decimal = Number(scale.valueOf().toFixed(2));
  return decimal > 0 ? `${decimal}×` : `${scale.toFraction()}×`;
}
