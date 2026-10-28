/**
 * The two `ingredient:` values that read a line's **names** rather than its
 * text (46h, Roger's 43-Dm1–Dm4 and 43-Dn2 picks). Everything else after
 * `ingredient:` keeps its meaning: a word-start or substring match on the
 * line as written (`fieldMatches`), so `ingredient:"black beans"` is what it
 * always was.
 *
 * - **`ingredient:any-bean`** (also `"any bean"`, `any-beans`): a line with
 *   a name in the traditional-bean family (`beans.ts`: black, kidney,
 *   pinto, navy, cannellini, chickpea, lima, borlotti, adzuki, mung,
 *   lentils, split peas, black-eyed peas…) — never green, vanilla, coffee or
 *   jelly beans. The same family as Make's `any bean` matcher.
 * - **`ingredient:~X`** — "X in any form": a line whose name is X once the
 *   words that say what form it is bought or kept in are read past —
 *   canned, cooked, frozen, drained, rinsed, thawed, soaked… (`dried` and
 *   `fresh` are already dropped by `toName`). `ingredient:~"black beans"`
 *   meets "1 can black beans", "1 cup dried black beans" and "2 cups cooked
 *   black beans", and not "black bean soup" or "black bean paste": the whole
 *   name must be X, as 43n's normalization reads it (synonyms included, so
 *   `~garbanzo beans` is `~chickpeas`). The form words are dropped only
 *   here; the shopping list's merge keeps canned and fresh apart (43n Dn2).
 *
 * Make needs no `~`: its strict match already reads past these words (a
 * name is met by any name it is the tail of, either way round, and a
 * leading `canned` is read past — `makeable.ts`' `namesMatch`), so black
 * beans on hand meet canned, dried and cooked black-bean lines alike.
 *
 * Pure, and safe in the browser: the search page evaluates it per line,
 * each line's names parsed once (`lineNames`, memoized).
 */
import { beanKind } from "./beans";
import { fold } from "./fold";
import {
  parseIngredientLine,
  toName,
  type IngredientName,
} from "./ingredientNames";

/** How an `ingredient:` value is matched. */
export type IngredientMatchMode = "form" | "bean";

/** The values that mean the bean family, folded. */
const ANY_BEAN_VALUES = new Set([
  "any-bean",
  "any-beans",
  "any bean",
  "any beans",
]);

/** The canonical spelling the query language writes for the family. */
export const ANY_BEAN_VALUE = "any-bean";

/** The prefix that asks for any form: `ingredient:~"black beans"`. */
export const ANY_FORM_PREFIX = "~";

/**
 * How a folded `ingredient:` operand asks to be matched, and the value left
 * to match: `any-bean` → the family; `~black beans` → `black beans` in any
 * form; anything else → `undefined` (plain text).
 */
export function ingredientMatchOf(
  folded: string,
): { mode: IngredientMatchMode; value: string } | undefined {
  const value = folded.trim();
  if (ANY_BEAN_VALUES.has(value))
    return { mode: "bean", value: ANY_BEAN_VALUE };
  if (value.startsWith(ANY_FORM_PREFIX)) {
    const rest = value.slice(ANY_FORM_PREFIX.length).trim();
    return rest ? { mode: "form", value: rest } : undefined;
  }
  return undefined;
}

/**
 * Leading words that say what form an ingredient is bought or kept in, not
 * what it is. Read past by the any-form match only.
 */
const FORM_WORDS = new Set([
  "canned",
  "tinned",
  "jarred",
  "cooked",
  "frozen",
  "thawed",
  "drained",
  "rinsed",
  "soaked",
  "prepared",
  "leftover",
]);

/** A name's words without its leading form words (one word always stays). */
export function formlessWords(name: IngredientName): string[] {
  let start = 0;
  while (start < name.words.length - 1 && FORM_WORDS.has(name.words[start])) {
    start += 1;
  }
  return name.words.slice(start);
}

/** The key two names share when they are one ingredient in any form. */
export function formlessKey(name: IngredientName): string {
  return `${formlessWords(name).join(" ")}${name.na ? "@na" : ""}`;
}

const NAMES_CACHE_LIMIT = 20_000;
const namesByLine = new Map<string, IngredientName[]>();

/**
 * Every name one line asks for — each alternative of each requirement it
 * reads as (`parseIngredientLine`) — memoized per line text, since the same
 * lines are tested on every keystroke. A heading names nothing.
 */
export function lineNames(line: string): IngredientName[] {
  const known = namesByLine.get(line);
  if (known) return known;
  const names = parseIngredientLine(line).flatMap(
    (requirement) => requirement.alternatives,
  );
  if (namesByLine.size >= NAMES_CACHE_LIMIT) namesByLine.clear();
  namesByLine.set(line, names);
  return names;
}

const targetKeys = new Map<string, string>();

/** The formless key of what was typed after `~`, memoized. */
function targetKey(value: string): string {
  let key = targetKeys.get(value);
  if (key === undefined) {
    key = formlessKey(toName(value));
    if (targetKeys.size >= 1_000) targetKeys.clear();
    targetKeys.set(value, key);
  }
  return key;
}

/**
 * Does one ingredient line meet a name-reading `ingredient:` value? `bean`:
 * any of its names is a family bean. `form`: any of its names is the value
 * in some form.
 */
export function lineMatchesIngredient(
  line: string,
  mode: IngredientMatchMode,
  value: string,
): boolean {
  const names = lineNames(line);
  if (mode === "bean") {
    return names.some((name) => !name.na && beanKind(name) !== undefined);
  }
  const key = targetKey(fold(value));
  if (!key || key === "@na") return false;
  return names.some((name) => formlessKey(name) === key);
}
