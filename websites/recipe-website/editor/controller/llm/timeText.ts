/**
 * A time as a recipe writes it, in minutes (36a; moved out of
 * `extractRecipe.ts` in 38c so the reading's tidy rules, `tidyReading.ts`,
 * can use it without importing the extractor back).
 */
import { normalizeIngredientText } from "recipe-website-common/util/parseIngredients";

const MINUTES_PER: Record<string, number> = {
  d: 1440,
  h: 60,
  m: 1,
  s: 1 / 60,
};

/** A number as a time writes it: `1 1/2`, `1/2`, `1.5`, `2`. */
const NUMBER = "(\\d+ \\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)";

/** A number as written: `2`, `1.5`, `1/2`, `1 1/2` (fractions already ascii). */
function amount(text: string): number {
  const [whole, fraction] = text.includes("/")
    ? text.includes(" ")
      ? text.split(" ")
      : ["0", text]
    : [text, undefined];
  const value = Number(whole);
  if (!fraction) return value;
  const [top, bottom] = fraction.split("/").map(Number);
  return value + top / bottom;
}

/**
 * A time as a recipe writes it, in whole minutes: "25 minutes", "1 hour 15
 * mins", "3 hours, 45 minutes", "1 1/2 hours", "1h30m", "an hour", "half an
 * hour", "an hour and a half", "1 hour 30", "90 seconds", "1 day"; a range
 * ("17–18 minutes", "1 1/2 to 2 hours") reads as its upper end; a bare
 * number is minutes. `undefined` for nothing positive under a week — "0
 * minutes", "overnight", "varies".
 */
export function parseTimeText(value: unknown): number | undefined {
  let total: number | undefined;
  if (typeof value === "number") {
    total = value;
  } else if (typeof value === "string") {
    const text = normalizeIngredientText(value)
      .toLowerCase()
      .replace(/\bhalf\s+(an?\s+)?(hour|hr)\b/g, "30 minutes")
      .replace(/\b(hours?|hrs?)\s+and\s+a\s+half\b/g, "$1 30 minutes")
      .replace(
        /\b(an?|one)\s+(?=(day|hour|hr|minute|min|second|sec)s?\b)/g,
        "1 ",
      )
      /* A range reads as its upper end: drop "1 1/2 to " from "1 1/2 to 2 hours". */
      .replace(
        new RegExp(
          `(?<![\\d/.])${NUMBER}\\s*(?:-|–|—|to)\\s*(?=\\d+(?:[./]\\d+)?\\s*[a-z])`,
          "g",
        ),
        "",
      )
      /* "1 hour 30": the number after hours is minutes. */
      .replace(/\b(h|hrs?|hours?)\s*,?\s*(\d+)\s*$/, "$1 $2 minutes");
    const units = [
      ...text.matchAll(
        new RegExp(
          `${NUMBER}\\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?|secs?|seconds?)(?![a-z])`,
          "g",
        ),
      ),
    ];
    if (units.length > 0) {
      total = units.reduce(
        (sum, [, number, unit]) => sum + amount(number) * MINUTES_PER[unit[0]],
        0,
      );
    } else if (/^\d+(?:\.\d+)?$/.test(text.trim())) {
      total = Number(text.trim());
    }
  }
  if (total === undefined || !Number.isFinite(total)) return undefined;
  const rounded = Math.round(total);
  return rounded > 0 && rounded < 7 * 24 * 60 ? rounded : undefined;
}
