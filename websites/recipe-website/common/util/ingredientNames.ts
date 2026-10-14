/**
 * What an ingredient line *names*, for "What can I make?" (25c/D9).
 *
 * Nothing else in the codebase pulls a generic name out of a line: search
 * matches words wherever they fall, which is right for finding a recipe and
 * wrong for deciding whether a bar holds what it needs. This module turns
 * `1 1/2 oz non-alcoholic aperitif (Gnista)` into a requirement — the words
 * `aperitif`, marked non-alcoholic, with `Gnista` as an alias — and runs the
 * *same* word pipeline over what someone types into their inventory, so the
 * two sides meet in one vocabulary.
 *
 * It is heuristic by nature. Every word list lives here, in one tested file,
 * and `editor/scripts/measure-ingredient-names.ts` prints what it makes of the
 * real corpus — re-run it before tuning a list. Drinks were the first target;
 * 32j made food lines first-class (trailing prep phrases, food synonyms, salt
 * and pepper, the close-match data at the end), and `measure-makeable.ts`
 * counts what a pantry makes of the real corpus.
 *
 * Pure, and safe in the browser: the `/make` page runs it over the whole
 * corpus on the client.
 */
import { fold } from "../components/SearchForm/queryLanguage";
import { detectHeading } from "./detectHeading";
import { normalizeIngredientText } from "./parseIngredients";

/** A normalized ingredient name. */
export interface IngredientName {
  /**
   * The name's words, folded, singular, descriptive words dropped — and known
   * compounds joined into one word (`"ginger beer"`), so `beer` can never be
   * the tail of `ginger beer`.
   */
  words: string[];
  /** Marked non-alcoholic / alcohol-free / zero-proof. */
  na: boolean;
}

/** One thing a recipe needs. A line yields one, or two for an infusion. */
export interface Requirement {
  /** Index of the line in the recipe's ingredient list. */
  line: number;
  /** The line as written. */
  text: string;
  /** Any one of these meets it: `lemon or lime juice` has two. */
  alternatives: IngredientName[];
  /** Brands and examples, as written: `Gnista`, `Cabernet Sauvignon`. */
  aliases: string[];
  /** `aliases`, as `aliasKey` makes them. */
  aliasKeys: string[];
  /** Never counted against a recipe: garnishes, "to taste", optional sections. */
  optional: boolean;
  /** Always on hand: water and ice. */
  staple: boolean;
  /**
   * An infusion's flavour (`chamomile` in `chamomile-infused vodka`) — met by
   * any item that mentions it, since chamomile tea infuses as well as
   * chamomile does.
   */
  loose: boolean;
}

export interface LineMeta {
  /** The line is a stored heading (`type: "heading"`). */
  heading?: boolean;
  /** The line sits under a garnish / optional / to-serve heading. */
  optionalSection?: boolean;
  /** Index of the line in its list; 0 when parsed alone. */
  index?: number;
}

// --- word lists ------------------------------------------------------------

/**
 * Units, singular. Matched case-insensitively, with an optional plural and an
 * optional full stop — and **only** after a quantity or before `of`, so the
 * one-letter ones (`c`, `t`, `g`, `l`) can't eat a real word.
 */
