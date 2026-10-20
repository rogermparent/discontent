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
 * counts what a pantry makes of the real corpus. 43n read range and dash
 * shapes from a survey of every line (`tidyLine`, `skipAfterUnit`) and added
 * the curated `NAME_SYNONYMS` / `NAME_DESCRIPTORS`;
 * `measure-ingredient-dupes.ts` lists the near-duplicates still left.
 *
 * Pure, and safe in the browser: the `/make` page runs it over the whole
 * corpus on the client.
 */
import { fold } from "../components/SearchForm/queryLanguage";
import { detectHeading } from "./detectHeading";
import {
  joinMixedNumbers,
  NUMBER,
  QUANTITY_RE,
  UNIT_ALT_RE,
  UNIT_OF_RE,
  UNIT_OR_RE,
  UNIT_PATTERN,
  UNIT_RE,
} from "./ingredientGrammar";
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
  /**
   * The line opened with an `OR:` label (38d): it is another way to meet the
   * line before it, not a thing of its own. `parseIngredientList` folds it
   * into that line's alternatives.
   */
  orPrevious?: boolean;
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
//
// Units, numbers and quantity words live in `ingredientGrammar` (35a), shared
// with `ingredientAmount`.

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
  [/\b(?:garbanzos? beans?|garbanzos?|chick peas?)\b/g, "chickpea"],
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
  /*
   * Agave spirits name their age after the spirit as often as before it
   * (38a, Da1): "tequila blanco" is "blanco tequila", "mezcal joven" is
   * "joven mezcal". Rows for the known words rather than a word-order rule,
   * which would also make "milk chocolate" a "chocolate milk" and "cane
   * sugar" "sugar cane".
   */
  [
    /\b(tequila|mezcal) (blanco|plata|silver|gold|joven|reposado|extra anejo|anejo)\b/g,
    "$2 $1",
  ],
];

/**
 * Two names, one ingredient (43n): the curated table behind Make, the
 * shopping list's merge and step matching — all three read names through
 * `toName`, so a row here merges them everywhere at once. Each row is a
 * pattern over the folded text (as `SYNONYMS` sees it, matched as whole
 * words) and what it becomes; `editor/scripts/measure-ingredient-dupes.ts`
 * counts each row's lines and lists the near-duplicates still left.
 *
 * Only names that buy the same thing. Varieties that matter stay apart —
 * Italian parsley is not a synonym of parsley (`parsley` on hand still
 * meets it, as a name's tail does), nor dark brown sugar of brown sugar.
 * A named cheese gains its `cheese` ("feta" is "feta cheese"), so a step
 * that says "the cheese" still finds the line.
 */
export const NAME_SYNONYMS: readonly (readonly [string, string])[] = [
  ["mayo", "mayonnaise"],
  ["dijon(?! mustard)", "dijon mustard"],
  ["worcestershire(?! sauce)", "worcestershire sauce"],
  /* Not "cayenne peppers": the pepper is already there (43n review). */
  ["cayenne(?: pepper powder| powder)?(?! peppers?\\b)", "cayenne pepper"],
  ["(?:ap|plain) flour", "all purpose flour"],
  /* One plant, two names; plain `parsley` stays its own (curly or either). */
  ["(?:italian )?flat leaf parsley", "italian parsley"],
  ["(?:granulated white|white granulated|white) sugar", "granulated sugar"],
  ["parm|parmigiano(?: reggiano)?", "parmesan"],
  [
    "(feta|cheddar|mozzarella|ricotta|gruyere|parmesan|pecorino romano|pecorino|provolone|cotija|monterey jack|pepper jack|gouda|fontina|asiago|manchego|halloumi|havarti|muenster|mascarpone)\\b(?! cheese| rind| crisp| romano| jack| style| salata| reggiano)",
    "$1 cheese",
  ],
  /* What the recipe means by the plain name anyway. */
  ["full fat", ""],
  ["plain(?= (?:greek |nonfat |low fat |whole milk |milk )?yogurt)", ""],
  ["unsweetened(?= (?:dutch process |natural )?cocoa)", ""],
  ["dry(?= (?:white|red) wine)", ""],
  ["(?:white distilled|distilled white|distilled) vinegar", "white vinegar"],
  ["instant dry yeast", "instant yeast"],
  ["active yeast", "active dry yeast"],
  /* The spice jar: ground is how it's sold. Not ginger, mustard, cloves,
   * coriander or thyme, where the bare name is often another thing. */
  [
    "ground(?= (?:black pepper|white pepper|cinnamon|nutmeg|cumin|allspice|cardamom|turmeric|cayenne pepper)\\b)",
    "",
  ],
];

