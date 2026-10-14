/**
 * How much an ingredient line asks for, for the shopping list (35a).
 *
 * `ingredientNames` reads what a line *names* and cuts the amount off with
 * `stripAmount`; this module reads the amount that was cut, with the same
 * grammar (`ingredientGrammar`) walked the same way: a quantity, `(14 oz)`
 * brackets, a unit, a second unit (`/1.5kg`, `or can`), then any `plus|and
 * <qty> <unit>` that continues it. What it adds is arithmetic — units in
 * families that convert within themselves, so two recipes' butter can be one
 * line on a list.
 *
 * - A range rounds **up**: `2-3 cloves` is 3, `1/2 to 1 cup` is a cup. A list
 *   that buys the low end runs short.
 * - US and metric **never** convert into each other: a recipe written in grams
 *   was weighed, and `120 g` turned into cups would be a guess. `oz` is a
 *   weight unless it says `fl oz`.
 * - Containers (`can`, `clove`, `bunch`, …) are each their own unit. A size
 *   written before one (`1 (15-ounce) can`, `2 14.5oz cans`) describes the
 *   container, so the line is counted in cans. A size before anything else
 *   is each one's (`4 6-oz fillets` and `4 (6 oz) fillets` are both 24 oz),
 *   unless a bracket says it is the total (`8 (about 2 lb) thighs`); a
 *   dimension (`2 9-inch pie crusts`) leaves a count.
 * - A line that names no amount — `to taste`, a pinch, `for serving`, or just
 *   `Kosher salt` — is **as needed**: `{ parts: [] }`. A line with numbers the
 *   grammar can't read is `null`, and the caller keeps the line as written.
 *
 * `editor/scripts/measure-shopping.ts` prints what this makes of the real
 * corpus — re-run it before and after tuning.
 *
 * Pure, and safe in the browser.
 */
import type Fraction from "fraction.js";
import { detectHeading } from "./detectHeading";
import {
  NUMBER,
  QUANTITY_RE,
  UNIT_ALT_RE,
  UNIT_OF_RE,
  UNIT_OR_RE,
  UNIT_RE,
} from "./ingredientGrammar";
import { stripMarkup } from "./ingredientNames";
import { normalizeIngredientText } from "./parseIngredients";

/**
 * Which units convert into which. US and metric are separate families on
 * purpose; a `container` converts into nothing but itself.
 */
export type UnitFamily =
  | "us-volume"
  | "metric-volume"
  | "us-weight"
  | "metric-weight"
  | "count"
  | "container";

/** One measure of one family: `2 cup`, `120 g`, `3` (eggs), `1 can`. */
export interface AmountPart {
  qty: number;
  /** Canonical and singular (`tbsp`, `fl oz`, `can`); `""` for a count. */
  unit: string;
  family: UnitFamily;
}

/**
 * How much of something: one part per family (or container) it was given in.
 * No parts at all means **as needed**.
 */
export interface Amount {
  parts: AmountPart[];
}

export const AS_NEEDED: Amount = { parts: [] };

export function isAsNeeded(amount: Amount): boolean {
  return amount.parts.length === 0;
}

// --- units -----------------------------------------------------------------

/** Each measurable unit's size in its family's smallest (tsp, ml, oz, g). */
const MEASURES: Record<string, { family: UnitFamily; factor: number }> = {
  tsp: { family: "us-volume", factor: 1 },
  tbsp: { family: "us-volume", factor: 3 },
  "fl oz": { family: "us-volume", factor: 6 },
  cup: { family: "us-volume", factor: 48 },
  pint: { family: "us-volume", factor: 96 },
  quart: { family: "us-volume", factor: 192 },
  gallon: { family: "us-volume", factor: 768 },
  ml: { family: "metric-volume", factor: 1 },
  cl: { family: "metric-volume", factor: 10 },
  dl: { family: "metric-volume", factor: 100 },
  l: { family: "metric-volume", factor: 1000 },
  oz: { family: "us-weight", factor: 1 },
  lb: { family: "us-weight", factor: 16 },
  g: { family: "metric-weight", factor: 1 },
  kg: { family: "metric-weight", factor: 1000 },
};