const UNITS = [
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
const UNIT_PATTERN = [...UNITS]
  .sort((a, b) => b.length - a.length)
  .map((unit) => unit.replace(/ /g, "\\s*"))
  .join("|");

/** `2`, `1.5`, `1 1/2`, `3/4`, and a range or choice of them. */
/* Fractions first: the alternation takes the first branch that fits, and a
 * bare `\d+` fits the `3` of `3/4`. */
const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const QUANTITY_WORDS = String.raw`(?:a\s+few|a\s+couple(?:\s+of)?|a\s+little|a\s+bit(?:\s+of)?|couple(?:\s+of)?|few|several|some|half(?![\s-]*(?:and|&)[\s-]*half)(?:\s+an?)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|an?)`;
const MODIFIER = String.raw`(?:about|approx\.?|approximately|around|~|scant|heaping|heaped|generous|rounded|level|large|small|big)`;
const QUANTITY_RE = new RegExp(
  String.raw`^(?:${MODIFIER}\s*)?(?:${NUMBER}(?:\s*(?:-|–|—|to|or)\s*${NUMBER})?|${QUANTITY_WORDS}\b)(?:\s*${MODIFIER}\b)?\s*`,
  "i",
);
const UNIT_RE = new RegExp(
  String.raw`^(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\(|\/)\s*`,
  "i",
);
/** `/1.5kg` after `3.5lb`: the same amount in other units (32j). */
const UNIT_ALT_RE = new RegExp(
  String.raw`^\/\s*${NUMBER}\s*(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\()\s*`,
  "i",
);
/** ` or can` / `/can` after a unit: the second of two containers (27c). */
const UNIT_OR_RE = new RegExp(
  String.raw`^(?:or|\/)\s*(?:${UNIT_PATTERN})(?:e?s)?\.?(?=\s|$|\()\s*`,
  "i",
);
const UNIT_OF_RE = new RegExp(
  String.raw`^(?:${UNIT_PATTERN})(?:e?s)?\.?\s+of\s+`,
  "i",
);

/**
 * The parts of a fruit or plant a line asks for. `lime` meets `lime juice`
 * and `hibiscus` meets `hibiscus tea`: whoever holds the one can make the
 * other.
 */
export const DERIVED_FORMS = new Set([
  "juice",
  "zest",
  "peel",
  "twist",
  "wheel",
  "wedge",
  "slice",
  "tea",
  "stick",
  "leaf",
  "sprig",
  "clove",
]);

/** Words that describe an ingredient without naming it. */
const DESCRIPTIVE = new Set([
  "fresh",
  "freshly",
  "squeezed",
  "dried",
  "chilled",
  "cold",
  "hot",
  "warm",
  "boiling",
  /* Water's temperatures (32j): "cool water" is a staple. */
  "cool",
  "lukewarm",
  "tepid",
  "brewed",
  "room",
  "temperature",
  "large",
  "small",
  "medium",
  "big",
  "jumbo",
  "chopped",
  "sliced",
  "diced",
  "minced",
  "grated",
  "crushed",
  "cubed",
  "shredded",
  "peeled",
  "halved",
  "quartered",
  "finely",
  "roughly",
  "coarsely",
  "thinly",
  "lightly",
  "packed",
  "loosely",
  "firmly",
  "sifted",
  "softened",
  "melted",
  "beaten",
  "whisked",
  "toasted",
  "rinsed",
  "drained",
  "trimmed",
  "pitted",
  "seeded",
  "cored",
  "crumbled",
  "good",
  "quality",
  "best",
  "organic",
  "homemade",
  "store",
  "bought",
  "storebought",
  "culinary",
  "whole",
  "raw",
  "ripe",
  "pure",
  "natural",
  "premium",
  "filtered",
]);

/**
 * Two-word names that are one thing. Joined into a single word after
 * singularizing, so the generic/specific rules can't split them: `beer` is
 * not the tail of `ginger beer`, `cream` not of `sour cream`.
 */
const COMPOUNDS = new Set([
  /* Paired *before* `hot` is dropped as descriptive (27c), or it reads `sauce`. */
  "hot sauce",
  "ginger beer",
  "ginger ale",
  "root beer",
  "tonic water",
  "soda water",
  "coconut water",
  "rose water",
  "simple syrup",
  "cream soda",
  "baking soda",
  "baking powder",
  "bitter lemon",
  "egg white",
  "egg yolk",
  "coconut cream",
  "coconut milk",
  "cream cheese",
  "sour cream",
  "heavy cream",
  "whipping cream",
  "ice cream",
  "peanut butter",
  "triple sec",
  "sour mix",
  "sparkling wine",
  /*
   * Flavoured salts are their own jar (32j): with salt assumed on hand, a
   * Bloody Mary's celery salt must not come for free.
   */
  "celery salt",
  "garlic salt",
  "onion salt",
  "seasoned salt",
]);

/**
 * Different words for the same thing, rewritten before anything else. The
 * pattern sees the text folded, apostrophes gone and punctuation spaced
 * (`confectioners' sugar` is `confectioners sugar`), before singulars.
 *
 * Food first (32j): British and American names, and the spellings people
 * type. `bicarbonate of soda` must be read before the bare-`soda` rule below
 * turns it into soda water. `chile` stays as written — "ancho chile" is a
 * pepper the drinks name that way — and only `chilli`/`chilies` fold to
 * `chili`.
 */
const SYNONYMS: [RegExp, string][] = [
  [/\b(?:scallions?|spring onions?)\b/g, "green onion"],
  [/\b(?:fresh coriander|coriander (?:leaf|leaves))\b/g, "cilantro"],
  [/\b(?:garbanzo beans?|garbanzos?|chick peas?)\b/g, "chickpea"],
  [/\b(?:confectioners?|powdered|icing) sugar\b/g, "powdered sugar"],
  [/\b(?:caster|castor) sugar\b/g, "superfine sugar"],
  [/\bcourgettes?\b/g, "zucchini"],
  [/\baubergines?\b/g, "eggplant"],
  [
    /\b(?:heavy whipping cream|double cream|whipping cream|thickened cream)\b/g,
    "heavy cream",
  ],
  [/\b(?:minced beef|beef mince)\b/g, "ground beef"],
  [/\bhamburger(?: meat)?\b(?! buns?\b| rolls?\b| patt)/g, "ground beef"],
  [/\b(?:sweet peppers?|capsicums?)\b/g, "bell pepper"],
  [/\bcorn starch\b/g, "cornstarch"],
  [/\brocket\b/g, "arugula"],
  [/\bprawns?\b/g, "shrimp"],
  [
    /\b(?:bicarbonate of soda|bicarb soda|bicarb|sodium bicarbonate)\b/g,
    "baking soda",
  ],
  [/\b(?:chillies|chilies|chillis|chilli)\b/g, "chili"],
  [/\byoghurts?\b/g, "yogurt"],
  /* `half-and-half` and `half & half` (35b): the `&` is a space by now. */
  [/\bhalf (?:and )?half\b/g, "half and half"],
  [/\bevoo\b/g, "extra virgin olive oil"],
  [/\bclub soda\b/g, "soda water"],
  [/\bsparkling (?:mineral )?water\b/g, "soda water"],
  [/\bseltzer(?: water)?\b/g, "soda water"],
  [/\bcarbonated water\b/g, "soda water"],
  /*
   * A bare "soda" is soda water; a *flavoured* one is its own bottle. The
   * fruit list joined at 27c, when "grapefruit soda" came out as
   * `grapefruit soda water` and so matched an inventory's soda water.
   */
  [
    /(?<!\b(?:baking|cream|caustic|lemon lime|orange|grape|grapefruit|lemon|lime|cherry|ginger|pineapple|mango|raspberry|strawberry|peach|apple|pear|italian|of) )\bsoda\b(?! water)/g,
    "soda water",
  ],
  [/\btonic\b(?! water)/g, "tonic water"],
];

/** Not alcohol-free: "virgin" is left alone on purpose (olive oil). */
const NA_RE =
  /\b(?:non ?alcoholic|nonalcoholic|alcohol ?free|zero ?proof|de ?alcoholi[sz]ed|na)\b/g;

/** Words kept as they are by `singular`. */
const INVARIABLE = new Set([
  "bitters",
  "molasses",
  "swiss",
  "schnapps",
  "grits",
  "oats",
  "greens",
  "series",
]);
const IRREGULAR: Record<string, string> = {
  leaves: "leaf",
  halves: "half",
  loaves: "loaf",
  cookies: "cookie",
  pies: "pie",
  brownies: "brownie",
  smoothies: "smoothie",
};

/** Single words too vague to stand for a longer name: `syrup` ≠ `lavender syrup`. */
const GENERIC_HEADS = new Set([
  "syrup",
  "juice",
  "liqueur",
  "liquor",
  "spirit",
  "mix",
  "sauce",
  "tea",
  "oil",
  "extract",
  "powder",
  "zest",
  "peel",
  "water",
]);

/** Always on hand. */
const STAPLES = new Set(["water", "ice", "ice cube", "ice water", "tap water"]);

/** A heading that makes everything under it optional. */
const OPTIONAL_HEADING =
  /\b(?:optional|garnish(?:es)?|to serve|for serving|serving|to finish|extras?)\b/i;

// --- words -----------------------------------------------------------------

/** Naive, and consistent — which is all matching needs: both sides go through it. */
export function singular(word: string): string {
  if (word.length < 4 || INVARIABLE.has(word)) return word;
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(?:ch|sh|x|ss|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * The key an alias is compared by: folded, punctuation gone, apostrophes
 * dropped — `St. Elder` and `st elder` are one key, `Matteo's` is `matteos`.
 */
export function aliasKey(text: string): string {
  return fold(text)
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Turn a name into words. The one pipeline both a recipe line and an
 * inventory item go through.
 */
export function toName(text: string): IngredientName {
  let na = false;
  let folded = fold(stripMarkup(text))
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  folded = folded.replace(NA_RE, () => {
    na = true;
    return " ";
  });
  folded = folded.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of SYNONYMS) {
    folded = folded.replace(pattern, replacement);
  }
  /*
   * Compounds are paired *before* descriptive words are dropped (27c): `hot`
   * is descriptive in "hot water" and half the name in "hot sauce". A word a
   * compound claims is kept whatever list it is on; the rest are filtered.
   */
  const raw = folded.split(" ").filter((word) => word && !/^\d+$/.test(word));
  const paired: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const pair =
      i + 1 < raw.length ? `${singular(raw[i])} ${singular(raw[i + 1])}` : "";
    if (pair && COMPOUNDS.has(pair)) {
      paired.push(pair);
      i++;
    } else if (!DESCRIPTIVE.has(raw[i])) {
      paired.push(singular(raw[i]));
    }
  }
  /* Connecting words left at the edges by the cuts above say nothing. */
  while (paired.length > 1 && /^(?:of|and|the|a|an|with)$/.test(paired[0])) {
    paired.shift();
  }
  while (
    paired.length > 1 &&
    /^(?:of|and|or|the|a|an|with)$/.test(paired[paired.length - 1])
  ) {
    paired.pop();
  }
  /*
   * A second pass for pairs a descriptive word sat between: "egg, large
   * white" is `egg large white` before the cut and `egg white` after it, and
   * the old order (cut, then pair) paired it — so this keeps doing so.
   */
  const words: string[] = [];
  for (let i = 0; i < paired.length; i++) {
    const pair = `${paired[i]} ${paired[i + 1]}`;
    if (i + 1 < paired.length && COMPOUNDS.has(pair)) {
      words.push(pair);
      i++;
    } else {
      words.push(paired[i]);
    }
  }
  return { words, na };
}

/** How a name reads back: `lime juice`, `aperitif (non-alcoholic)`. */
export function nameLabel(name: IngredientName): string {
  const label = name.words.join(" ");
  return name.na ? `non-alcoholic ${label}` : label;
}

/** A stable key for a name: equal names, equal keys. */
export function nameKey(name: IngredientName): string {
  return `${name.words.join(" ")}${name.na ? "@na" : ""}`;
}

/** What a requirement reads as: `lemon juice or lime juice`. */
export function requirementLabel(requirement: Requirement): string {
  return requirement.alternatives.map(nameLabel).join(" or ");
}

// --- lines -----------------------------------------------------------------

/** Undo the two kinds of markup a stored line can carry. */
function stripMarkup(text: string): string {
  return text
    .replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&amp;/g, "&");
}

/** Split `text` at depth-0 parentheses: the outside, and each group's inside. */
function splitParentheses(text: string): { outside: string; groups: string[] } {
  let outside = "";
  const groups: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") {
      if (depth > 0) current += character;
      depth += 1;
    } else if (character === ")" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        groups.push(current);
        current = "";
        outside += " ";
      } else {
        current += character;
      }
    } else if (depth > 0) {
      current += character;
    } else {
      outside += character;
    }
  }
  if (current) groups.push(current);
  return { outside: outside.replace(/\s+/g, " ").trim(), groups };
}