/**
 * Words that describe without changing what you buy (43n), dropped like
 * `DESCRIPTIVE`'s: "mild feta cheese" is feta cheese (as "hot Italian
 * sausage" was already Italian sausage), "uncooked rice" is rice. Not
 * `cooked`: two cups of cooked rice and a cup of rice don't add up on a
 * shopping list.
 */
export const NAME_DESCRIPTORS: readonly string[] = ["mild", "uncooked"];

const NAME_SYNONYM_RES: [RegExp, string][] = NAME_SYNONYMS.map(([from, to]) => [
  new RegExp(`\\b(?:${from})\\b`, "g"),
  to,
]);

/**
 * Every row of a table as one pattern, tested once before the rows run
 * (43n review: `toName` is the parser's hot path, and most names meet no
 * row). A row can only fire on text an earlier row wrote, so text no row
 * meets is left as it is.
 */
function anyRow(rows: readonly (readonly [RegExp, string])[]): RegExp {
  return new RegExp(rows.map(([pattern]) => `(?:${pattern.source})`).join("|"));
}
const ANY_SYNONYM_RE = anyRow(SYNONYMS);
const ANY_NAME_SYNONYM_RE = anyRow(NAME_SYNONYM_RES);
const NAME_DESCRIPTOR_SET = new Set(NAME_DESCRIPTORS);

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
  if (ANY_SYNONYM_RE.test(folded)) {
    for (const [pattern, replacement] of SYNONYMS) {
      folded = folded.replace(pattern, replacement);
    }
  }
  if (ANY_NAME_SYNONYM_RE.test(folded)) {
    for (const [pattern, replacement] of NAME_SYNONYM_RES) {
      folded = folded.replace(pattern, replacement);
    }
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
    } else if (!DESCRIPTIVE.has(raw[i]) && !NAME_DESCRIPTOR_SET.has(raw[i])) {
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

/**
 * A name without its leading `canned` (43n, Dn2): what Make matches and
 * offers by, so "1 can black beans" is met by black beans on hand and
 * suggests "black bean". The shopping list keeps the word.
 */
export function withoutCanned(name: IngredientName): IngredientName {
  return name.words[0] === "canned" && name.words.length > 1
    ? { ...name, words: name.words.slice(1) }
    : name;
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

/**
 * A line that opens with `OR:` (38d): Sally's "OR: ¼ cup green sanding sugar
 * and ¼ cup red sanding sugar" under "½ cup granulated sugar" — the other way
 * to make the line before it.
 */
export const OR_LABEL_RE = /^\s*or\s*:\s*/i;

/** The line without its `OR:` label; `null` when it has none. */
export function stripOrLabel(text: string): string | null {
  const label = OR_LABEL_RE.exec(text);
  return label ? text.slice(label[0].length) : null;
}

/** Undo the two kinds of markup a stored line can carry. */
export function stripMarkup(text: string): string {
  if (!/[<[&]/.test(text)) return text;
  return text
    .replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&amp;/g, "&");
}

/**
 * A stored line as the line readers (`parseIngredientLine`, `parseAmount`)
 * see it: markup undone, `normalizeIngredientText`, then the combining marks
 * NFKD split off dropped (38a). Left in, "añejo" is `an` + a mark + `ejo`,
 * and JS `\b` sees a word end after `an` — the leading-article cut read
 * "2 oz añejo tequila" as `ejo tequila`, and the amount reader read
 * "añejo tequila, to rinse" as one of something. Names are folded later
 * anyway; an amount has no accents to lose.
 */
export function readableLine(line: string): string {
  return normalizeIngredientText(stripMarkup(line)).replace(/\p{M}+/gu, "");
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
  /(?<=[\p{L})])\s+(?:cut into|cut in|for serving|to serve|(?:or |adjust )?to taste|(?:plus|\+)\s*(?:more|extra)|divided|(?:at )?room temperature|softened|melted|(?:peeled|trimmed|grated|chopped|diced|sliced|minced|squeezed) and|(?:beaten|whisked|mixed) with|or (?:more|less)|(?:or |if |as )needed)\b.*$/iu;

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
        /* `(or seasoned salt), plus more`, `(… - Note 5)`, `(or chicken), optional` (43n). */
        !/^(?:more|less|so|divided|as needed|if|to taste|plus|optional|note|see|combination)\b/i.test(
          part,
        ),
    );
}