/**
 * What `formatAmount` writes each family in, largest first. No pints: two
 * cups of flour is not "1 pint" to anyone (a pint read in still converts).
 */
const LADDERS: Partial<Record<UnitFamily, string[]>> = {
  "us-volume": ["gallon", "quart", "cup", "tbsp", "tsp"],
  "metric-volume": ["l", "ml"],
  "us-weight": ["lb", "oz"],
  "metric-weight": ["kg", "g"],
};

/** Spellings of the measurable units, lower case, singular, no full stop. */
const MEASURE_ALIASES: Record<string, string> = {
  tsp: "tsp",
  t: "tsp",
  teaspoon: "tsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  tbl: "tbsp",
  tablespoon: "tbsp",
  "fl oz": "fl oz",
  floz: "fl oz",
  "fluid ounce": "fl oz",
  "fl ounce": "fl oz",
  cup: "cup",
  c: "cup",
  pint: "pint",
  pt: "pint",
  quart: "quart",
  qt: "quart",
  gallon: "gallon",
  gal: "gallon",
  ml: "ml",
  milliliter: "ml",
  millilitre: "ml",
  cl: "cl",
  dl: "dl",
  l: "l",
  liter: "l",
  litre: "l",
  oz: "oz",
  ounce: "oz",
  lb: "lb",
  pound: "lb",
  g: "g",
  gram: "g",
  gramme: "g",
  kg: "kg",
  kilogram: "kg",
};

/** Units that are their own thing: `2 cans` and `3 cloves` add, never convert. */
const CONTAINER_ALIASES: Record<string, string> = {
  can: "can",
  tin: "tin",
  jar: "jar",
  bottle: "bottle",
  package: "package",
  pkg: "package",
  packet: "packet",
  envelope: "envelope",
  bag: "bag",
  box: "box",
  carton: "carton",
  container: "container",
  bunch: "bunch",
  head: "head",
  clove: "clove",
  stick: "stick",
  sprig: "sprig",
  slice: "slice",
  wedge: "wedge",
  wheel: "wheel",
  stalk: "stalk",
  rib: "rib",
  ear: "ear",
  piece: "piece",
  pc: "piece",
  handful: "handful",
  scoop: "scoop",
  knob: "knob",
  inch: "inch",
  sheet: "sheet",
  recipe: "recipe",
  batch: "batch",
  part: "part",
  shot: "shot",
  jigger: "jigger",
  measure: "measure",
  "bar spoon": "barspoon",
  barspoon: "barspoon",
};

/** Units too small to shop for: a line measured in them is as needed. */
const VAGUE_UNITS = new Set([
  "dash",
  "drop",
  "splash",
  "squeeze",
  "squirt",
  "pinch",
]);

/* `Object.hasOwn`, so `constructor` is no unit. */
function lookup(key: string): { unit: string; family: UnitFamily } | null {
  if (Object.hasOwn(MEASURE_ALIASES, key)) {
    const unit = MEASURE_ALIASES[key];
    return { unit, family: MEASURES[unit].family };
  }
  if (Object.hasOwn(CONTAINER_ALIASES, key)) {
    return { unit: CONTAINER_ALIASES[key], family: "container" };
  }
  return null;
}

/**
 * A unit as written — `Tablespoons`, `lbs.`, `fl. oz`, `T` — as its canonical
 * name and family, or `null` for anything else. Case matters for one pair
 * only: `T` is a tablespoon and `t` a teaspoon. `pinch`, `dash` and the like
 * are `null` too: they are not amounts (`parseAmount` reads them as needed).
 */
export function normalizeUnit(
  text: string,
): { unit: string; family: UnitFamily } | null {
  const trimmed = text.trim().replace(/\.$/, "");
  if (trimmed === "T" || trimmed === "Tb" || trimmed === "TB") {
    return lookup("tbsp");
  }
  const key = trimmed
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .replace(/^fl(?=oz|ounce)/, "fl ");
  for (const candidate of [
    key,
    key.replace(/s$/, ""),
    key.replace(/es$/, ""),
  ]) {
    const found = lookup(candidate);
    if (found) return found;
  }
  return null;
}

