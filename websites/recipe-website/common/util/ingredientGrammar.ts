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

/** `2`, `1.5`, `1 1/2`, `3/4`, and a range or choice of them. */
/* Fractions first: the alternation takes the first branch that fits, and a
 * bare `\d+` fits the `3` of `3/4`. */
export const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;
export const QUANTITY_WORDS = String.raw`(?:a\s+few|a\s+couple(?:\s+of)?|a\s+little|a\s+bit(?:\s+of)?|couple(?:\s+of)?|few|several|some|half(?![\s-]*(?:and|&)[\s-]*half)(?:\s+an?)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|an?)`;
export const MODIFIER = String.raw`(?:about|approx\.?|approximately|around|~|scant|heaping|heaped|generous|rounded|level|large|small|big)`;
export const QUANTITY_RE = new RegExp(
  String.raw`^(?:${MODIFIER}\s*)?(?:${NUMBER}(?:\s*(?:-|–|—|to|or)\s*${NUMBER})?|${QUANTITY_WORDS}\b)(?:\s*${MODIFIER}\b)?\s*`,
  "i",
);
export const UNIT_RE = new RegExp(
  String.raw`^(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\(|\/)\s*`,
  "i",
);
/** `/1.5kg` after `3.5lb`: the same amount in other units (32j). */
export const UNIT_ALT_RE = new RegExp(
  String.raw`^\/\s*${NUMBER}\s*(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\()\s*`,
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
