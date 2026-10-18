/**
 * Deterministic fixes to the local model's answer (38c), after it returns
 * and before it is mapped — never a prompt edit: at temperature 0 qwen3:8b
 * still turns on wording (36-T1), so what a rule fixes stays fixed only if
 * code does it.
 *
 * One function per trap, each conservative — it changes the answer only
 * when the trap's own shape is there, and leaves anything else as the model
 * wrote it:
 *
 * - `creditSteps` (36-T36): a step that is only a credit line ("THANKS TO
 *   AMERICAS TEST KITCHEN … FOR THE RECIPE INSPIRATION") is dropped, so a
 *   description with no method reads as "no instructions", not one step.
 * - `splitMethod` (36-T24): a method that came back as **one** long step
 *   with line or sentence breaks ("brown the chicken … take it out. cook the
 *   onion …") is cut there, the words unchanged; "min." and "approx." are
 *   minded.
 * - `colonlessHeadings` (36-T30): a short, amount-free ingredient line that
 *   stands alone in the source as a heading ("Icing" on a copied Sally's
 *   card) and leads at least two amount-led lines gets the colon
 *   `createIngredient` reads a heading by. Named a part only when the whole
 *   line is the part word (or "the <part word>") or "For the …" — never a
 *   bought-as-is ingredient that happens to end in one ("Store-bought pizza
 *   dough", "Fresh herbs, for garnish"; 38c review).
 * - `capsName` (36-T25): a name in capitals ("DRUNKEN NOODLES RECIPE:") in
 *   title case, minus a trailing "RECIPE" and colon — only when the whole
 *   name is upper case, so real capitals ("BLT", "McDonald's") stay.
 * - `allInTime` (36-T26): "Takes about an hour all in" is the total time —
 *   only when the source says "all in" (or "start to finish") in a short
 *   clause with a time, and the model left the total out.
 *
 * `tidyReading` runs them in that order over the raw answer (JSON, not yet
 * `readLlmAnswer`'s shape: a step's line breaks are still there) and says
 * what each changed; the extractor logs that as `tidy` notes and the
 * `llm.extract` step's `tidied` (38-Dc1). 36-T23 is the one fix made before
 * the model, in the prompt: a pasted text's prompt carries no "Source URL:"
 * line (`buildRecipeUserPrompt`'s caller).
 *
 * Dependency-free apart from the time parser, so it loads with the
 * extractor (35q) and is tested on its own.
 */
import { normalizeIngredientText } from "recipe-website-common/util/parseIngredients";
import { parseTimeText } from "./timeText";

/** Which trap a change fixed. */
export type TidyRule =
  "credit-step" | "split-method" | "sub-heading" | "caps-name" | "all-in-time";

export interface TidyChange {
  rule: TidyRule;
  /** The epic-36 trap it answers: "T25". */
  trap: string;
  /** What changed, for the log: `name "DRUNKEN NOODLES RECIPE" → "Drunken Noodles"`. */
  msg: string;
}

export interface TidyResult {
  data: Record<string, unknown>;
  changes: TidyChange[];
}

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : undefined;
}

