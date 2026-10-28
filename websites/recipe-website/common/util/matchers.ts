/**
 * Matcher items (42m2, 43m): an item on the list that stands for many
 * ingredients and meets every line naming one, strictly, so it counts for
 * "can make". Three kinds, all **stored as text** (Dm2-1), so they round-trip
 * through everything that keeps a list as text — this browser's list, the
 * editor's saved list, Import / export, `recipes inventory add …`:
 *
 * - **A family** (42m2): `any bean` is "I have beans, any kind" — every
 *   member of an exact list (`beans.ts`, 42m's Dm1; the traditional beans,
 *   lentils and split peas included, since 46h). `matcherOf` also reads
 *   `bean`, `beans`, `any beans`, `all beans`, `any kind of beans` and
 *   `beans (any kind)`; `canonicalItem` turns each into `any bean` when it is
 *   added (Dm2-6), so a bare "beans" never strictly meets green, vanilla or
 *   coffee beans as a plain word would. Saved lists that hold one read as
 *   before.
 * - **A word prefix** (43m): `bean*` meets any line whose name has a word
 *   starting "bean" — black, green and vanilla beans alike, never chickpeas.
 *   `mayo*` meets "mayonnaise", `parsley*` "italian parsley". One word of
 *   three letters or more, then the star; "1/2*" or "sugar snap*" stay
 *   plain items. What the add field's "Match every line with 'X'" adds.
 * - **A regular expression** (43m): `/may(o|onnaise)/`, tested
 *   case-insensitively against each line's normalized name (`nameLabel`'s
 *   words, 43n). Length-capped, read by a whitelist parser of a safe subset
 *   (`unsafePattern`) so it can't backtrack for ever, compiled once in a
 *   try/catch. An invalid one is
 *   still an item — it meets nothing, and says why (`error`).
 *
 * Plain items stay exact (Roger, 2026-10-19): a pattern is opt-in, by its
 * spelling. Any other text is an ordinary item, and a list without a matcher
 * reads exactly as before.
 *
 * Pure, and safe in the browser and the CLI.
 */
import { beanKind, beanKindOf, beanNames } from "./beans";
import {
  nameLabel,
  toName,
  withoutCanned,
  type IngredientName,
  type Requirement,
} from "./ingredientNames";

export type MatcherKind = "family" | "prefix" | "regex";

export interface IngredientMatcher {
  /** Stable id: `bean`, `prefix:bean`, `regex:may(o|onnaise)`. */
  id: string;
  kind: MatcherKind;
  /** The canonical text the list keeps: `any bean`, `bean*`, `/may(o|onnaise)/`. */
  text: string;
  /**
   * A family's noun, singular (`bean`), and its plural (`beans`) — the words
   * people type. A pattern's are its text.
   */
  noun: string;
  plural: string;
  /**
   * How the add field offers it (46h): "Any bean (black, kidney,
   * chickpea…)". A pattern has none: the field shows its text.
   */
  label?: string;
  /** The refine popover's question: "Which beans do you have?" */
  question: string;
  /** What it does, in a sentence: "Every bean counts as on hand now. …" */
  summary: string;
  /**
   * Why the pattern can't be used, when it can't (43m): too long, unsafe, or
   * not a regular expression. It meets nothing then.
   */
  error?: string;
  /** Does a line's name (one alternative) belong? */
  member: (name: IngredientName) => boolean;
  /**
   * The names a line's name stands for, as the refine list names them
   * (42m2 review): for the family its own names, without "cooked" or
   * "canned" — `black bean` for "2 cups cooked black beans" — and only the
   * specific ones (`chickpea`, never "mixed beans"); for a pattern the line's
   * normalized name itself.
   */
  specificNames: (name: IngredientName) => string[];
}

export const MATCHERS: IngredientMatcher[] = [
  {
    id: "bean",
    kind: "family",
    text: "any bean",
    noun: "bean",
    plural: "beans",
    label: "Any bean (black, kidney, chickpea…)",
    question: "Which beans do you have?",
    summary:
      "Every bean counts as on hand now. Tick the ones you have to keep only those.",
    member: (name) => beanKind(name) !== undefined,
    specificNames: (name) =>
      (beanNames(name) ?? []).filter((member) => {
        const kind = beanKindOf(member);
        return kind !== undefined && kind !== "any";
      }),
  },
];

/** The canonical text of a matcher: `any bean`, `bean*`, `/may(o|onnaise)/`. */
export function matcherText(matcher: IngredientMatcher): string {
  return matcher.text;
}