/** The index of the first comma outside parentheses, or -1. */
function topLevelComma(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) return i;
  }
  return -1;
}

const SUCH_AS_RE = /\b(?:such as|like|e\.g\.?)\s+([^,()]+)/i;

/**
 * Remarks in parentheses that say how much or how, never what (32j). Gone
 * before the amount is read: `1 tbsp. (or more) lemon juice` kept its unit
 * because a parenthesis after it reads as "the unit is the name".
 */
const NOISE_PARENTHESES_RE =
  /\(\s*(?:or (?:more|less|so)|(?:or |adjust )?to taste|divided|(?:or |more )?as needed|softened|melted|(?:at )?room temperature)\s*\)/gi;

/**
 * How a cut of meat comes, written before the name and often with a comma
 * of its own — `2 boneless, skinless chicken thighs` read `boneless` (32j).
 */
const BONE_AND_SKIN_RE =
  /\b(?:bone[\s-]?in|skin[\s-]?on|boneless|skinless)\b\s*,?\s*/gi;

/**
 * What a line says after the name without a comma (32j): `onion cut into
 * wedges`, `butter at room temperature`, `flour plus more for kneading`. Cut
 * only after a letter, so a leading "melted butter" keeps its name (and
 * `DESCRIPTIVE` drops the word).
 */
