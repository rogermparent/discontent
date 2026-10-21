/**
 * The amount grammar of an ingredient line: its numbers, quantity words,
 * units and the patterns that read them (35a).
 *
 * Moved out of `ingredientNames` unchanged, so that `ingredientAmount` reads
 * an amount with the very patterns `stripAmount` cuts it off with — a line
 * whose name loses `2 cups` is a line whose amount is `2 cups`. An edit here
 * moves both: re-run `editor/scripts/measure-ingredient-names.ts` and
 * `editor/scripts/measure-shopping.ts` before and after.
 *
 * Pure, and safe in the browser.
 */

/**
 * Units, singular. Matched case-insensitively, with an optional plural and an
 * optional full stop — and **only** after a quantity or before `of`, so the
 * one-letter ones (`c`, `t`, `g`, `l`) can't eat a real word.
 */
export const UNITS = [
  "fl oz",
  "fluid ounce",
  "oz",
  "ounce",
  "ml",
  "milliliter",
  "millilitre",
  "cl",
  "dl",
  "l",
  "liter",
  "litre",
  "cup",
  "c",
  "tbsp",
  "tbs",
  "tbl",
  "tablespoon",
  "tsp",
  "teaspoon",
  "t",
  "bar spoon",
  "barspoon",
  "dash",
  "drop",
  "splash",
  "squeeze",
  "squirt",
  "pinch",
  "part",
  "shot",
  "jigger",
  "measure",
  "can",
  "bottle",
  "sprig",
  "slice",
  "wedge",
  "wheel",
  "clove",
  "g",
  "gram",
  "gramme",
  "kg",
  "kilogram",
  "lb",
  "pound",
  "quart",
  "qt",
  "pint",
  "pt",
  "gallon",
  "gal",
  "stick",
  "piece",
  "pc",
  "handful",
  "bunch",
  "head",
  "stalk",
  "rib",
  "package",
  "pkg",
  "packet",
  "envelope",
  "jar",
  "bag",
  "box",
  "tin",
  "carton",
  "container",
  "ear",
  "scoop",
  "knob",
  "inch",
  "sheet",
  /* `1 recipe lavender syrup`, `1 batch simple syrup` (27c). */
  "recipe",
  "batch",
];

/** Longest first, so `fl oz` wins over `fl`… and `tbsp` over `t`. */
export const UNIT_PATTERN = [...UNITS]
  .sort((a, b) => b.length - a.length)
  .map((unit) => unit.replace(/ /g, "\\s*"))
  .join("|");

/** `2`, `1.5`, `.5`, `1 1/2`, `3/4`, and a range or choice of them. */
/* Fractions first: the alternation takes the first branch that fits, and a
 * bare `\d+` fits the `3` of `3/4`. `.5` (43n) is `1lb/.5kg`'s other half. */
export const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|\.\d+)`;
export const QUANTITY_WORDS = String.raw`(?:a\s+few|a\s+couple(?:\s+of)?|a\s+little|a\s+bit(?:\s+of)?|couple(?:\s+of)?|few|several|some|half(?![\s-]*(?:and|&)[\s-]*half)(?:\s+an?)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|an?)`;
/* `1 packed cup cilantro` (43n): packed is how the cup is filled; `1 med
 * carrot`, `1lrg squash`, `3 medium-sized onions` are sizes. */
export const MODIFIER = String.raw`(?:about|approx\.?|approximately|around|~|scant|heaping|heaped|generous|rounded|level|large|small|big|medium(?:[\s-]sized)?|med|lrg|sm|(?:lightly\s+|firmly\s+|loosely\s+|tightly\s+)?packed)`;
export const QUANTITY_RE = new RegExp(
  String.raw`^(?:${MODIFIER}\s*)?(?:${NUMBER}(?:\s*(?:-|–|—|to|or)\s*${NUMBER})?|${QUANTITY_WORDS}\b)(?:\s*${MODIFIER}\b)?\s*`,
  "i",
);
export const UNIT_RE = new RegExp(
  String.raw`^(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\(|\/)\s*`,
  "i",
);
/**
 * `/1.5kg` after `3.5lb`: the same amount in other units (32j) — or a range
 * of them, `3-4lbs/1.5-2kg` (43n).
 */
export const UNIT_ALT_RE = new RegExp(
  String.raw`^\/\s*${NUMBER}(?:\s*[-–—]\s*${NUMBER})?\s*(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\()\s*`,
  "i",
);
/** ` or can` / `/can` after a unit: the second of two containers (27c). */
export const UNIT_OR_RE = new RegExp(
  String.raw`^(?:or|\/)\s*(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\()\s*`,
  "i",
);
export const UNIT_OF_RE = new RegExp(
  String.raw`^(?:${UNIT_PATTERN})(?:e?s)?\.?\s+of\s+`,
  "i",
);

const WHOLE_WORDS: Record<string, string> = {
  a: "1",
  an: "1",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  twelve: "12",
};
const PART_WORDS: Record<string, string> = {
  half: "1/2",
  third: "1/3",
  quarter: "1/4",
  "three quarter": "3/4",
  "three fourth": "3/4",
};
const WHOLE = String.raw`(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)`;
/* `2 and a half`, `1 and one-half`, `1 & three-quarters`. Never `half and
 * half`: the whole must be a number, and `half` is not one. */
const AND_PART_RE = new RegExp(
  String.raw`(?<![\d/.,])\b${WHOLE}\s+(?:and|&)\s+(?:(?:a|one)[\s-]+(half|third|quarter)|(three[\s-]+(?:quarter|fourth)))s?\b(?![\s-]*(?:and|&)[\s-]*half)`,
  "gi",
);
/* `2 and 1/4`, `2 & 1/4` — not `1/2 and 1/4`, which is two amounts. */
const AND_FRACTION_RE =
  /(?<![\d/.,])\b(\d+)\s+(?:and|&)\s+(\d+\/\d+)(?![\d/])/g;

/**
 * A mixed number written with `and` or `&` — `2 and 1/4 cups`, the way
 * Sally's recipes write them, `2 & ½`, `1 and a half`, `one and one-half`,
 * `1 and three-quarters` — as the grammar's own `2 1/4` (43n2). Takes text
 * `readableLine` has read (`½` is `1/2` by then). Only a whole number, then
 * `and`, then a fraction joins: `1 cup salt and 2 eggs`, `salt and pepper`,
 * `half and half` and `2 and 3 eggs` stay as they are. Shared by
 * `parseIngredientLine` and `parseAmount`, so a line's name and its amount
 * read the same number.
 */
export function joinMixedNumbers(text: string): string {
  if (!/\s(?:and|&)\s/i.test(text)) return text;
  return text
    .replace(
      AND_PART_RE,
      (_match, whole: string, part?: string, three?: string) => {
        const key = whole.toLowerCase();
        const count = /^\d/.test(key) ? key : WHOLE_WORDS[key];
        const words = (part ?? three ?? "").toLowerCase();
        return `${count} ${PART_WORDS[words.replace(/[\s-]+/g, " ")]}`;
      },
    )
    .replace(AND_FRACTION_RE, "$1 $2");
}