/** A line as the rules compare it: bullets, case, punctuation and spacing folded. */
function lineKey(text: string): string {
  return normalizeIngredientText(text)
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A step or ingredient entry that names a section: short, ending in a colon. */
const SECTION_LINE = /^[^.!?]{1,60}:$/;

/** Letters with case, all upper (at least three of them): "DRUNKEN NOODLES". */
export function isAllCaps(text: string): boolean {
  const cased = [...text].filter(
    (char) => char.toUpperCase() !== char.toLowerCase(),
  );
  return (
    cased.length >= 3 && cased.every((char) => char === char.toUpperCase())
  );
}

function quote(text: string, max = 60): string {
  return `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
}

/* ------------------------------------------------------------------ */
/* T36 — a credit line as a step                                       */
/* ------------------------------------------------------------------ */

/** A line that credits someone: "Thanks to …", "Recipe adapted from …". */
const CREDIT =
  /^(thanks\b|thank you\b|many thanks\b|special thanks\b|credits?\b|shout[- ]?outs?\b|h\/t\b|(this )?recipe (is )?(inspired|adapted|based|from|by|courtesy)\b|inspired by\b|adapted (from|by)\b|based on\b)|\brecipe inspiration\b|\binspiration for (this|the) recipe\b/i;

/** A verb of cooking: a credit line that has one may be a real step. */
const COOKING_VERB =
  /\b(add|bake|beat|blend|boil|braise|bring|broil|brown|brush|chill|chop|combine|cook|cool|cover|cream|cut|dice|dip|drain|drizzle|fold|fry|garnish|grate|grill|heat|knead|layer|marinate|mash|melt|mix|place|poach|pour|preheat|proof|reduce|refrigerate|remove|rest|rinse|roast|roll|saut[ée]|season|serve|shake|shape|simmer|slice|soak|spread|sprinkle|steam|stir|strain|toast|top|toss|transfer|whisk)\b/i;

/** A step that is a credit line and nothing of a method. */
export function isCreditLine(step: string): boolean {
  const line = step.trim();
  return CREDIT.test(line) && !COOKING_VERB.test(line);
}

/** 36-T36: credit lines out of the steps. */
export function creditSteps(data: Raw): TidyChange[] {
  const steps = strings(data.instructions);
  if (!steps) return [];
  const credits = steps.filter(
    (step) => !SECTION_LINE.test(step.trim()) && isCreditLine(step),
  );
  if (credits.length === 0) return [];
  data.instructions = steps.filter((step) => !credits.includes(step));
  return credits.map((credit) => ({
    rule: "credit-step",
    trap: "T36",
    msg: `dropped a credit line from the steps: ${quote(credit)}`,
  }));
}

/* ------------------------------------------------------------------ */
/* T24 — an unnumbered method as one step                              */
/* ------------------------------------------------------------------ */

/** Abbreviations a sentence never ends on: "approx. 2 cups", "1 tsp. salt". */
const NEVER_ENDS = new Set([
  "approx",
  "appx",
  "abt",
  "ca",
  "eg",
  "ie",
  "vs",
  "no",
  "tsp",
  "tsps",
  "tbsp",
  "tbsps",
  "tbs",
  "tbl",
  "oz",
  "lb",
  "lbs",
  "pt",
  "qt",
  "gal",
  "fl",
  "pkg",
  "pkt",
  "doz",
  "med",
  "lg",
  "sm",
  "st",
  "dr",
  "mr",
  "mrs",
  "ms",
  "jr",
  "sr",
  "deg",
  "temp",
]);

/**
 * Abbreviations that often do end a sentence ("simmer 45 min. shred the
 * chicken"): a break unless the next word carries the sentence on ("5 min.
 * or until soft", "approx 10 min. (until golden)").
 */
const MAY_END = new Set(["min", "mins", "hr", "hrs", "sec", "secs", "etc"]);

/**
 * Units a number gives in inches, centimetres or millimetres ("a 9-in.
 * pan", "25 cm. long"): never a sentence end when a number — attached
 * ("9-in") or the word before ("9 in") — precedes it (38c review).
 */
const MEASURE_WORDS = new Set(["in", "cm", "mm"]);

/** Words that carry a sentence on past "min.". */
const CARRIES_ON = new Set([
  "or",
  "and",
  "until",
  "till",
  "to",
  "at",
  "per",
  "more",
  "longer",
  "each",
  "on",
  "in",
  "of",
  "before",
  "after",
  "while",
  "with",
  "if",
  "then",
]);

/**
 * A step's sentences, the words unchanged: a break after `.`, `!` or `?`
 * and a space — not after an abbreviation of `NEVER_ENDS`, a single letter
 * ("J. Kenji") or a number's decimal point, and after "min." only when the
 * next word does not carry the sentence on.
 */
export function sentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const boundary = /([.!?]+)(["'”’)\]]*)\s+/g;
  for (const match of text.matchAll(boundary)) {
    const at = match.index ?? 0;
    const end = at + match[1].length + match[2].length;
    const before = text.slice(start, at);
    /* The word the stop ends: "min" of "5 min.", "eg" of "(e.g.", "" of "350". */
    const token = /(\S+)$/.exec(before)?.[1] ?? "";
    const word = token
      .replace(/^[^\p{L}]+/u, "")
      .replace(/\./g, "")
      .toLowerCase();
    const next = text
      .slice(at + match[0].length)
      .match(/^\S+/)?.[0]
      .toLowerCase();
    if (match[1] === ".") {
      if (NEVER_ENDS.has(word) || /^\p{L}$/u.test(token)) continue;
      if (MEASURE_WORDS.has(word)) {
        const prior = /(\S+)\s+\S+$/.exec(before)?.[1];
        if (/\d/.test(token) || (prior && /\d/.test(prior))) continue;
      }
      if (
        MAY_END.has(word) &&
        (!next || CARRIES_ON.has(next) || /^[\d(]/.test(next))
      ) {
        continue;
      }
    }
    const sentence = text.slice(start, end).trim();
    if (sentence) parts.push(sentence);
    start = at + match[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) parts.push(rest);
  return parts;
}

/** A one-step method is cut into sentences only from this many… */
export const SPLIT_MIN_SENTENCES = 3;
/** …or from two, when the step is this long. */
export const SPLIT_MIN_CHARS = 200;

/** A line that ends a sentence of its own: `.`, `!` or `?`, trailing quotes aside. */
const ENDS_SENTENCE = /[.!?]["'”’)\]]*$/;

/**
 * `lines` joined back wherever one does not end a sentence — a hard wrap
 * (an emailed or PDF-copied method) never counts as a step break on its
 * own (38c review): "Preheat the oven to 350F and prepare a\n9x13 pan with
 * butter." is one line, one sentence, not two.
 */
function joinWrappedLines(lines: readonly string[]): string[] {
  const parts: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    buffer.push(line);
    if (ENDS_SENTENCE.test(line)) {
      parts.push(buffer.join(" "));
      buffer = [];
    }
  }
  if (buffer.length > 0) parts.push(buffer.join(" "));
  return parts;
}

/** 36-T24: one long step cut at its line, else sentence, breaks. */
export function splitMethod(data: Raw): TidyChange[] {
  const steps = strings(data.instructions);
  if (!steps) return [];
  const real = steps.filter(
    (step) => step.trim() && !SECTION_LINE.test(step.trim()),
  );
  if (real.length !== 1) return [];
  const [only] = real;
  const lines = only
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = lines.length >= 2 ? joinWrappedLines(lines) : undefined;
  let parts: string[];
  let how: string;
  if (joined && joined.length >= 2) {
    parts = joined;
    how = "line";
  } else {
    parts = sentences((joined?.[0] ?? only).replace(/\s+/g, " ").trim());
    how = "sentence";
    if (
      parts.length < 2 ||
      (parts.length < SPLIT_MIN_SENTENCES && only.length < SPLIT_MIN_CHARS)
    ) {
      return [];
    }
  }
  const at = steps.indexOf(only);
  data.instructions = [...steps.slice(0, at), ...parts, ...steps.slice(at + 1)];
  return [
    {
      rule: "split-method",
      trap: "T24",
      msg: `split the one-step method into ${parts.length} steps at its ${how} breaks`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* T30 — a colon-less sub-heading                                      */
/* ------------------------------------------------------------------ */

/** A line that leads with an amount: "250g", "1 1/2 cups", "½ tsp". */
const AMOUNT_LED = /^[\s*•▪-]*(\d|[¼-¾⅐-⅞])/;

/**
 * What a recipe's part is called, and never an ingredient bought as is
 * ("sauce", "syrup", "dressing", "starter" are, so they are not here).
 */
const PART_WORDS = new Set([
  "icing",
  "frosting",
  "glaze",
  "filling",
  "topping",
  "toppings",
  "crust",
  "dough",
  "streusel",
  "crumble",
  "batter",
  "ganache",
  "meringue",
  "garnish",
  "garnishes",
  "assembly",
  "marinade",
  "preferment",
  "poolish",
  "biga",
  "levain",
  "vinaigrette",
]);

/** A heading candidate: short, amount-free, no colon, no sentence. */
function headingShaped(line: string): boolean {
  const text = line.trim();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    !!text &&
    words.length <= 5 &&
    text.length <= 40 &&
    !/\d|[¼-¾⅐-⅞]/.test(text) &&
    !/[:.!?,;]$/.test(text) &&
    !/^#/.test(text) &&
    /^[\p{Lu}]/u.test(text.replace(/^(for|to)\s+(the\s+)?/i, ""))
  );
}

/**
 * Where `line` stands alone in the source, followed (blank lines aside) by
 * the line `next` came from: its index, else -1.
 */
function standingLine(line: string, next: string, source: string[]): number {
  const key = lineKey(line);
  for (let index = 0; index < source.length; index += 1) {
    if (lineKey(source[index]) !== key) continue;
    let after = index + 1;
    while (after < source.length && !source[after].trim()) after += 1;
    if (after < source.length && sameLine(next, source[after])) return index;
  }
  return -1;
}

/**
 * Whether the model's `line` was copied from `source` — most of its words
 * are there: the copy may be a little off ("1 1/2 cups" for Sally's "1 and
 * 1/2 cups").
 */
function sameLine(line: string, source: string): boolean {
  const words = lineKey(line).split(" ").filter(Boolean);
  const there = new Set(lineKey(source).split(" "));
  return (
    words.length > 0 &&
    words.filter((word) => there.has(word)).length / words.length >= 0.6
  );
}

/**
 * `text` is a part's name and nothing else: the part word alone, or "the
 * <part word>" — never a bought-as-is ingredient that happens to end in one
 * ("Store-bought pizza dough", "Fresh herbs, for garnish"; 38c review).
 */
function isBarePartName(text: string): boolean {
  const words = lineKey(text).split(" ").filter(Boolean);
  const bare = words[0] === "the" ? words.slice(1) : words;
  return bare.length === 1 && PART_WORDS.has(bare[0]);
}

/** 36-T30: a sub-heading the model copied without its colon gets one. */
export function colonlessHeadings(data: Raw, source: string): TidyChange[] {
  const ingredients = strings(data.ingredients);
  if (!ingredients) return [];
  const sourceLines = source.split("\n");
  const changes: TidyChange[] = [];
  const fixed = ingredients.map((line, index) => {
    const next = ingredients[index + 1];
    const second = ingredients[index + 2];
    /* At least two amount-led lines follow — one is an ingredient on its
     * own, not a part with a list under it. */
    if (
      !next ||
      !second ||
      !headingShaped(line) ||
      !AMOUNT_LED.test(next) ||
      !AMOUNT_LED.test(second)
    ) {
      return line;
    }
    const at = standingLine(line, next, sourceLines);
    if (at < 0) return line;
    const text = line.trim();
    const named = /^for\s/i.test(text) || isBarePartName(text);
    /*
     * Or set apart in the source — a blank line before it — inside a list
     * whose lines run together (the next ingredient's line is followed by
     * another), as a card's heading is and "Salt" in a list is not.
     */
    let after = at + 1;
    while (after < sourceLines.length && !sourceLines[after].trim()) after += 1;
    const setApart =
      (at === 0 || !sourceLines[at - 1].trim()) &&
      !!sourceLines[after + 1]?.trim();
    const capitals = isAllCaps(text) && !isAllCaps(next);
    if (!named && !(setApart && (capitals || isTitleCase(text)))) return line;
    changes.push({
      rule: "sub-heading",
      trap: "T30",
      msg: `read ${quote(text)} as a heading`,
    });
    return `${text}:`;
  });
  if (changes.length > 0) data.ingredients = fixed;
  return changes;
}

/** Every word of three letters or more starts upper case: "Cream Cheese Frosting". */
function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /\p{L}{3,}/u.test(word));
  return words.length > 0 && words.every((word) => /^\p{Lu}/u.test(word));
}

/* ------------------------------------------------------------------ */
/* T25 — a name in capitals                                            */
/* ------------------------------------------------------------------ */

/** Lower case inside a title, unless first. */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "w/",
]);

function capitalise(word: string): string {
  return word.replace(/\p{L}/u, (char) => char.toUpperCase());
}

/**
 * Short acronyms a vowel keeps out of the no-vowel rule below (38c review):
 * "IPA", "XO", "DIY", "USA" have a real vowel; "NYC" and "BBQ" are here too,
 * though the rule (treating "y" as never a vowel) already keeps them.
 */
const ACRONYMS = new Set(["nyc", "ipa", "xo", "diy", "usa", "bbq"]);

/** One word of a capitals name in title case: "CAROL'S" → "Carol's", "STIR-FRY" → "Stir-Fry". */
function titleWord(word: string, first: boolean): string {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (ACRONYMS.has(letters.toLowerCase())) return word;
  /*
   * "BBQ", "BLT", "NYC", "PB&J": no vowel — "y" is never one here, so an
   * acronym that uses it ("NYC") is not mistaken for a word that spells
   * one ("Toy") — and a few letters: an initialism.
   */
  if (letters.length >= 2 && letters.length <= 4 && !/[aeiou]/i.test(letters)) {
    return word;
  }
  const lower = word.toLowerCase();
  if (!first && SMALL_WORDS.has(lower)) return lower;
  return lower.split("-").map(capitalise).join("-");
}

/**
 * A name in title case when the whole of it is in capitals, without a
 * trailing colon or "RECIPE": "DRUNKEN NOODLES RECIPE:" → "Drunken
 * Noodles". `undefined` when there is nothing to change.
 */
export function capsName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!isAllCaps(trimmed)) return undefined;
  let core = trimmed.replace(/\s*:+\s*$/, "");
  const withoutRecipe = core.replace(/[\s,–—-]+RECIPE$/, "");
  if (withoutRecipe.trim()) core = withoutRecipe;
  const words = core.split(/\s+/).filter(Boolean);
  const tidy = words
    .map((word, index) => titleWord(word, index === 0))
    .join(" ");
  return tidy && tidy !== trimmed ? tidy : undefined;
}

/** 36-T25: the answer's name, when it is in capitals. */
export function capsNameRule(data: Raw): TidyChange[] {
  if (typeof data.name !== "string") return [];
  const tidy = capsName(data.name);
  if (!tidy) return [];
  const before = data.name.trim();
  data.name = tidy;
  return [
    {
      rule: "caps-name",
      trap: "T25",
      msg: `name ${quote(before)} → ${quote(tidy)}`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* T26 — "all in" is the total time                                    */
/* ------------------------------------------------------------------ */

/**
 * A clause that states a whole time: "about an hour all in", "start to
 * finish: 2 hours" — never "all-in-one" (38c review nit).
 */
const WHOLE_TIME =
  /\ball[\s-]+in\s*$|\ball-in\b(?!-one)|\b(from\s+)?start\s+to\s+finish\b/i;

/** A clause this short is a time said in passing, not a method sentence. */
const WHOLE_TIME_MAX_WORDS = 12;

/**
 * The minutes the source gives as a whole ("Takes about an hour all in."
 * → 60), when it gives exactly one such time; else `undefined`.
 */
export function wholeTime(
  source: string,
): { minutes: number; clause: string } | undefined {
  const found = new Map<number, string>();
  for (const line of source.split("\n")) {
    /* Never split on a decimal point ("1.5 hours all in"; 38c review nit). */
    for (const raw of line.split(/[;!?()]|,(?!\d)|\.(?!\d)/)) {
      const clause = raw.trim();
      if (!clause || !WHOLE_TIME.test(clause)) continue;
      if (clause.split(/\s+/).length > WHOLE_TIME_MAX_WORDS) continue;
      const minutes = parseTimeText(clause);
      if (minutes !== undefined && !found.has(minutes))
        found.set(minutes, clause);
    }
  }
  if (found.size !== 1) return undefined;
  const [[minutes, clause]] = [...found];
  return { minutes, clause };
}

/** 36-T26: "about an hour all in" as the total, not a prep or cook time. */
export function allInTime(data: Raw, source: string): TidyChange[] {
  if (parseTimeText(data.totalTime) !== undefined) return [];
  const whole = wholeTime(source);
  if (!whole) return [];
  const moved = (["prepTime", "cookTime"] as const).filter(
    (key) => parseTimeText(data[key]) === whole.minutes,
  );
  /* Only a time the model put in the wrong place; never one it left out. */
  if (moved.length === 0) return [];
  data.totalTime = data[moved[0]];
  for (const key of moved) delete data[key];
  return [
    {
      rule: "all-in-time",
      trap: "T26",
      msg: `${moved.join(" and ")} ${whole.minutes} min is the total: the text says ${quote(whole.clause)}`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* All of them                                                         */
/* ------------------------------------------------------------------ */

/**
 * The model's answer with every rule applied, in order, and what each
 * changed. `data` is a copy; the model's own answer is left as it was.
 */
export function tidyReading(answer: unknown, source: string): TidyResult {
  const data: Raw =
    answer && typeof answer === "object" && !Array.isArray(answer)
      ? { ...(answer as Raw) }
      : {};
  const changes = [
    ...creditSteps(data),
    ...splitMethod(data),
    ...colonlessHeadings(data, source),
    ...capsNameRule(data),
    ...allInTime(data, source),
  ];
  return { data, changes };
}