const TRAILING_PREP_RE =
  /(?<=\p{L})\s+(?:cut into|cut in|for serving|to serve|(?:or |adjust )?to taste|plus (?:more|extra)|divided|(?:at )?room temperature|softened|melted|peeled and|trimmed and|or (?:more|less)|(?:or |if |as )needed)\b.*$/iu;

/** `ghee or margarine or more butter`: the last choice is butter. */
const OR_MORE_NAME_RE = /\bor more\s+(?=\p{L})(?!as\b|if\b|to\b|for\b)/giu;

/**
 * The choices inside `(or …)`, without the remarks that ride along (32j):
 * `(or margarine, or more butter)` is margarine or butter, `(or any cooking
 * oil, divided)` is any cooking oil, `(or more as needed)` is nothing.
 */
function alternativeParts(text: string): string[] {
  return text
    .split(/\s*,\s*(?:or\s+)?/)
    .map((part) =>
      part
        .replace(/^more\s+(?=\p{L})(?!as\b|if\b|to\b|for\b)/iu, "")
        .replace(TRAILING_PREP_RE, "")
        .trim(),
    )
    .filter(
      (part) =>
        part &&
        !/^(?:more|less|so|divided|as needed|if needed|to taste)\b/i.test(part),
    );
}

/** `salt and pepper`, `kosher salt & black pepper`: two things to have. */
const SALT_AND_PEPPER_RE = /^(.*?\bsalt)\s+(?:and|&)\s+(.*?\bpepper)$/i;