function isVague(text: string): boolean {
  const key = text.trim().replace(/\.$/, "").toLowerCase();
  return [key, key.replace(/s$/, ""), key.replace(/es$/, "")].some((k) =>
    VAGUE_UNITS.has(k),
  );
}

// --- numbers ---------------------------------------------------------------

const NUMBER_GLOBAL_RE = new RegExp(NUMBER, "g");

/** `1 1/2`, `3/4`, `1.5`, `1,5` — and `1,800`, a thousands separator. */
function numberValue(text: string): number {
  if (/^\d{1,3},\d{3}$/.test(text)) return Number(text.replace(",", ""));
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text.replace(",", "."));
}

/** What the quantity words of `QUANTITY_WORDS` count as; `null` is vague. */
const WORD_VALUES: [RegExp, number | null][] = [
  [/^half\b/i, 0.5],
  [/^(?:a\s+)?couple\b/i, 2],
  [/^(?:a\s+)?few\b|^several\b/i, 3],
  [/^(?:some|a\s+little|a\s+bit)\b/i, null],
  [/^(?:an?|one)\b/i, 1],
  [/^two\b/i, 2],
  [/^three\b/i, 3],
  [/^four\b/i, 4],
  [/^five\b/i, 5],
  [/^six\b/i, 6],
  [/^seven\b/i, 7],
  [/^eight\b/i, 8],
  [/^nine\b/i, 9],
  [/^ten\b/i, 10],
  [/^twelve\b/i, 12],
];

const MODIFIER_LEAD_RE =
  /^(?:about|approx\.?|approximately|around|~|scant|heaping|heaped|generous|rounded|level|large|small|big)\s*/i;

/**
 * The value of a `QUANTITY_RE` match: a range's high end, a word's count, or
 * `null` for "some" and "a little".
 */
function quantityValue(text: string): number | null {
  const numbers = text.match(NUMBER_GLOBAL_RE);
  if (numbers) return Math.max(...numbers.map(numberValue));
  const words = text.trim().replace(MODIFIER_LEAD_RE, "");
  for (const [pattern, value] of WORD_VALUES) {
    if (pattern.test(words)) return value;
  }
  return null;
}

// --- parsing ---------------------------------------------------------------

/** `(14 oz)` / `(420ml)` / `(15-ounce)`: a bracket with a number in it. */
const MEASURE_BRACKET_RE = /^\(+[^()]*\d[^()]*\)+\s*/;

/** No amount, and says so. */
const AS_NEEDED_RE =
  /\b(?:to taste|as (?:needed|required|desired)|if (?:needed|desired|using)|for (?:serving|garnish(?:ing)?|decoration|dusting|drizzling|sprinkling|topping|frying|greasing|brushing|the pan|pan|rolling)|to (?:serve|garnish|top|finish|cover)|optional)\b/i;

/** A line that opens with a pinch, a dash, a drizzle. */
const VAGUE_LEAD_RE =
  /^(?:an?\s+)?(?:pinch(?:es)?|dash(?:es)?|splash(?:es)?|squeeze|squirt|drizzle|sprinkle|sprinkling|drops?|few\s+drops|handful)\b/i;

/** `juice of 2 limes`, `finely grated zest of 1 lemon`, `zest 1 lemon`. */
const PART_OF_RE =
  /\b(?:juice|zest|peel|rind|twist)(?:\s+(?:and|&)\s+(?:juice|zest|peel))?\s+(?:of\s+)?((?:\d|an?\b|one\b|half\b).*)$/i;

/** Words before a quantity that `QUANTITY_RE`'s modifiers don't cover. */
const LEAD_SOFTENER_RE =
  /^(?:roughly|up to|at least|just under|just over|a generous)\s+(?=\d)/i;

/** Remarks in brackets, out of the way of a trailing amount. */
const BRACKETS_RE = /\s*\([^()]*\)/g;