/** `salt and pepper`, `kosher salt & black pepper`: two things to have. */
const SALT_AND_PEPPER_RE = /^(.*?\bsalt)\s+(?:and|&)\s+(.*?\bpepper)$/i;

/** `(14 oz)` / `(420ml)` / `(1/4)`: a bracket with a number in it. */
const MEASURE_BRACKET_RE = /^\(+[^()]*\d[^()]*\)+\s*/;

/**
 * What a measure comes in, after it (43n): `15 oz can black beans`, `1
 * 15oz/440g can pinto beans`, `6-ounce can of tomato paste`, `1lb block
 * mozzarella`. Only when a name follows — "1 can" alone is a can.
 */
const CONTAINER_AFTER_RE =
  /^(?:can|tin|jar|bottle|package|pkg|pack|packet|envelope|bag|box|carton|container|block|piece|knob|bar(?!\s*spoon))(?:e?s)?\.?\s+(?:of\s+)?(?=\p{L}|\()/iu;

/**
 * A bracket after a unit that says how the cup is filled or what it is, not
 * what goes in it (43n): `1 1/2 cups (packed) brown sugar`, `15 ounces (can)
 * refried beans`. Its length, or 0.
 */
function remarkBracket(text: string): number {
  const bracket = /^\(+([^()\d]*)\)+\s*/.exec(text);
  if (!bracket) return 0;
  const inner = bracket[1].trim();
  const unit = UNIT_RE.exec(inner);
  /* `(drained and rinsed)` leaves only its `and`. */
  const remark =
    !inner ||
    (unit !== null && unit[0].trim().length === inner.length) ||
    toName(inner).words.every((word) => /^(?:and|or|of|the|with)$/.test(word));
  return remark ? bracket[0].length : 0;
}

/**
 * A second measure right after the first, and its length (43n): the other
 * end of a range (`1/2 cup to 1 cup`, `1/2 cup to 2/3 cup`) or the same
 * amount another way (`50g or 1/2c`, `75g or about 1/3c`, `100g or 2 large
 * carrots`, `20g or 1/4 of a red onion`). 0 when none. A bare quantity
 * counts only after `or`: the line names the thing either way.
 */
function secondMeasure(text: string): number {
  const connector = /^(?:[-–—]|to\b|or\b)\s*/i.exec(text);
  if (!connector) return 0;
  let at = connector[0].length;
  const quantity = QUANTITY_RE.exec(text.slice(at));
  if (!quantity || quantity[0].length === 0) return 0;
  at += quantity[0].length;
  /* `or 1 15-ounce can`: a size after the count. */
  const size = QUANTITY_RE.exec(text.slice(at));
  if (size && /\d/.test(size[0])) at += size[0].length;
  at += MEASURE_BRACKET_RE.exec(text.slice(at))?.[0].length ?? 0;
  const unit = UNIT_RE.exec(text.slice(at));
  if (unit) return at + unit[0].length;
  if (!/^or\b/i.test(connector[0]) || !/\d/.test(quantity[0])) return 0;
  return at + (/^of\s+(?:an?\s+)?/i.exec(text.slice(at))?.[0].length ?? 0);
}

/** What `skipAfterUnit` walked past that the name keeps a trace of. */
interface AfterUnit {
  text: string;
  /** A can or tin was the measure, or came after it. */
  canned: boolean;
  /** A second measure joined by `or` ("15 ounce can or 260g …"). */
  orMeasure: boolean;
}

/**
 * After a unit: a second container (`or can`, 27c), the amount in other
 * units (`/1.5kg`, 32j), brackets, a range's other end, a container and
 * `of` (43n) — walked until nothing more comes off.
 */
function skipAfterUnit(text: string): AfterUnit {
  let after = text;
  let canned = false;
  let orMeasure = false;
  /* "1 bottle or can tomato juice": either container (27c). */
  const orUnit = UNIT_OR_RE.exec(after);
  if (orUnit) after = after.slice(orUnit[0].length);
  for (let guard = 0; guard < 4; guard++) {
    const before = after;
    const altUnit = UNIT_ALT_RE.exec(after);
    if (altUnit) after = after.slice(altUnit[0].length);
    const bracket = MEASURE_BRACKET_RE.exec(after);
    if (bracket) {
      after = after.slice(bracket[0].length);
      /* `55g (1/4) cup white sugar`: the bracket's unit, written after it. */
      const unit = UNIT_RE.exec(after);
      if (unit && /\p{L}/u.test(after.slice(unit[0].length))) {
        after = after.slice(unit[0].length);
        /* `1 oz. (14-oz.) can crushed tomatoes`. */
        if (CAN_RE.test(unit[0])) canned = true;
      }
    }
    const remark = remarkBracket(after);
    /* `15 ounces (can) refried beans`. */
    if (remark && CAN_BRACKET_RE.test(after)) canned = true;
    after = after.slice(remark);
    const second = secondMeasure(after);
    if (second && /^or\b/i.test(after)) orMeasure = true;
    after = after.slice(second);
    const container = CONTAINER_AFTER_RE.exec(after);
    if (container) {
      if (CAN_RE.test(container[0])) canned = true;
      after = after.slice(container[0].length);
    }
    after = after.replace(/^of\s+/i, "");
    if (after === before) break;
  }
  return { text: after, canned, orMeasure };
}

/** A can or tin, as a unit or a container. */
const CAN_RE = /^(?:can|tin)s?\b/i;
const CAN_BRACKET_RE = /^\(+\s*(?:can|tin)s?\s*\)/i;

/**
 * What comes in a can but isn't canned goods: a can's worth of water, a
 * tube of crescent dough, a can of whipped cream — and, unless the line
 * offers another measure, frozen juice concentrate.
 */
const NOT_CANNED_RE =
  /^(?:(?:cold|warm|hot)\s+)?(?:water|refrigerated|crescent|biscuit|whipped)\b/i;

/**
 * Words the canned choice can't also be: "15 ounce can or 260g drained
 * cooked black beans" offers canned black beans or cooked ones.
 */
const NOT_CANNED_WORDS_RE =
  /^(?:(?:drained|cooked|frozen|thawed|dried|fresh)\s+)+/i;

/**
 * Every can reads `canned X` (43n, Dn2): "28 oz can diced tomatoes", "1
 * (28 ounce) can crushed tomatoes", "1 can black beans", "15 ounces (can)
 * refried beans". The old names kept the word only where the can came after
 * a measure (`can tomato`), which kept those apart from fresh tomatoes on a
 * list and shelved them in the pantry; `canned tomato` does the same for
 * every shape and reads as people write it. Each choice before the first
 * comma is canned ("1 can corn or peas"); with a second measure joined by
 * `or` the line offers the canned thing or the other ("15 ounce can or 260g
 * drained cooked black beans", "1 can (drained) or 1 package of frozen
 * corn").
 */
function withCanned(text: string, orMeasure: boolean): string {
  if (!text || NOT_CANNED_RE.test(text)) return text;
  if (!orMeasure && /^frozen\b/i.test(text)) return text;
  const comma = topLevelComma(text);
  const head = comma >= 0 ? text.slice(0, comma) : text;
  const tail = comma >= 0 ? text.slice(comma) : "";
  if (!/\p{L}/u.test(splitParentheses(head).outside)) return text;
  const choices = (
    orMeasure ? head.replace(NOT_CANNED_WORDS_RE, "") : head
  ).replace(
    /(?<=^|\s|\()or\s+(?!(?:more|less|so|as|if|to|for)\b)(?=\p{L})/giu,
    "or canned ",
  );
  const canned = `canned ${choices}`;
  return orMeasure ? `${canned} or ${head}${tail}` : `${canned}${tail}`;
}

/**
 * Strip the quantity, any parenthetical measure after it, the unit, and `of`
 * — and after the unit, whatever `skipAfterUnit` walks past.
 */
function stripAmount(text: string): string {
  let rest = text;
  let hadQuantity = false;
  let canned = false;
  let orMeasure = false;
  for (let guard = 0; guard < 3; guard++) {
    const match = QUANTITY_RE.exec(rest);
    if (!match || match[0].length === 0) break;
    hadQuantity = true;
    rest = rest.slice(match[0].length);
    /* `(14 oz)` / `(420ml)` between the number and the name — and `2
     * (15-ounce cans) chickpeas` (43n). */
    rest = rest.replace(MEASURE_BRACKET_RE, (bracket) => {
      if (/\b(?:can|tin)s?\b/i.test(bracket)) canned = true;
      return "";
    });
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
      const after = skipAfterUnit(rest.slice(unit[0].length));
      /*
       * "4 cloves", "4 cloves (minced)": the unit *is* the name. A bracket
       * with a name after it is a remark (`4 lbs (meaty!) beef oxtail`, 43n).
       */
      const trimmed = after.text.trim();
      if (!trimmed || trimmed.startsWith(",")) break;
      if (/^\(+[^()]*\)+\s*(?:,|$)/.test(trimmed)) break;
      rest = after.text;
      canned ||= after.canned || CAN_RE.test(unit[0]);
      orMeasure ||= after.orMeasure;

      const chain = /^(?:plus|and|\+)\s+/i.exec(rest);
      if (!chain) break;
      const more = QUANTITY_RE.exec(rest.slice(chain[0].length));
      if (!more || more[0].length === 0) break;
      /* `1/2 cup plus 2 (150ml) tablespoons water` (43n). */
      const next = rest
        .slice(chain[0].length + more[0].length)
        .replace(MEASURE_BRACKET_RE, "");
      if (!UNIT_RE.test(next)) break;
      rest = next;
    }
  } else {
    const unitOf = UNIT_OF_RE.exec(rest);
    if (unitOf) {
      rest = rest.slice(unitOf[0].length);
      canned = CAN_RE.test(unitOf[0]);
    } else {
      /* "pinch salt", "dash bitters" (38d): a pinch with no "a" and no "of"
       * still names salt, so it merges with "2 tsp salt" on a list — and so
       * does "pinch or two chili flakes" (43n). */
      rest = rest.replace(
        /^(?:pinch(?:es)?|dash(?:es)?)(?:\s+or\s+two)?\s+(?=\p{L})/iu,
        "",
      );
    }
  }

  /* `juice of 2 limes` → `limes juice`, `zest of 1 lemon` → `lemon zest`,
   * and `zest 1 lemon` (43n). */
  const partOf =
    /^(juice|zest|peel|rind|twist)\s+(?:of\s+|(?=\d|(?:an?|one|half)\s))(.+)$/i.exec(
      rest,
    );
  if (partOf) {
    const [, part, whole] = partOf;
    rest = `${stripAmount(whole)} ${part}`;
  }
  rest = rest.trim();
  if (!canned) return rest;
  /* "2 cans 15 1/2 ounces each) beans": a size the can's bracket lost. */
  return withCanned(/^\d/.test(rest) ? stripAmount(rest) : rest, orMeasure);
}

/**
 * Split on ` or `, ` and/or ` and a slash between words; never on ` and `
 * ("salt and pepper" is one thing to have).
 */
function splitAlternatives(text: string): string[] {
  return (
    text
      /* `pinch stevia OR 2 tbsp sugar` (43n): any case. */
      .split(/\s+(?:and\/or|or)\s+|(?<=\p{L})\s*\/\s*(?=\p{L})/iu)
      .map((part) => part.trim())
      .filter(Boolean)
  );
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
  /* A leading `canned` is no part of the noun: "canned black or canned
   * pinto beans" lends `bean` as "black or pinto beans" does (43n). */
  const own = (words: string[]) =>
    words[0] === "canned" ? words.slice(1) : words;
  for (let i = out.length - 2; i >= 0; i--) {
    const mine = own(out[i].words);
    /* "cooked or canned chickpeas" still lends `chickpea`. */
    const theirs =
      mine === out[i].words ? out[i + 1].words : own(out[i + 1].words);
    const [left] = mine;
    if (
      mine.length !== 1 ||
      theirs.length < 2 ||
      left.includes(" ") ||
      STANDALONE.has(left) ||
      /* "Chambord or crème de mure" (43n): a tail that opens with a
       * connecting word is the rest of a name, not a noun to lend. */
      /^(?:de|di|du|del|la|le|of|the|and|with|en|au)$/.test(theirs[1])
    ) {
      continue;
    }
    out[i].words.push(...theirs.slice(1).filter((word) => word !== left));
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
 * Shapes a line's amount and name come in that the steps below can't read,
 * rewritten first (43n, from a survey of the real corpus):
 *
 * - `15-ounce`, `15- ounce` → `15 ounce` (as `parseAmount` reads them);
 * - `4 x 400g` → `4 400g`; `8ish` → `8`; `3/4c+1tbsp` → `3/4c + 1tbsp`;
 * - `200g-250g` → `200g - 250g`, so each end is read;
 * - `6 medium-to-large scallions` → `6 scallions`;
 * - a dash after a word with a space on either side is a comma —
 *   "fresh mint- chopped", "Italian parsley – chopped", "garbanzo beans- (2
 *   cans, …)", "olive oil — plus more for the pan" — unless `or` follows it
 *   ("ground beef -or ground lamb"). A hyphen between words is left alone:
 *   "red bell pepper-diced" reads `red bell pepper` already, and
 *   "semi-sweet" is one word.
 */
function tidyLine(text: string): string {
  /* Each rewrite runs only when its character is there: this is every
   * line's first step (43n review, the parse's speed). */
  /* `2 and 1/4 cups` (43n2): the amount's own number, so the unit after it
   * goes too — the name was `cup all purpose flour`. */
  let out = joinMixedNumbers(text);
  if (/[x×]/i.test(out)) out = out.replace(/(?<=\d)\s*[x×]\s*(?=\d)/g, " ");
  if (/ish\b/i.test(out)) out = out.replace(/(?<=\d)ish\b/gi, "");
  if (out.includes("+")) out = out.replace(/(?<=\S)\+(?=\S)/g, " + ");
  if (!/[-–—/]/.test(out)) return out;
  return out
    .replace(/(?<=\d)\s*-\s*(?=\p{L})/gu, " ")
    .replace(/(\d\s*\p{L}+\.?)\s*[-–—]\s*(?=\d)/gu, "$1 - ")
    .replace(
      /\b(?:small|medium|large)(?:[\s-]+(?:to|or)[\s-]+|\s*[-–/]\s*)(?:small|medium|large)\b\s*/gi,
      "",
    )
    .replace(/(?<=\p{L})\s*[-–—]\s*(?=or\s)/gu, " ")
    .replace(/(?<=\p{L})(?:\s+[-–—]\s*|[-–—]\s+)(?=[\p{L}(])/gu, ", ");
}

/** `egg wash:`, `for rolling:`, `optional add-in:` before an amount (43n). */
const LABEL_RE =
  /^(\p{L}[\p{L}\s'’&-]{0,40}):\s*(?=\d|\.\d|(?:an?|one|two|three|four|half)\s)/iu;

/** A label that names a part of the recipe, never an ingredient. */
const SECTION_LABEL_RE =
  /\b(?:optional|for|egg wash|toppings?|garnish(?:es)?|fillings?|frosting|glaze|icing|crust|dough|streusel|crumble|add[\s-]?ins?|to serve|serving|decoration)\b/i;

/**
 * Drop a label before the amount (43n review) — unless the label is the
 * name: "Flour: 2 cups" and "Bread flour: 500g" name nothing after the
 * label, so they read as "Flour, 2 cups" (`flour`), not `cup`. A label that
 * names a part of the recipe ("egg wash:", "for rolling:", "optional:") is
 * dropped whatever follows it.
 */
function dropLabel(text: string): string {
  const label = LABEL_RE.exec(text);
  if (!label) return text;
  const rest = text.slice(label[0].length);
  if (SECTION_LABEL_RE.test(label[1]) || namesAfterAmount(rest)) return rest;
  return `${label[1].trim()}, ${rest}`;
}

/** Does `text` name something once its amount is gone (not just a unit)? */
function namesAfterAmount(text: string): boolean {
  const rest = stripAmount(text);
  const comma = topLevelComma(rest);
  const head = splitParentheses(
    comma >= 0 ? rest.slice(0, comma) : rest,
  ).outside;
  return !!head && !isBareUnit(head) && toName(head).words.length > 0;
}

/** `cups`, `can`: a unit and nothing else. */
function isBareUnit(text: string): boolean {
  const unit = UNIT_RE.exec(text);
  return unit !== null && unit[0].trim().length === text.trim().length;
}

/** Words before a quantity `QUANTITY_RE`'s modifiers don't cover (43n). */
const LEAD_SOFTENER_RE =
  /^(?:roughly|up to|at least|just under|just over|a generous)\s+(?=\d)/i;

/**
 * An amount after the name: a baker's formula (`Bread flour 300g`, `King
 * Arthur Whole Wheat Flour 48g 40%`) or a top-up (`Soy Sauce + 1 tsp`), 43n.
 * Only a number *with* a unit, at the very end.
 */
const TRAILING_AMOUNT_RE = new RegExp(
  String.raw`(?<=\p{L})\s*(?:(?:\+|plus)\s*)?~?\s*${NUMBER}\s*(?:${UNIT_PATTERN})(?:e?s)?\.?(?:\s+\d+(?:\.\d+)?%)*\s*$`,
  "iu",
);

/**
 * One ingredient line, as what it requires. A heading yields nothing; an
 * infusion yields the spirit and, loosely, its flavour.
 */
export function parseIngredientLine(
  line: string,
  meta: LineMeta = {},
): Requirement[] {
  const index = meta.index ?? 0;
  /* Marks stripped (`readableLine`): the article cut below needs it. */
  let text = readableLine(line).replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  if (!text || meta.heading || detectHeading(text)) return [];
  text = tidyLine(text);

  // 1. An `OR:` line (38d) is another way to meet the line before it.
  const orBody = stripOrLabel(text);
  if (orBody !== null) return parseOrLine(line, orBody, meta);

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
  /* `egg wash: 1 large egg …`, `for rolling: 2/3 cup sugar` (43n): a label
   * before the amount, the way `parseAmount` skips it. */
  text = dropLabel(text).replace(LEAD_SOFTENER_RE, "");

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
  /* Not when the cut leaves only describing words (43n): "finely chopped
   * and toasted pecans" is pecans. */
  const prepCut = head.replace(TRAILING_PREP_RE, "");
  if (prepCut !== head && toName(prepCut).words.length > 0) head = prepCut;

  // 6. Parentheticals: brands become aliases, `(or X)` an alternative.
  const split = splitParentheses(head);
  const { groups } = split;
  /* `Bread flour 300g`, `soy sauce + 1 tsp` (43n): an amount written last.
   * And an `or` left first by a remark before it — "1 can (drained) or 1
   * package of frozen corn". */
  /* Cheap gate first (43n review): the last digit is near the end. */
  const outside = (
    /\d[\p{L}\s.%]{0,20}$/u.test(split.outside)
      ? split.outside.replace(TRAILING_AMOUNT_RE, "")
      : split.outside
  ).replace(/^or\s+/i, "");
  const alternativeTexts: string[] = [];
  for (const raw of groups) {
    const group = raw.replace(/^[\s(]+|[\s)]+$/g, "");
    if (!group) continue;
    /* `(or substitute 1/2 teaspoon dried dill)`, `(or sub …)` (43n). */
    const or =
      /^or\s+(?:make\s+|substitute\s+|sub\s+(?:with\s+)?|use\s+)?(?:my\s+|your\s+|some\s+|a\s+)?(.+)$/i.exec(
        group,
      );
    if (or) {
      alternativeTexts.push(...alternativeParts(or[1]));
    } else if (
      !/\d/.test(group) &&
      !/^(?:about|approx|optional|see|plus|from|for|if|i|we|use|substitute|preferably|divided|at|to|any|homemade|store|or|and)\b/i.test(
        group,
      ) &&
      /* `(minced)`, `(chopped)` describe; they don't name. */
      toName(group).words.length > 0
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
  const parts = splitAlternatives(outside.replace(OR_MORE_NAME_RE, "or "))
    .map(stripAmount)
    /* "cooked black eyed peas (1/2 pound) or 2 15-ounce cans": a choice
     * that is only a measure names nothing more (43n). */
    .filter((part, _i, all) => all.length === 1 || !isBareUnit(part));
  const names = inheritTails(parts.map((part) => toName(part)));
  /* `(or pinto or cannellini beans)` is two more ways, each lent the last
   * one's noun as the line's own alternatives are (43n). */
  for (const alternative of alternativeTexts) {
    names.push(
      ...inheritTails(
        splitAlternatives(alternative)
          .map(stripAmount)
          .filter((part) => !isBareUnit(part))
          .map((part) => toName(part)),
      ),
    );
  }
  const result = requirement(index, line, names, aliases, optional);
  return result.alternatives.length > 0 ? [result] : [];
}

/**
 * An `OR:` line's body, as one requirement marked `orPrevious`: one more
 * way to meet the line above.
 *
 * A body of several parts — joined by "plus", or by "and" / "&" before a
 * new amount — is a **combination**: every part is needed ("OR: 1 cup milk
 * plus 1 Tbsp vinegar" for buttermilk). Make judges a line one item at a
 * time, so a combination's parts cannot each be an alternative — vinegar
 * alone would meet buttermilk. It offers only what its parts share, the
 * name they end in when that is two words or more: "¼ cup green sanding
 * sugar and ¼ cup red sanding sugar" offers `sanding sugar` (either colour
 * meets it); milk plus vinegar offers nothing, and the buttermilk line
 * must be met itself (Dd10). Each part is read as a line of its own, so no
 * name keeps the next part's "cup".
 */
function parseOrLine(
  line: string,
  body: string,
  meta: LineMeta,
): Requirement[] {
  const parts = body
    .split(/\s+(?:plus\s+|(?:and|&)\s+(?=\d|[½¼¾⅓⅔⅛]))/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const read = parts.map((part) =>
    parseIngredientLine(part, { ...meta, heading: false }),
  );
  const found = read.flat();
  if (found.length === 0) return [];
  let alternatives = found.flatMap((each) => each.alternatives);
  let aliases = found.flatMap((each) => each.aliases);
  if (parts.length > 1) {
    const shared = sharedTail(
      read.map((each) => each[0]?.alternatives[0]?.words ?? []),
    );
    alternatives =
      shared.join(" ").split(" ").length >= 2
        ? [
            {
              words: shared,
              na: found.every((each) => each.alternatives[0]?.na),
            },
          ]
        : [];
    aliases = [];
  }
  const result = requirement(
    meta.index ?? 0,
    line,
    alternatives,
    aliases,
    found.every((each) => each.optional),
  );
  return result.alternatives.length > 0
    ? [{ ...result, orPrevious: true }]
    : [];
}

/** The words every name ends in; empty when one has none. */
function sharedTail(names: string[][]): string[] {
  if (names.length === 0 || names.some((words) => words.length === 0)) {
    return [];
  }
  const shortest = Math.min(...names.map((words) => words.length));
  let length = 0;
  while (
    length < shortest &&
    names.every(
      (words) =>
        words[words.length - 1 - length] ===
        names[0][names[0].length - 1 - length],
    )
  ) {
    length += 1;
  }
  return names[0].slice(names[0].length - length);
}

/** `previous` with an `OR:` line's names added as more ways to meet it. */
function withAlternatives(previous: Requirement, or: Requirement): Requirement {
  return requirement(
    previous.line,
    previous.text,
    [...previous.alternatives, ...or.alternatives],
    [...previous.aliases, ...or.aliases],
    previous.optional,
    previous.loose,
  );
}

/**
 * A whole ingredient list. `headings` is the index's `ingredientHeadings`
 * when it has one; `detectHeading` catches the rest (and is all an index
 * built before 25c offers). A heading that reads as garnish, optional or
 * to-serve makes the lines under it optional.
 *
 * An `OR:` line (38d) adds its names to the line before it — Make counts the
 * pair as one requirement, met by either — unless a heading came between,
 * when it stands alone.
 */
export function parseIngredientList(
  lines: string[],
  headings?: number[],
): Requirement[] {
  const headingSet = new Set(headings ?? []);
  const out: Requirement[] = [];
  let optionalSection = false;
  /* The last requirement read since the last heading: what `OR:` extends. */
  let previous: number | undefined;
  lines.forEach((line, index) => {
    const clean = readableLine(line).trim();
    if (!clean) return;
    if (headingSet.has(index) || detectHeading(clean)) {
      optionalSection = OPTIONAL_HEADING.test(clean);
      previous = undefined;
      return;
    }
    const read = parseIngredientLine(line, { index, optionalSection });
    for (const each of read) {
      if (each.orPrevious && previous !== undefined) {
        out[previous] = withAlternatives(out[previous], each);
      } else {
        out.push(each);
        previous = out.length - 1;
      }
    }
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