/** Strip the quantity, any parenthetical measure after it, the unit, and `of`. */
function stripAmount(text: string): string {
  let rest = text;
  let hadQuantity = false;
  for (let guard = 0; guard < 3; guard++) {
    const match = QUANTITY_RE.exec(rest);
    if (!match || match[0].length === 0) break;
    hadQuantity = true;
    rest = rest.slice(match[0].length);
    /* `(14 oz)` / `(420ml)` between the number and the name. */
    rest = rest.replace(/^\(+[^()]*\d[^()]*\)+\s*/, "");
  }

  if (hadQuantity) {
    /*
     * A unit, then (27c) any `plus|and <qty> <unit>` that follows it — "1/2 cup
     * plus 2 tablespoons white sugar" was `plus tablespoon white sugar`. Only
     * a quantity *and* a unit continue the chain, so "1 cup salt and 2 eggs"
     * keeps its second ingredient for the comma/alternative steps to see.
     */
    for (let guard = 0; guard < 4; guard++) {
      const unit = UNIT_RE.exec(rest);
      if (!unit) break;
      let after = rest.slice(unit[0].length);
      /* "1 bottle or can tomato juice": either container (27c). */
      const orUnit = UNIT_OR_RE.exec(after);
      if (orUnit) after = after.slice(orUnit[0].length);
      const altUnit = UNIT_ALT_RE.exec(after);
      if (altUnit) after = after.slice(altUnit[0].length);
      after = after
        .replace(/^\(+[^()]*\d[^()]*\)+\s*/, "")
        .replace(/^of\s+/i, "");
      /* "4 cloves": the unit *is* the name. */
      if (!after.trim() || /^[,(]/.test(after.trim())) break;
      rest = after;

      const chain = /^(?:plus|and|\+)\s+/i.exec(rest);
      if (!chain) break;
      const more = QUANTITY_RE.exec(rest.slice(chain[0].length));
      if (!more || more[0].length === 0) break;
      const next = rest.slice(chain[0].length + more[0].length);
      if (!UNIT_RE.test(next)) break;
      rest = next;
    }
  } else {
    const unitOf = UNIT_OF_RE.exec(rest);
    if (unitOf) rest = rest.slice(unitOf[0].length);
  }

  /* `juice of 2 limes` → `limes juice`, `zest of 1 lemon` → `lemon zest`. */
  const partOf = /^(juice|zest|peel|rind|twist)\s+of\s+(.+)$/i.exec(rest);
  if (partOf) {
    const [, part, whole] = partOf;
    rest = `${stripAmount(whole)} ${part}`;
  }
  return rest.trim();
}

/**
 * Split on ` or `, ` and/or ` and a slash between words; never on ` and `
 * ("salt and pepper" is one thing to have).
 */
function splitAlternatives(text: string): string[] {
  return text
    .split(/\s+(?:and\/or|or)\s+|(?<=\p{L})\s*\/\s*(?=\p{L})/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Single words that name a whole ingredient, so they never borrow a tail:
 * "honey or maple syrup" is honey, not `honey syrup` (27c).
 */
const STANDALONE = new Set([
  "honey",
  "agave",
  "sugar",
  "molasses",
  "salt",
  "milk",
  "cream",
  "butter",
  "egg",
  "coffee",
  "espresso",
  "ice",
  "water",
]);

/**
 * `lemon or lime juice` names two juices: a one-word left part inherits what
 * follows the right part's first word.
 *
 * Not when the left part is already a whole name (27c): a compound ("simple
 * syrup or maple syrup" was `simple syrup syrup`) or a `STANDALONE` word
 * ("honey or maple syrup" was `honey syrup`). And the borrowed tail drops the
 * left word itself, so "vodka or citron vodka" stays `vodka` and "sweet or
 * semi-sweet red vermouth" reads `sweet red vermouth`, not `sweet sweet …`.
 */
function inheritTails(names: IngredientName[]): IngredientName[] {
  const out = names.map((name) => ({ ...name, words: [...name.words] }));
  for (let i = out.length - 2; i >= 0; i--) {
    const next = out[i + 1];
    const [left] = out[i].words;
    if (
      out[i].words.length !== 1 ||
      next.words.length < 2 ||
      left.includes(" ") ||
      STANDALONE.has(left)
    ) {
      continue;
    }
    out[i].words.push(...next.words.slice(1).filter((word) => word !== left));
  }
  return out;
}

function requirement(
  index: number,
  text: string,
  alternatives: IngredientName[],
  aliases: string[],
  optional: boolean,
  loose = false,
): Requirement {
  const seen = new Set<string>();
  const kept = alternatives.filter((name) => {
    const key = nameKey(name);
    if (name.words.length === 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const named = aliases.filter((alias) => aliasKey(alias));
  return {
    line: index,
    text,
    alternatives: kept,
    aliases: named,
    aliasKeys: named.map(aliasKey),
    optional,
    staple: kept.some((name) => STAPLES.has(name.words.join(" "))),
    loose,
  };
}

/**
 * One ingredient line, as what it requires. A heading yields nothing; an
 * infusion yields the spirit and, loosely, its flavour.
 */
export function parseIngredientLine(
  line: string,
  meta: LineMeta = {},
): Requirement[] {
  const index = meta.index ?? 0;
  let text = normalizeIngredientText(stripMarkup(line))
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || meta.heading || detectHeading(text)) return [];

  // 2. Optional.
  let optional = !!meta.optionalSection;
  const prefix =
    /^(?:optional|garnish(?:es)?|to serve|for serving)\s*:\s*/i.exec(text);
  if (prefix) {
    optional = true;
    text = text.slice(prefix[0].length);
  }
  /* "(plus whole leaves for garnish)" is a remark about a required line; only
   * an explicit "optional" counts from inside parentheses. */
  const unbracketed = splitParentheses(text).outside;
  if (
    /\boptional\b/i.test(text) ||
    /(?<!more )\bto taste\b/i.test(unbracketed) ||
    /\bfor (?:garnish(?:ing)?|serving|decoration|dusting)\b/i.test(unbracketed)
  ) {
    optional = true;
  }

  // 3–4. Remarks that say nothing about what (32j), then quantity, unit, `of`.
  text = text
    .replace(NOISE_PARENTHESES_RE, " ")
    .replace(BONE_AND_SKIN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = stripAmount(text);

  // 5. Comma: the head is the name; the tail may say "such as X".
  const aliases: string[] = [];
  const comma = topLevelComma(text);
  let head = comma >= 0 ? text.slice(0, comma) : text;
  const tail = comma >= 0 ? text.slice(comma + 1) : "";
  for (const part of [head, tail]) {
    const suchAs = SUCH_AS_RE.exec(splitParentheses(part).outside);
    if (suchAs) aliases.push(suchAs[1].trim());
  }
  head = head.replace(/\s*\b(?:such as|like|e\.g\.?)\s+[^,()]*/i, " ");
  head = head.replace(TRAILING_PREP_RE, "");

  // 6. Parentheticals: brands become aliases, `(or X)` an alternative.
  const { outside, groups } = splitParentheses(head);
  const alternativeTexts: string[] = [];
  for (const raw of groups) {
    const group = raw.replace(/^[\s(]+|[\s)]+$/g, "");
    if (!group) continue;
    const or = /^or\s+(?:make\s+)?(?:my\s+|your\s+|some\s+|a\s+)?(.+)$/i.exec(
      group,
    );
    if (or) {
      alternativeTexts.push(...alternativeParts(or[1]));
    } else if (
      !/\d/.test(group) &&
      /* `(minced)`, `(chopped)` describe; they don't name. */
      toName(group).words.length > 0 &&
      !/^(?:about|approx|optional|see|plus|from|for|if|i|we|use|substitute|preferably|divided|at|to|any|homemade|store|or|and)\b/i.test(
        group,
      )
    ) {
      aliases.push(group);
    }
  }

  // 7. Infusions.
  const infusion = /^(.+?)[\s-]+infused\s+(.+)$/i.exec(outside);
  if (infusion) {
    const [, flavour, base] = infusion;
    return [
      requirement(index, line, [toName(base)], aliases, optional),
      requirement(
        index,
        line,
        [toName(flavour.replace(/-/g, " "))],
        [],
        optional,
        true,
      ),
    ].filter((req) => req.alternatives.length > 0);
  }

  // 8. Salt and pepper: the one `and` that names two things (32j).
  const saltAndPepper = SALT_AND_PEPPER_RE.exec(outside);
  if (saltAndPepper && alternativeTexts.length === 0) {
    return [saltAndPepper[1], saltAndPepper[2]]
      .map((part) =>
        requirement(index, line, [toName(part)], aliases, optional),
      )
      .filter((req) => req.alternatives.length > 0);
  }

  // 9. Alternatives, then words.
  const names = inheritTails(
    splitAlternatives(outside.replace(OR_MORE_NAME_RE, "or ")).map((part) =>
      toName(stripAmount(part)),
    ),
  );
  for (const alternative of alternativeTexts) {
    names.push(toName(stripAmount(alternative)));
  }
  const result = requirement(index, line, names, aliases, optional);
  return result.alternatives.length > 0 ? [result] : [];
}

/**
 * A whole ingredient list. `headings` is the index's `ingredientHeadings`
 * when it has one; `detectHeading` catches the rest (and is all an index
 * built before 25c offers). A heading that reads as garnish, optional or
 * to-serve makes the lines under it optional.
 */
export function parseIngredientList(
  lines: string[],
  headings?: number[],
): Requirement[] {
  const headingSet = new Set(headings ?? []);
  const out: Requirement[] = [];
  let optionalSection = false;
  lines.forEach((line, index) => {
    const clean = normalizeIngredientText(stripMarkup(line)).trim();
    if (!clean) return;
    if (headingSet.has(index) || detectHeading(clean)) {
      optionalSection = OPTIONAL_HEADING.test(clean);
      return;
    }
    out.push(...parseIngredientLine(line, { index, optionalSection }));
  });
  return out;
}

/** Is this single word too vague to stand for a longer name? */
export function isGenericHead(word: string): boolean {
  return GENERIC_HEADS.has(word);
}

// --- close matches (32j) ---------------------------------------------------
//
// The data behind `makeable.ts`'s close tier: names that would do in a pinch.
// Written as text and run through `toName` here, at the end of the module, so
// the lists read as people write them and still meet lines word for word.

const words = (name: string): string[] => toName(name).words;

/**
 * Substitutes, either way round. A member names an item or a line when it is
 * the name's tail: `olive oil` names `extra virgin olive oil`, `onion` names
 * `red onion`.
 */
export const CLOSE_GROUPS: string[][][] = [
  [
    "olive oil",
    "vegetable oil",
    "canola oil",
    "neutral oil",
    "cooking oil",
    "sunflower oil",
    "safflower oil",
    "avocado oil",
    "grapeseed oil",
    "peanut oil",
    "corn oil",
  ],
  ["shallot", "onion"],
  ["butter", "margarine", "ghee"],
  ["broth", "stock", "bouillon"],
  ["sour cream", "yogurt", "creme fraiche"],
].map((group) => group.map(words));

/** One way only: whoever has eggs has egg whites, not the reverse. */
export const CLOSE_PAIRS: [string[], string[]][] = [
  ["egg", "egg white"],
  ["egg", "egg yolk"],
].map(([from, to]) => [words(from), words(to)]);

/**
 * Last words that name different things in different names, so sharing one
 * is no sign of closeness: black pepper is not bell pepper, black beans are
 * not green beans.
 */
export const CLOSE_HEAD_EXCLUDED = new Set([
  "pepper",
  "bean",
  "leaf",
  "flake",
  "paste",
  "chip",
  "seed",
  "seasoning",
  "salt",
  "spice",
  "bitters",
  "vermouth",
]);

/**
 * Kinds a line may carry that a shorter name on hand stands in for:
 * `parmesan` for `parmesan cheese`, `garlic` for `garlic powder`, `basmati`
 * for `basmati rice`. One way only (32j review): garlic powder on hand is no
 * stand-in for fresh garlic, almond extract none for sliced almonds. Only
 * kinds whose modifier is rarely an ingredient of its own: `vinegar`,
 * `wine`, `noodle`, `squash` and `seed` are out (rice ≠ rice vinegar,
 * spaghetti ≠ spaghetti squash), and so are `pepper` (lemon ≠ lemon
 * pepper, and it names different things — see `CLOSE_HEAD_EXCLUDED`),
 * `extract` and `lettuce` (butter ≠ butter lettuce).
 */
export const CLASS_NOUNS = new Set([
  "cheese",
  "chili",
  "rice",
  "pasta",
  "powder",
]);

/** The one kind that also works the other way: `parmesan cheese` for `parmesan`. */
export const CLASS_NOUNS_EITHER_WAY = new Set(["cheese"]);

/**
 * Words one edit apart that are different things, sorted pairs joined with
 * `|`. The typo rule also needs one side to be unusual in the corpus, so this
 * only catches the pairs that guard misses.
 */
export const CONFUSABLE_WORDS = new Set(
  [
    ["cherry", "sherry"],
    ["butter", "bitter"],
    ["mustard", "custard"],
    ["coffee", "toffee"],
    ["tomato", "potato"],
    ["paste", "pasta"],
    ["chive", "chile"],
    ["steak", "steam"],
    ["lager", "later"],
    ["cider", "rider"],
    ["fresco", "fresno"],
  ].map((pair) => [...pair].sort().join("|")),
);
