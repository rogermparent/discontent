/**
 * Matcher items (42m2): an item on the list that stands for a whole family
 * of ingredients — `any bean` is "I have beans, any kind" — and meets every
 * line that names a member, strictly, so it counts for "can make".
 *
 * **Stored as text** (Dm2-1): the canonical spelling is `any <noun>`
 * (`any bean`), and it round-trips through everything that keeps a list as
 * text — this browser's list, the editor's `inventory/on-hand.json`, Import /
 * export, `recipes inventory add "any bean"`. `matcherOf` also reads `bean`,
 * `beans`, `any beans`, `all beans`, `any kind of beans` and `beans (any
 * kind)`; `canonicalItem` turns each into `any bean` when it is added
 * (Dm2-6), so a bare "beans" never strictly meets green, vanilla or coffee
 * beans as a plain word would. Any other text is an ordinary item, and a list
 * without a matcher reads exactly as before.
 *
 * Built over families so more can follow; only beans ship, because only
 * beans have an exact member list (`beans.ts`, 42m's Dm1). Cheese, vinegar,
 * rum and whiskey would need one first (Dm2-7).
 *
 * Pure, and safe in the browser and the CLI.
 */
import { beanKind } from "./beans";
import type { IngredientName, Requirement } from "./ingredientNames";

export interface IngredientMatcher {
  /** Stable id: `bean`. */
  id: string;
  /** The family's noun, singular: `bean` — the canonical text is `any bean`. */
  noun: string;
  /** Its plural, for the words people type: `beans`. */
  plural: string;
  /** Does a line's name (one alternative) belong to the family? */
  member: (name: IngredientName) => boolean;
  /**
   * A member specific enough to keep when refining: `chickpea`, not "mixed
   * beans" or a bare "beans" line.
   */
  specific: (name: IngredientName) => boolean;
}

export const MATCHERS: IngredientMatcher[] = [
  {
    id: "bean",
    noun: "bean",
    plural: "beans",
    member: (name) => beanKind(name) !== undefined,
    specific: (name) => {
      const kind = beanKind(name);
      return kind !== undefined && kind !== "any";
    },
  },
];

/** The canonical text of a matcher: `any bean`. */
export function matcherText(matcher: IngredientMatcher): string {
  return `any ${matcher.noun}`;
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

/**
 * The matcher `text` names, or `undefined` for an ordinary item: `any bean`,
 * `beans`, `bean`, `all beans`, `any kind of beans`, `beans (any kind)`.
 * Never `black beans`, `green beans` or `beans (Goya)` — those are items.
 */
export function matcherOf(text: string): IngredientMatcher | undefined {
  const rest = simple(text)
    .replace(ANY_KIND_SUFFIX, "")
    .replace(QUANTIFIER, "");
  return MATCHERS.find(
    (matcher) => rest === matcher.noun || rest === matcher.plural,
  );
}

/** `text` as the list keeps it: a matcher's canonical text, else as written. */
export function canonicalItem(text: string): string {
  const matcher = matcherOf(text);
  return matcher ? matcherText(matcher) : text;
}

export function canonicalItems(items: string[]): string[] {
  return items.map(canonicalItem);
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
 * The matcher the add field offers for what's typed (42m2): the family's
 * noun or plural begun — `bea`, `bean`, `beans` (three letters at least) —
 * or anything after `any ` (`any b`). `undefined` otherwise.
 */
export function matcherForTyped(typed: string): IngredientMatcher | undefined {
  const text = simple(typed);
  const quantified = QUANTIFIER.test(text);
  const rest = text.replace(QUANTIFIER, "");
  if (!rest || (!quantified && rest.length < 3)) return undefined;
  return MATCHERS.find((matcher) => matcher.plural.startsWith(rest));
}