/** Lowercase, accents and stray marks off, spaces single. */
function simple(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[✱*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const QUANTIFIER = /^(?:any|all)\s+(?:(?:kinds?|types?|sorts?)\s+of\s+)?/;
const ANY_KIND_SUFFIX = /\s*(?:\(\s*any(?:\s+kind)?\s*\)|,\s*any(?:\s+kind)?)$/;

function familyOf(text: string): IngredientMatcher | undefined {
  /* `any-bean` too: search's spelling (46h), which Make's features read. */
  const rest = simple(text)
    .replace(/-/g, " ")
    .replace(ANY_KIND_SUFFIX, "")
    .replace(QUANTIFIER, "");
  return MATCHERS.find(
    (matcher) => rest === matcher.noun || rest === matcher.plural,
  );
}

// --- patterns (43m) ----------------------------------------------------------

/** Longest regular expression accepted, between its slashes. */
export const PATTERN_MAX_LENGTH = 64;

/** Fewest letters a word prefix (`bea*`) has. */
export const PREFIX_MIN_LETTERS = 3;

/**
 * A word prefix: one run of `PREFIX_MIN_LETTERS` letters or more, then a
 * star — `bean*`, `Mayo *`. Anything else ending in `*` ("1/2*", "sugar
 * snap*", `be*`) is a plain item (Dm1).
 */
const PREFIX_SHAPE = /^(\p{L}{3,})\s*\*+$/u;

/** `/…/`, with an `i` flag tolerated (matching is case-insensitive anyway). */
const REGEX_SHAPE = /^\/(.*)\/i?$/s;

/** Does `text` read as a pattern — `/…`, or one word ending in `*`? */
export function looksLikePattern(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("/") || PREFIX_SHAPE.test(trimmed.normalize("NFC"));
}

/** What a regular expression is tested against: accents off, as names are. */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Largest bound a `{n}` or `{n,m}` may give. */
export const PATTERN_MAX_BOUND = 20;

/** Deepest groups may nest: `((red|green) bell|jalapeño)` is two. */
export const PATTERN_MAX_DEPTH = 2;

/**
 * Most ways a pattern may try to match from one place in a name: each `?`
 * doubles them, `{n,m}` multiplies by its range, a `*` or `+` by
 * `PATTERN_REPEAT_WAYS`, a group adds its branches. `.*.*` (400) and nine
 * optional groups (512) pass; `.*.*.*` (8,000) and ten (1,024) don't — what
 * keeps the worst case linear-ish over the corpus's names (Dm2).
 */
export const PATTERN_MAX_WAYS = 1000;

/** What one `*` or `+` counts as, for `PATTERN_MAX_WAYS`. */
const PATTERN_REPEAT_WAYS = 20;

/** The longest name a regular expression is tested against (the rest is cut). */
export const PATTERN_NAME_MAX_LENGTH = 120;

/** The escapes a pattern may use, besides an escaped punctuation mark. */
const CLASS_ESCAPES = "wWdDsS";
const ANCHOR_ESCAPES = "bB";

class PatternProblem extends Error {}

const TOO_MANY_WAYS =
  "That pattern can match in too many ways to stay quick: use fewer *, +, ? or | (two * or + at most).";

/** One parsed piece: how many ways it can match, and whether it repeats. */
interface Ways {
  ways: number;
  quantified: boolean;
}

/**
 * Why `body` isn't a pattern this page runs, or `undefined` when it is
 * (43m, Dm2): a whitelist parser of a safe subset of JavaScript's regular
 * expressions, so nothing it accepts can backtrack for ever.
 *
 * - Atoms: a literal character, `.`, an escape (`\w \d \s` and their
 *   capitals, `\b \B`, or an escaped punctuation mark), a character class
 *   read as JavaScript reads one (an empty `[]` or `[^]` refused).
 * - A repeat (`? * + {n} {n,m}`, bounds ≤ `PATTERN_MAX_BOUND`) goes right
 *   after one atom, and only one.
 * - Groups `( … )` and `(?: … )` are for alternation: one may be followed by
 *   `?` only, and only when nothing inside it repeats; at most
 *   `PATTERN_MAX_DEPTH` deep. No lookarounds, backreferences or named groups.
 * - `^` and `$` anywhere; at most `PATTERN_MAX_WAYS` ways to match from one
 *   place.
 *
 * Whether it compiles is checked too (`regexMatcher`), but nothing this
 * accepts should fail to.
 */
export function unsafePattern(body: string): string | undefined {
  let i = 0;
  function fail(message: string): never {
    throw new PatternProblem(message);
  }
  const isRepeat = (char: string | undefined) =>
    char === "?" || char === "*" || char === "+" || char === "{";

  const escape = (inClass: boolean): "anchor" | "atom" => {
    const next = body[i + 1];
    if (next === undefined) fail("A pattern can't end with a backslash.");
    if (/[1-9]/.test(next) || next === "k") {
      fail("Backreferences (\\1, \\k<…>) aren't allowed in a pattern.");
    }
    i += 2;
    if (CLASS_ESCAPES.includes(next)) return "atom";
    if (!inClass && ANCHOR_ESCAPES.includes(next)) return "anchor";
    if (/[A-Za-z0-9]/.test(next)) {
      fail(
        `\\${next} isn't one this page reads: use \\w, \\d, \\s, \\b, or a backslash before a punctuation mark.`,
      );
    }
    return "atom";
  };

  const characterClass = () => {
    i += 1;
    if (body[i] === "^") i += 1;
    if (body[i] === "]") {
      fail(
        "Put something between the brackets: [] matches nothing and [^] everything.",
      );
    }
    while (body[i] !== "]") {
      if (i >= body.length) fail("Close the [ with a ].");
      if (body[i] === "\\") escape(true);
      else i += 1;
    }
    i += 1;
  };

  /** A repeat right after an atom: how many ways it multiplies by. */
  const repeat = (): number | undefined => {
    const char = body[i];
    let ways: number;
    if (char === "?") {
      i += 1;
      ways = 2;
    } else if (char === "*" || char === "+") {
      i += 1;
      ways = PATTERN_REPEAT_WAYS;
    } else if (char === "{") {
      const bound = /^\{(\d+)(?:(,)(\d*))?\}/.exec(body.slice(i));
      if (!bound) fail("Write a count as {2} or {1,3}, or put \\ before a {.");
      const [whole, low, comma, high] = bound!;
      if (comma && !high) {
        fail(
          `Give {${low},} an upper bound, e.g. {${low},${Number(low) + 2}}.`,
        );
      }
      const min = Number(low);
      const max = comma ? Number(high) : min;
      if (max > PATTERN_MAX_BOUND) {
        fail(`A count can be at most ${PATTERN_MAX_BOUND}.`);
      }
      if (min > max)
        fail(`{${low},${high}} counts down: put the smaller first.`);
      i += whole.length;
      ways = max - min + 1;
    } else {
      return undefined;
    }
    if (isRepeat(body[i])) {
      fail("One repeat at a time: a ?, *, + or {…} can't follow another.");
    }
    return ways;
  };

  const term = (depth: number): Ways => {
    const char = body[i];
    if (char === "(") {
      i += 1;
      if (body.startsWith("?:", i)) i += 2;
      else if (body[i] === "?") {
        fail(
          "Only plain groups — ( … ) or (?: … ) — can be used: no lookarounds or named groups.",
        );
      }
      if (depth >= PATTERN_MAX_DEPTH) {
        fail(`Groups can nest at most ${PATTERN_MAX_DEPTH} deep.`);
      }
      const inner = alternation(depth + 1);
      if (body[i] !== ")") fail("Close the ( with a ).");
      i += 1;
      if (body[i] === "?") {
        if (inner.quantified) {
          fail(
            "A group can be made optional with ? only when nothing inside it repeats.",
          );
        }
        i += 1;
        if (isRepeat(body[i])) {
          fail("One repeat at a time: a ?, *, + or {…} can't follow another.");
        }
        return { ways: inner.ways + 1, quantified: true };
      }
      if (isRepeat(body[i])) {
        fail(
          "A group can't repeat — like (a+)+ that can take for ever to run. Repeat a single character, or make the group optional with ?.",
        );
      }
      return inner;
    }
    if (char === ")") fail("There's a ) without its (.");
    if (isRepeat(char)) {
      fail(
        i === 0
          ? "A pattern can't start with a ?, *, + or {…}: it repeats the thing before it."
          : "One repeat at a time: a ?, *, + or {…} can't follow another.",
      );
    }
    if (char === "]" || char === "}") {
      fail(`Put \\ before a ${char} to match it.`);
    }
    let kind: "anchor" | "atom" = "atom";
    if (char === "^" || char === "$") {
      i += 1;
      kind = "anchor";
    } else if (char === "\\") kind = escape(false);
    else if (char === "[") characterClass();
    else i += 1;
    if (kind === "anchor") {
      if (isRepeat(body[i])) fail("Nothing can repeat ^, $ or \\b.");
      return { ways: 1, quantified: false };
    }
    const ways = repeat();
    return ways === undefined
      ? { ways: 1, quantified: false }
      : { ways, quantified: true };
  };

  const sequence = (depth: number): Ways => {
    let ways = 1;
    let quantified = false;
    while (i < body.length && body[i] !== "|" && body[i] !== ")") {
      const next = term(depth);
      ways *= next.ways;
      quantified ||= next.quantified;
      if (ways > PATTERN_MAX_WAYS) fail(TOO_MANY_WAYS);
    }
    return { ways, quantified };
  };

  const alternation = (depth: number): Ways => {
    let { ways, quantified } = sequence(depth);
    while (body[i] === "|") {
      i += 1;
      const next = sequence(depth);
      ways += next.ways;
      quantified ||= next.quantified;
      if (ways > PATTERN_MAX_WAYS) fail(TOO_MANY_WAYS);
    }
    return { ways, quantified };
  };

  try {
    alternation(0);
    if (i < body.length) fail("There's a ) without its (.");
    return undefined;
  } catch (error) {
    if (error instanceof PatternProblem) return error.message;
    throw error;
  }
}

type MatcherBase = Omit<IngredientMatcher, "member" | "specificNames">;

/** A matcher that meets nothing, and says why. */
function refused(
  base: MatcherBase,
  text: string,
  error: string,
): IngredientMatcher {
  return {
    ...base,
    text: text.trim(),
    error,
    member: () => false,
    specificNames: () => [],
  };
}

/**
 * `test` over a name's words, each spelling tested once (names repeat), and
 * at most `PATTERN_NAME_MAX_LENGTH` characters of it. A leading "canned" is
 * read past as Make reads it (43n's `withoutCanned`): `/^chick/` and
 * `chick*` meet "canned chickpea", and its refine row is `chickpea`. The
 * whole name is tried too, so `/^canned/` still meets it.
 */
function memberBy(
  test: (words: string) => boolean,
): Pick<IngredientMatcher, "member" | "specificNames"> {
  const seen = new Map<string, boolean>();
  const tested = (words: string) => {
    let known = seen.get(words);
    if (known === undefined) {
      known = test(words.slice(0, PATTERN_NAME_MAX_LENGTH));
      seen.set(words, known);
    }
    return known;
  };
  const member = (name: IngredientName) => {
    if (name.words.length === 0) return false;
    const plain = withoutCanned(name);
    return (
      tested(plain.words.join(" ")) ||
      (plain !== name && tested(name.words.join(" ")))
    );
  };
  return {
    member,
    specificNames: (name) =>
      member(name) ? [nameLabel(withoutCanned(name))] : [],
  };
}

function regexMatcher(text: string): IngredientMatcher {
  const trimmed = text.trim();
  const shape = REGEX_SHAPE.exec(trimmed);
  const body = stripAccents(shape ? shape[1] : trimmed.slice(1));
  const base: MatcherBase = {
    id: `regex:${body}`,
    kind: "regex",
    text: `/${body}/`,
    noun: `/${body}/`,
    plural: `/${body}/`,
    question: "Which of these do you have?",
    summary: `Every line matching /${body}/ counts as on hand now. Tick the ones you have to keep only those.`,
  };
  if (!shape) {
    return refused(
      base,
      text,
      "Close the pattern with a slash, e.g. /may(o|onnaise)/.",
    );
  }
  if (!body.trim()) {
    return refused(
      base,
      text,
      "Put something between the slashes, e.g. /may(o|onnaise)/.",
    );
  }
  if (body.length > PATTERN_MAX_LENGTH) {
    return refused(
      base,
      text,
      `A pattern can be at most ${PATTERN_MAX_LENGTH} characters long.`,
    );
  }
  const unsafe = unsafePattern(body);
  if (unsafe) return refused(base, text, unsafe);
  let regex: RegExp;
  try {
    regex = new RegExp(body, "i");
  } catch (error) {
    const reason = (error as Error).message
      .replace(/^Invalid regular expression: \/.*\/[a-z]*: /s, "")
      .replace(/\.$/, "");
    return refused(
      base,
      text,
      `That isn't a pattern this page can read: ${reason}.`,
    );
  }
  return { ...base, ...memberBy((words) => regex.test(words)) };
}

/** A word prefix's words: folded and split as `toName` splits a name. */
function prefixWords(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A word prefix's matcher, for a word of three letters or more. */
function prefixMatcher(raw: string): IngredientMatcher {
  const prefix = prefixWords(raw);
  const base: MatcherBase = {
    id: `prefix:${prefix}`,
    kind: "prefix",
    text: `${prefix}*`,
    noun: `${prefix}*`,
    plural: `${prefix}*`,
    question: "Which of these do you have?",
    summary: `Every line with a word starting “${prefix}” counts as on hand now. Tick the ones you have to keep only those.`,
  };
  /*
   * As typed, and as the name pipeline reads it — so `beans*` finds the
   * singular `bean` the names keep, and `mayo*` (43n's synonym) both
   * `mayonnaise` and any name still spelled "mayo…".
   */
  const named = toName(raw).words.join(" ");
  const starts = [...new Set([prefix, named].filter(Boolean))].map(
    (start) => ` ${start}`,
  );
  return {
    ...base,
    ...memberBy((words) => starts.some((start) => ` ${words}`.includes(start))),
  };
}

/**
 * The pattern `text` spells (43m): `/regex/`, valid or not (an invalid one
 * carries `error`), or a word prefix `bean*`; `undefined` for anything else.
 */
export function patternOf(text: string): IngredientMatcher | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) return regexMatcher(trimmed);
  const prefix = PREFIX_SHAPE.exec(trimmed.normalize("NFC"));
  return prefix ? prefixMatcher(prefix[1]) : undefined;
}

/**
 * The matcher `text` names, or `undefined` for an ordinary item: a pattern
 * (`bean*`, `/may(o|onnaise)/`, 43m) — checked first, so `bean*` is a prefix
 * and not the family — or a family's spelling: `any bean`, `beans`, `bean`,
 * `all beans`, `any kind of beans`, `beans (any kind)`. Never `black beans`,
 * `green beans` or `beans (Goya)` — those are items.
 */
export function matcherOf(text: string): IngredientMatcher | undefined {
  return patternOf(text) ?? familyOf(text);
}

/**
 * Two matchers are the same matcher: by id, since a pattern's is built
 * afresh each time its text is read.
 */
export function sameMatcher(
  a: IngredientMatcher | undefined,
  b: IngredientMatcher | undefined,
): boolean {
  return !!a && !!b && a.id === b.id;
}

/**
 * `text` as the list keeps it: a matcher's canonical text, else as written.
 * An invalid pattern keeps its spelling, so it can be read and fixed.
 */
export function canonicalItem(text: string): string {
  const matcher = matcherOf(text);
  return matcher && !matcher.error ? matcherText(matcher) : text;
}

export function canonicalItems(items: string[]): string[] {
  return items.map(canonicalItem);
}

/** Why `text` can't be added as a pattern, when it is one that can't (43m). */
export function patternError(text: string): string | undefined {
  return patternOf(text)?.error;
}

/**
 * Does a matcher meet a requirement? When any alternative is a member — as
 * an item meets a line when any alternative passes — and the line is no
 * infusion's flavour (`loose`). A non-alcoholic name is never a member.
 */
export function matcherMeets(
  matcher: IngredientMatcher,
  requirement: Requirement,
): boolean {
  if (requirement.loose) return false;
  return requirement.alternatives.some(
    (name) => !name.na && matcher.member(name),
  );
}

/**
 * The family the add field offers for what's typed (42m2): its noun or
 * plural begun — `bea`, `bean`, `beans` (three letters at least) — or
 * anything after `any ` (`any b`). `undefined` otherwise, and for a pattern.
 */
export function matcherForTyped(typed: string): IngredientMatcher | undefined {
  if (looksLikePattern(typed)) return undefined;
  const text = simple(typed);
  const quantified = QUANTIFIER.test(text);
  const rest = text.replace(QUANTIFIER, "");
  if (!rest || (!quantified && rest.length < 3)) return undefined;
  return MATCHERS.find((matcher) => matcher.plural.startsWith(rest));
}

/**
 * The word prefix "Match every line with 'X'" adds for what's typed (43m):
 * `bean*` for "bean". Only for one word of three letters or more — the
 * shape a word prefix has (Dm1): `undefined` for "red onion", "1/2", "be"
 * or a pattern already.
 */
export function prefixForTyped(typed: string): IngredientMatcher | undefined {
  const text = typed.trim().normalize("NFC");
  if (!PREFIX_SHAPE.test(`${text}*`)) return undefined;
  return prefixMatcher(text);
}