interface Read {
  amount: Amount;
  rest: string;
}

/** A unit at the start of `rest`, then what follows it. */
function readUnit(
  rest: string,
): { unit: string | null; vague: boolean; rest: string } | null {
  /* `UNIT_RE` wants a space after a unit; `2 cloves, minced` has a comma. */
  const spaced = rest.replace(/^([^\s,(]+),/, "$1 ,");
  const match = UNIT_RE.exec(spaced);
  if (!match) return null;
  const written = match[0].trim();
  const after = spaced.slice(match[0].length);
  if (isVague(written)) return { unit: null, vague: true, rest: after };
  return { unit: written, vague: false, rest: after };
}

function part(qty: number, written: string): AmountPart {
  const found = normalizeUnit(written);
  return found
    ? { qty, unit: found.unit, family: found.family }
    : { qty, unit: "", family: "count" };
}

/** After a unit: `or can`, `/1.5kg`, `(420 ml)`, `of`. */
function skipAfterUnit(rest: string): string {
  let after = rest;
  const orUnit = UNIT_OR_RE.exec(after);
  if (orUnit) after = after.slice(orUnit[0].length);
  const altUnit = UNIT_ALT_RE.exec(after);
  if (altUnit) after = after.slice(altUnit[0].length);
  return after.replace(MEASURE_BRACKET_RE, "").replace(/^of\s+/i, "");
}

/** Units that say how big each thing is, never how much: `9-inch crusts`. */
const DIMENSIONS = new Set(["inch"]);

/** A part's size in its family's smallest unit, to compare a range's ends. */
function baseQty(p: AmountPart): number {
  return p.qty * factor(p.unit);
}

/**
 * A quantity *with* a unit at the start of `text` — `14.5oz/411g`, `250g`,
 * `2 tablespoons` — and what follows it. `null` without both, or when the
 * unit is a pinch. `digits` refuses quantity words (`a`, `two`).
 */
function readMeasure(
  text: string,
  digits = false,
): { part: AmountPart; rest: string } | null {
  const quantity = QUANTITY_RE.exec(text);
  if (!quantity || quantity[0].length === 0) return null;
  if (digits && !/\d/.test(quantity[0])) return null;
  const value = quantityValue(quantity[0]);
  const unit = readUnit(text.slice(quantity[0].length));
  if (value === null || !unit?.unit) return null;
  return { part: part(value, unit.unit), rest: skipAfterUnit(unit.rest) };
}

/**
 * A size after a count: `14.5oz/411g` in `2 14.5oz cans`, `(15-ounce)` in
 * `1 (15-ounce) can`, `9 inch` in `2 9-inch pie crusts`. A bracket that says
 * `about` or `total` is the whole amount rather than each one's.
 */
function readSize(
  rest: string,
): { size: AmountPart; total: boolean; rest: string } | null {
  const bracket = /^\(+([^()]*\d[^()]*)\)+\s*/.exec(rest);
  if (bracket) {
    const measure = readMeasure(bracket[1].trim(), true);
    if (!measure) return null;
    return {
      size: measure.part,
      total:
        /~|\b(?:about|approx|approximately|around|total|in all|altogether)\b/i.test(
          bracket[1],
        ),
      rest: rest.slice(bracket[0].length),
    };
  }
  const measure = readMeasure(rest, true);
  return measure && { size: measure.part, total: false, rest: measure.rest };
}

/**
 * A quantity and what follows it, the way `stripAmount` walks it. `null`
 * when `rest` doesn't open with a quantity — or opens with one this can't
 * be sure of (`1 and …`).
 */
function readQuantity(text: string): Read | "vague" | null {
  const first = QUANTITY_RE.exec(text);
  if (!first || first[0].length === 0) return null;
  let count = quantityValue(first[0]);
  let rest = text
    .slice(first[0].length)
    /* `3 medium cloves`, `4 thick slices`: sizes the grammar doesn't skip. */
    .replace(/^(?:medium(?:-sized)?|thick|thin)\s+(?=\S)/i, "");
  if (count === null) return "vague";

  /* `2 dozen eggs`, `a dozen`. */
  const dozen = /^dozens?\b\s*/i.exec(rest);
  if (dozen) {
    count *= 12;
    rest = rest.slice(dozen[0].length);
  }
  /* `1 and 1/2 cups` the clean-up missed: a count here would be a guess. */
  if (/^(?:and|&)\s+(?:\d|an?\s+half\b|half\b)/i.test(rest)) return null;

  /*
   * A size after the count — `2 14.5oz cans`, `4 (6 oz) salmon fillets`,
   * `4 6-oz salmon fillets`, `2 9-inch pie crusts`. Before a container it
   * describes the container, and the line is counted in those; a dimension
   * says how big each is, so the line is a count; otherwise it is the count
   * times the size (`4 6-oz fillets` and `4 (6 oz) fillets` are both 1½ lb),
   * or the size alone when a bracket says it is the total (`(about 2 lb)`).
   */
  const sized = readSize(rest);
  /* `250 (1c) grams`: a measure followed by a unit was the other measure. */
  const measured = sized && readUnit(sized.rest);
  if (
    sized &&
    !(measured?.unit && part(1, measured.unit).family !== "container")
  ) {
    const container = measured;
    if (container?.unit && part(1, container.unit).family === "container") {
      return {
        amount: { parts: [part(count, container.unit)] },
        rest: skipAfterUnit(container.rest),
      };
    }
    if (DIMENSIONS.has(sized.size.unit)) {
      return { amount: { parts: [part(count, "")] }, rest: sized.rest };
    }
    const qty = sized.total ? sized.size.qty : sized.size.qty * count;
    return { amount: { parts: [{ ...sized.size, qty }] }, rest: sized.rest };
  }
  rest = rest.replace(MEASURE_BRACKET_RE, "");

  const unit = readUnit(rest);
  if (!unit) {
    return { amount: { parts: [part(count, "")] }, rest };
  }
  if (unit.vague) return "vague";
  let parts = [part(count, unit.unit!)];
  rest = skipAfterUnit(unit.rest);

  /* `10 inch tortillas`: a dimension before a plural noun, one of them. */
  if (
    DIMENSIONS.has(parts[0].unit) &&
    !readUnit(rest) &&
    /^(?:\p{L}+\s+)?\p{L}+s\b/u.test(rest)
  ) {
    return { amount: { parts: [part(1, "")] }, rest };
  }

  /* `200g-250g`, `1 lb to 1 1/2 lbs`, `2 tbsp to 1/4 cup`: the larger end. */
  const range = /^(?:-|–|—|to\b|or\b)\s*/i.exec(rest);
  if (range) {
    const high = readMeasure(rest.slice(range[0].length));
    if (high && partKey(high.part) === partKey(parts[0])) {
      if (baseQty(high.part) > baseQty(parts[0])) parts = [high.part];
      rest = high.rest;
    }
  }

  /* `28oz/800g can`: a size before a container, with no count of its own. */
  const container = readUnit(rest);
  if (
    container?.unit &&
    parts[0].family !== "container" &&
    part(1, container.unit).family === "container"
  ) {
    return {
      amount: { parts: [part(1, container.unit)] },
      rest: skipAfterUnit(container.rest),
    };
  }

  /*
   * `1 cup plus 2 tablespoons`: only a quantity *and* a unit continue it. So
   * does `1 lb 2 oz` with no `plus`, when the second is a smaller unit of
   * the same measurable family.
   */
  for (let guard = 0; guard < 3; guard++) {
    const chain = /^(?:plus|and|\+)\s+/i.exec(rest);
    const more = readMeasure(rest.slice(chain ? chain[0].length : 0));
    if (!more) break;
    const last = parts[parts.length - 1];
    if (
      !chain &&
      (more.part.family !== last.family ||
        !LADDERS[last.family] ||
        factor(more.part.unit) >= factor(last.unit))
    ) {
      break;
    }
    parts = addAmounts({ parts }, { parts: [more.part] }).parts;
    rest = more.rest;
  }
  return { amount: { parts }, rest };
}

/** Does this amount carry a unit (anything but a bare count)? */
function hasUnit(amount: Amount): boolean {
  return amount.parts.some((p) => p.family !== "count");
}

/**
 * An amount written last, the way bakers list a formula: `Bread flour 300g`,
 * `Salt, 5 g`, `Rosemary, ~4 sprigs`, `flour 73g 60%`. It must reach the end
 * of the line, and carry a unit unless a comma sets it off (`Whole egg, 1`) —
 * a bare trailing number is too often something else.
 */
function readTrailing(text: string): Amount | null {
  const outside = text.replace(BRACKETS_RE, "").trim();
  const match =
    /(^|[\s,])\s*((?:~\s*)?\d(?:[^,]|,(?=\d))*?)(?:\s+\d+(?:\.\d+)?%)*\s*$/.exec(
      outside,
    );
  if (!match) return null;
  const read = readQuantity(match[2]);
  if (!read || read === "vague" || read.rest.trim()) return null;
  return hasUnit(read.amount) || match[1] === "," ? read.amount : null;
}

/**
 * An amount in brackets after the name: `Black pepper (approx. 1 tsp,
 * divided)`. Only with a unit, and never `per serving`.
 */
function readBracket(text: string): Amount | null {
  const match =
    /\(\s*(?:about|approx\.?|approximately|roughly|around|~)?\s*(\d[^()]*)\)/i.exec(
      text,
    );
  if (!match || /\bper\b/i.test(match[1])) return null;
  const read = readQuantity(match[1]);
  if (!read || read === "vague" || !hasUnit(read.amount)) return null;
  return read.amount;
}

/**
 * How much a line asks for: its parts, `{ parts: [] }` (as needed) when it
 * names no amount, or `null` when it has numbers this can't read. A heading
 * is `null`. Takes a stored line (with `<Multiplyable />` markup) or plain
 * text.
 */
export function parseAmount(line: string): Amount | null {
  let text = normalizeIngredientText(stripMarkup(line))
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || detectHeading(text)) return null;
  text = text
    .replace(/^(?:optional|garnish(?:es)?|to serve|for serving)\s*:\s*/i, "")
    /* `egg wash: 1 large egg …`: a label before the amount. */
    .replace(/^\p{L}[\p{L}\s'&-]{0,40}:\s*(?=\d)/u, "");
  /*
   * `(50g) 1/4 cup sugar`: the bracket is the other measure. Kept aside for
   * `(about 2 cups) chopped kale`, where it is the only one.
   */
  const lead = /^\(+[^()]*\d[^()]*\)+\s*(?=\S)/.exec(text);
  if (lead) text = text.slice(lead[0].length);
  /*
   * The rest of the clean-up is local to amounts: the shared grammar stays
   * as `stripAmount` uses it, and these rewrite what it can't read.
   */
  text = text
    .replace(LEAD_SOFTENER_RE, "")
    /* `one and a half`, `1 and a half`, `1 and 1/2`: one number. */
    .replace(
      /\b(\d+|one|an?)\s+and\s+a\s+half\b/gi,
      (_match, whole: string) => `${/^\d/.test(whole) ? whole : "1"} 1/2`,
    )
    .replace(/\b(\d+)\s+and\s+(\d+\/\d+)/g, "$1 $2")
    /* `a half cup`: not one of something. Never `half and half`. */
    .replace(/\b(?:a|one)\s+half\b(?![\s-]*(?:and|&)[\s-]*half)/gi, "1/2")
    /* `2 x 400g tins`: a count, then each one's size. */
    .replace(/(?<=\d)\s*[x×]\s*(?=\d)/g, " ")
    /* `1-1/2` is one and a half, not a range down to a half. */
    .replace(/(?<![\d/.,])(\d+)\s*-\s*(\d+\/\d+)/g, "$1 $2")
    /* `15-ounce`, `2-lb`: the unit is a word of its own. */
    .replace(/(?<=\d)-(?=\p{L})/gu, " ")
    /* `200g-250g`: a range between two units, spaced so each is read. */
    .replace(/(\d\s*\p{L}+\.?)\s*[-–—]\s*(?=\d)/gu, "$1 - ")
    /* `2 Tb`, `1 TB`, `2 fl. oz`: spellings the grammar's unit list lacks. */
    .replace(/(?<=\d\s*)T[bB]\.?(?=\s)/g, "tbsp")
    .replace(/\bfl\.\s*(?=oz|ounce)/gi, "fl ")
    /* `8ish`. */
    .replace(/(?<=\d)ish\b/gi, "");

  const read = readQuantity(text);
  if (read === "vague") return AS_NEEDED;
  if (read) return read.amount;

  /* `Pinch of salt`, `Cup of sugar`: a unit with no number is one of it. */
  const unitOf = UNIT_OF_RE.exec(text);
  if (unitOf) {
    const written = unitOf[0].replace(/\s+of\s+$/i, "").trim();
    if (isVague(written)) return AS_NEEDED;
    const found = normalizeUnit(written);
    if (found) return { parts: [{ qty: 1, ...found }] };
  }
  if (VAGUE_LEAD_RE.test(text)) return AS_NEEDED;

  /* `juice of 2 limes` asks for two limes. */
  const partOf = PART_OF_RE.exec(text);
  if (partOf) {
    const whole = readQuantity(partOf[1]);
    if (whole === "vague") return AS_NEEDED;
    if (whole) return whole.amount;
  }

  const trailing =
    readTrailing(text) ?? readBracket(text) ?? (lead && readBracket(lead[0]));
  if (trailing) return trailing;

  if (AS_NEEDED_RE.test(text)) return AS_NEEDED;
  /* Nothing that reads as a number anywhere: `Kosher salt`, `Chives`. */
  if (!/\d/.test(text)) return AS_NEEDED;
  return null;
}

// --- arithmetic ------------------------------------------------------------

/** What two parts must share to add: a family, and a container's own unit. */
function partKey(part: AmountPart): string {
  return part.family === "container" ? `container:${part.unit}` : part.family;
}

function factor(unit: string): number {
  return MEASURES[unit]?.factor ?? 1;
}

/**
 * The amounts together. Parts of one family add — in the smaller of their
 * two units, so nothing is rounded here — and parts of different families
 * stay side by side: `1 lb` and `2 cups` of butter are both on the list. An
 * as-needed amount adds nothing: `1 tsp` and "salt to taste" is `1 tsp`.
 */
export function addAmounts(...amounts: Amount[]): Amount {
  const parts: AmountPart[] = [];
  for (const amount of amounts) {
    for (const next of amount.parts) {
      const index = parts.findIndex((p) => partKey(p) === partKey(next));
      if (index < 0) {
        parts.push({ ...next });
        continue;
      }
      const current = parts[index];
      const unit =
        factor(next.unit) < factor(current.unit) ? next.unit : current.unit;
      const qty =
        (current.qty * factor(current.unit) + next.qty * factor(next.unit)) /
        factor(unit);
      parts[index] = { ...current, unit, qty };
    }
  }
  return { parts };
}

/**
 * Every part times `factor` — a recipe's or a meal plan's `scale`. A part
 * that comes to nothing (a factor of zero or less, or not a number) is
 * dropped, so scaling by 0 leaves as needed rather than a positive amount
 * that rounds up from zero.
 */
export function scaleAmount(amount: Amount, factor: number | Fraction): Amount {
  const by = Number(factor.valueOf());
  return {
    parts: amount.parts
      .map((p) => ({ ...p, qty: p.qty * by }))
      .filter((p) => Number.isFinite(p.qty) && p.qty > 0),
  };
}

// --- formatting ------------------------------------------------------------

const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
const THIRDS = ["", "⅓", "⅔"];
const EPSILON = 1e-6;

/** An exact third that is not a whole number: `⅓`, `1⅔`. */
function isThird(value: number): boolean {
  const thirds = value * 3;
  return (
    Math.abs(thirds - Math.round(thirds)) < EPSILON &&
    Math.round(thirds) % 3 !== 0
  );
}

/** The fractions of a cup recipes write: ¼ ⅓ ½ ⅔ ¾. */
const CUP_FRACTIONS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];

function isCupFraction(value: number): boolean {
  return CUP_FRACTIONS.some((f) => Math.abs(value - f) < EPSILON);
}

/** To the nearest `step`, and never below one step: a little is not none. */
function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * A number as a list shows it, and the value that text stands for: to the
 * nearest `step` (`2`, `½`, `1⅜`, `112½`), except that an exact third stays
 * one when the step is finer than a half — `⅓ cup` was written, `⅜ cup`
 * never is.
 */
function shown(value: number, step: number): { value: number; text: string } {
  if (step < 1 / 2 && isThird(value)) {
    const thirds = Math.round(value * 3);
    const whole = Math.floor(thirds / 3);
    const glyph = THIRDS[thirds % 3];
    return { value, text: whole === 0 ? glyph : `${whole}${glyph}` };
  }
  const rounded = roundTo(value, step);
  const eighths = Math.round(rounded * 8);
  const whole = Math.floor(eighths / 8);
  const glyph = EIGHTHS[eighths % 8];
  return {
    value: rounded,
    text: whole === 0 && glyph ? glyph : `${whole}${glyph}`,
  };
}

const PLURAL_UNITS = new Set(["cup", "pint", "quart", "gallon"]);

function unitLabel(unit: string, value: number, family: UnitFamily): string {
  if (value <= 1) return unit;
  if (family === "container") {
    return /(?:ch|sh|x|s)$/.test(unit) ? `${unit}es` : `${unit}s`;
  }
  return PLURAL_UNITS.has(unit) ? `${unit}s` : unit;
}

/**
 * Metric as metric is written: whole grams or millilitres below a kilo or a
 * litre, one decimal from there (`1.8 kg`) — rounded **up**, since a list
 * that buys short runs short.
 */
function formatMetric(base: number, large: string, small: string): string {
  const whole = Math.max(1, Math.ceil(base - EPSILON));
  if (whole < 1000) return `${whole} ${small}`;
  return `${Math.ceil(base / 100 - EPSILON) / 10} ${large}`;
}

function formatPart(part: AmountPart): string {
  const ladder = LADDERS[part.family];
  if (part.family === "metric-weight" || part.family === "metric-volume") {
    const [large, small] = ladder!;
    return formatMetric(part.qty * factor(part.unit), large, small);
  }
  if (!ladder) {
    const { value, text } = shown(part.qty, 1 / 8);
    return part.unit
      ? `${text} ${unitLabel(part.unit, value, part.family)}`
      : text;
  }
  const base = part.qty * factor(part.unit);
  for (const unit of ladder) {
    const exact = base / factor(unit);
    const { value, text } = shown(exact, unit === "tsp" ? 1 / 2 : 1 / 8);
    /*
     * Below one, a cup only as recipes write it — ½ cup, not 8 tbsp — and
     * otherwise the spoons: 5 tbsp, 6 tbsp, never ⅜ cup.
     */
    const asWritten = unit === "cup" && isCupFraction(exact);
    if (value >= 1 || asWritten || unit === ladder[ladder.length - 1]) {
      return `${text} ${unitLabel(unit, value, part.family)}`;
    }
  }
  return "";
}

/**
 * An amount as a list shows it: each family in the largest unit that comes
 * to at least one (or ¼ ⅓ ½ ⅔ ¾ cup), to the nearest eighth (half, for
 * teaspoons; exact thirds kept) and never rounded to nothing; metric in
 * whole g/ml or tenths of a kg/l, rounded up. Joined with `+` — `1 lb + 2
 * cups`, `1½ cups`, `⅓ cup`, `1.8 kg`, `3 cans`. No parts, or none above
 * zero, reads `as needed`.
 */
export function formatAmount(amount: Amount): string {
  const parts = amount.parts.filter((p) => p.qty > 0);
  if (parts.length === 0) return "as needed";
  return parts.map(formatPart).join(" + ");
}
