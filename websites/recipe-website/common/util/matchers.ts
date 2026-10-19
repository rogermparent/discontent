/**
 * Matcher items (42m2, 43m): an item on the list that stands for many
 * ingredients and meets every line naming one, strictly, so it counts for
 * "can make". Three kinds, all **stored as text** (Dm2-1), so they round-trip
 * through everything that keeps a list as text — this browser's list, the
 * editor's saved list, Import / export, `recipes inventory add …`:
 *
 * - **A family** (42m2): `any bean` is "I have beans, any kind" — every
 *   member of an exact list (`beans.ts`, 42m's Dm1). `matcherOf` also reads
 *   `bean`, `beans`, `any beans`, `all beans`, `any kind of beans` and
 *   `beans (any kind)`; `canonicalItem` turns each into `any bean` when it is
 *   added (Dm2-6), so a bare "beans" never strictly meets green, vanilla or
 *   coffee beans as a plain word would. Saved lists that hold one read as
 *   before.
 * - **A word prefix** (43m): `bean*` meets any line whose name has a word
 *   starting "bean" — black, green and vanilla beans alike, never chickpeas.
 *   `mayo*` meets "mayonnaise", `parsley*` "italian parsley", `black b*`
 *   "black bean". What the add field's "Match every line with 'X'" adds.
 * - **A regular expression** (43m): `/may(o|onnaise)/`, tested
 *   case-insensitively against each line's normalized name (`nameLabel`'s
 *   words, 43n). Length-capped, compiled once in a try/catch, and refused
 *   when it could backtrack for ever (`unsafeRepeat`). An invalid one is
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
  const rest = simple(text)
    .replace(ANY_KIND_SUFFIX, "")
    .replace(QUANTIFIER, "");
  return MATCHERS.find(
    (matcher) => rest === matcher.noun || rest === matcher.plural,
  );
}

// --- patterns (43m) ----------------------------------------------------------

/** Longest regular expression accepted, between its slashes. */
export const PATTERN_MAX_LENGTH = 64;

/**
 * Most unbounded repeats (`*`, `+`, `{n,}`) a regular expression may have:
 * `.*.*.*.*.*x` backtracks as the fifth power of a name's length, three as
 * the cube — well under a millisecond for any name the corpus has.
 */
export const PATTERN_MAX_REPEATS = 3;

/** Fewest letters a word prefix (`be*`) may have. */
export const PREFIX_MIN_LETTERS = 2;

/** `/…/`, with an `i` flag tolerated (matching is case-insensitive anyway). */
const REGEX_SHAPE = /^\/(.*)\/i?$/s;

/** Does `text` read as a pattern — `/…`, or a word ending in `*`? */
export function looksLikePattern(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("/") || /\*\s*$/.test(trimmed);
}

/** What a regular expression is tested against: accents off, as names are. */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Why `body` could backtrack for ever, or `undefined` when it can't (43m):
 * a group that repeats without bound (`*`, `+`, `{n,}`, `{n,m}`) while
 * something inside it repeats or alternates — `(a+)+`, `(\w*)*`, `(a|a)*`,
 * `((ab)+){2,}` — more than `PATTERN_MAX_REPEATS` unbounded repeats in all,
 * and backreferences. A scan, not a parser: escapes and character classes
 * are skipped, and whether it compiles is left to the engine.
 */
export function unsafeRepeat(body: string): string | undefined {
  /** Per open group: something inside repeats or alternates. */
  const stack: boolean[] = [false];
  /** The group just closed was risky, while the next character may repeat it. */
  let closedRisky = false;
  let repeats = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    const afterRiskyGroup = closedRisky;
    closedRisky = false;
    if (char === "\\") {
      const next = body[i + 1];
      if (next && /[1-9k]/.test(next)) {
        return "Backreferences (\\1, \\k<…>) aren't allowed in a pattern.";
      }
      i += 1;
      continue;
    }
    if (char === "[") {
      i += 1;
      if (body[i] === "^") i += 1;
      if (body[i] === "]") i += 1;
      while (i < body.length && body[i] !== "]") {
        if (body[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (char === "(") {
      stack.push(false);
      /* `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, `(?<name>`: not a repeat. */
      const kind = /^\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/.exec(
        body.slice(i + 1),
      );
      if (kind) i += kind[0].length;
      continue;
    }
    if (char === ")") {
      if (stack.length > 1) {
        const risky = stack.pop()!;
        if (risky) stack[stack.length - 1] = true;
        closedRisky = risky;
      }
      continue;
    }
    if (char === "|") {
      stack[stack.length - 1] = true;
      continue;
    }
    const unbounded =
      char === "*" ||
      char === "+" ||
      (char === "{" && /^\{\d*,\d*\}|^\{\d{2,}\}/.test(body.slice(i)));
    if (unbounded || char === "?" || char === "{") {
      if (unbounded && afterRiskyGroup) {
        return "That pattern repeats a repeat — like (a+)+ — which can take for ever to run. Take out the outer * or +.";
      }
      if (unbounded && ++repeats > PATTERN_MAX_REPEATS) {
        return `Use at most ${PATTERN_MAX_REPEATS} * or + in a pattern, so it stays quick.`;
      }
      stack[stack.length - 1] = true;
    }
  }
  return undefined;
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

/** `test` over a name's words, each spelling tested once (names repeat). */
function memberBy(
  test: (words: string) => boolean,
): Pick<IngredientMatcher, "member" | "specificNames"> {
  const seen = new Map<string, boolean>();
  const member = (name: IngredientName) => {
    if (name.words.length === 0) return false;
    const words = name.words.join(" ");
    let known = seen.get(words);
    if (known === undefined) {
      known = test(words);
      seen.set(words, known);
    }
    return known;
  };
  return {
    member,
    specificNames: (name) => (member(name) ? [nameLabel(name)] : []),
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
  const unsafe = unsafeRepeat(body);
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

function prefixMatcher(text: string, raw: string): IngredientMatcher {
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
  if ((prefix.match(/[\p{L}\p{N}]/gu) ?? []).length < PREFIX_MIN_LETTERS) {
    return refused(
      base,
      text,
      `Give at least ${PREFIX_MIN_LETTERS} letters before the *, e.g. bean*.`,
    );
  }
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
 * The pattern `text` spells (43m): `/regex/` or a word prefix `bean*`, valid
 * or not (an invalid one carries `error`), or `undefined` for anything else.
 */
export function patternOf(text: string): IngredientMatcher | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) return regexMatcher(trimmed);
  const prefix = /^([^*]+?)\s*\*+$/.exec(trimmed);
  return prefix ? prefixMatcher(trimmed, prefix[1]) : undefined;
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
 * `bean*` for "bean". `undefined` for a pattern already, an `any …`, or
 * fewer than three letters typed (two would offer a pattern on nearly every
 * keystroke; a typed `be*` still works).
 */
export function prefixForTyped(typed: string): IngredientMatcher | undefined {
  const text = typed.trim();
  if (!text || looksLikePattern(text) || /^(?:any|all)\s/i.test(text)) {
    return undefined;
  }
  if ((text.match(/[\p{L}\p{N}]/gu) ?? []).length < 3) return undefined;
  const matcher = prefixMatcher(`${text}*`, text);
  return matcher.error ? undefined : matcher;
}
