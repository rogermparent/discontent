/**
 * `/make`'s small pure pieces (41h): which list the page counts from, and
 * the add field's suggestions. Pure, so `test/makeFeatured.test.ts` holds
 * them without a page.
 */
import { dedupeItems, inventoryKey } from "../../util/inventoryText";
import {
  nameKey,
  nameLabel,
  type Requirement,
} from "../../util/ingredientNames";
import {
  looksLikePattern,
  matcherForTyped,
  matcherOf,
  matcherText,
  patternOf,
  prefixForTyped,
  sameMatcher,
  type IngredientMatcher,
} from "../../util/matchers";
import {
  analyzeMakeable,
  parseInventoryItem,
  prepareRecipe,
  probablyOnHand,
  whatIf,
  type MakeableAnalysis,
  type MakeRecipe,
  type PreparedCorpus,
} from "../../util/makeable";
import { fieldMatches, fold } from "../SearchForm/queryLanguage";
import type { AddCandidate } from "./AddField";
import type { CountFrom } from "./useInventory";

/**
 * The list every count judges (41h, "Count from"): this browser's, the
 * second list's, or both — the union, the browser's spelling first. With no
 * second list on the page (an export without the house snapshot, a guest)
 * it is always the browser's, whatever was chosen.
 */
export function countFromItems(
  source: CountFrom,
  browser: string[],
  second?: string[],
): string[] {
  if (!second) return browser;
  if (source === "saved") return second;
  if (source === "both") return dedupeItems([...browser, ...second]);
  return browser;
}

/**
 * The featured scope on `/make` (41h review, Dh7): for each recipe every
 * featured ingredient is **used** in, the lines the features meet. A
 * feature is judged as the inventory would be — `analyzeMakeable` with the
 * feature as the whole list, no staples, and close matches counted (always,
 * since 43m; `countClose` stays for the tests) — so `gin` meets a Martini's gin, never a Moscow Mule's
 * ginger beer or a non-alcoholic gin, and "extra dry vermouth" every dry
 * vermouth line. Only required lines count: a lime wedge for garnish
 * doesn't put a drink in "with lime". Not the search language's word-prefix
 * `ingredient:`, which `/search` keeps. `undefined` with nothing featured.
 */
export function featuredLines(
  recipes: MakeRecipe[],
  prepared: PreparedCorpus,
  featured: string[],
  countClose = true,
): Map<string, Set<number>> | undefined {
  if (featured.length === 0) return undefined;
  let kept: Map<string, Set<number>> | undefined;
  for (const feature of featured) {
    const pool = kept
      ? recipes.filter((recipe) => kept!.has(recipe.slug))
      : recipes;
    const judged = analyzeMakeable(pool, prepared, [feature], {
      staples: [],
      countClose,
    });
    const next = new Map<string, Set<number>>();
    for (const match of [
      ...judged.canMake,
      ...judged.oneAway,
      ...judged.twoAway,
      ...judged.further,
    ]) {
      const { slug } = match.recipe;
      const entry = prepared.recipes.get(slug) ?? prepareRecipe(match.recipe);
      const unmet = new Set([
        ...match.missing.map((requirement) => requirement.line),
        ...match.via.map((via) => via.requirement.line),
      ]);
      const met = entry.requirements
        .filter(
          (requirement) =>
            !requirement.optional && !unmet.has(requirement.line),
        )
        .map((requirement) => requirement.line);
      if (met.length === 0) continue;
      next.set(slug, new Set([...(kept?.get(slug) ?? []), ...met]));
    }
    kept = next;
  }
  return kept;
}

/** `recipes` narrowed to the featured scope (`featuredLines`). */
export function featureScope<T extends MakeRecipe>(
  recipes: T[],
  prepared: PreparedCorpus,
  featured: string[],
  countClose = true,
): T[] {
  const lines = featuredLines(recipes, prepared, featured, countClose);
  return lines ? recipes.filter((recipe) => lines.has(recipe.slug)) : recipes;
}

/** Suggestions shown at most. */
export const ADD_SUGGESTIONS = 7;

/**
 * Names whose what-if is computed, most used in scope first: the cap keeps
 * a one-letter prefix over a large corpus to a few dozen `whatIf` calls.
 */
const WHAT_IF_POOL = 60;

interface Named {
  name: string;
  /** The line narrowed to this one name, to ask "is it on hand already?". */
  requirement: Requirement;
  /** Lines in scope that name it. */
  count: number;
}

/**
 * The add field's suggestions (41h): every ingredient name the scoped
 * recipes' lines ask for — and every brand that means one thing across the
 * corpus, as `suggestNames` offers — that matches `typed` at a word start
 * (the search language's `fieldMatches`), leaving out what the list (with
 * the staples) already covers. Each says what adding it would do
 * (`whatIf` over the analysis's one- and two-away recipes), and they are
 * ranked by that: recipes finished, then recipes helped, then use in scope.
 *
 * Patterns (43m) are opt-in, never ranked over a plain name: a typed
 * pattern (`bean*`, `/may(o|onnaise)/`) is offered alone, saying how many
 * names it matches here; for plain text the last row is "Match every line
 * with 'bean'" — the word prefix `bean*` — when it matches a name in scope
 * and the list doesn't hold it. An invalid pattern offers nothing (the
 * field says why: `patternError`).
 */
export function addCandidates({
  typed,
  scoped,
  prepared,
  analysis,
  have,
  staples,
  limit = ADD_SUGGESTIONS,
}: {
  typed: string;
  scoped: MakeRecipe[];
  prepared: PreparedCorpus;
  analysis: Pick<MakeableAnalysis, "oneAway" | "twoAway">;
  have: string[];
  staples: string[];
  limit?: number;
}): AddCandidate[] {
  const needle = fold(typed).replace(/\s+/g, " ").trim();
  if (!needle) return [];
  const held = [...have, ...staples].map(parseInventoryItem);
  const holds = (matcher: IngredientMatcher) =>
    held.some((item) => sameMatcher(item.matcher, matcher));
  /* What a pattern row says it would do: its names here, and its what-if. */
  const patternRow = (matcher: IngredientMatcher, every: boolean) => {
    const gain = whatIf(matcher.text, analysis, prepared.aliases);
    return {
      name: matcher.text,
      unlocks: gain.unlocks.length,
      helps: gain.helps,
      pattern: {
        names: matcherMembers(matcher, scoped, prepared).length,
        ...(every ? { every: true } : {}),
      },
    };
  };
  if (looksLikePattern(typed)) {
    const pattern = patternOf(typed);
    if (!pattern || pattern.error || holds(pattern)) return [];
    return [patternRow(pattern, false)];
  }
  const names = new Map<string, Named>();
  const note = (name: string, requirement: Requirement) => {
    /* A line's plain "bean" would add `any bean`: the matcher's own
     * suggestion says so better (42m2 review). */
    if (matcherOf(name)) return;
    const key = fold(name).trim();
    const found = names.get(key);
    if (found) found.count += 1;
    else names.set(key, { name, requirement, count: 1 });
  };
  for (const recipe of scoped) {
    const entry = prepared.recipes.get(recipe.slug);
    if (!entry) continue;
    for (const requirement of entry.requirements) {
      if (requirement.staple) continue;
      for (const alternative of requirement.alternatives) {
        const label = nameLabel(alternative);
        if (!fieldMatches(label, needle)) continue;
        note(label, {
          ...requirement,
          alternatives: [alternative],
          aliases: [],
          aliasKeys: [],
        });
      }
      requirement.aliases.forEach((alias, i) => {
        const key = requirement.aliasKeys[i];
        if (prepared.aliases.get(key)?.size !== 1) return;
        if (!fieldMatches(alias, needle)) return;
        note(alias, {
          ...requirement,
          alternatives: [],
          aliases: [alias],
          aliasKeys: [key],
        });
      });
    }
  }
  const items = have.map(parseInventoryItem);
  const stapleItems = staples.map(parseInventoryItem);
  const ranked: (AddCandidate & { count: number })[] = [...names.values()]
    .filter(
      ({ requirement }) => !probablyOnHand(requirement, items, stapleItems),
    )
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, WHAT_IF_POOL)
    .map((named) => {
      const gain = whatIf(named.name, analysis, prepared.aliases);
      return {
        name: named.name,
        unlocks: gain.unlocks.length,
        helps: gain.helps,
        count: named.count,
      };
    });
  /*
   * A family named (42m2): "bean" also offers `any bean`, which matches
   * every kind the scope's recipes use — unless the list holds it already
   * or the scope uses none. Ranked by its what-if like any other name.
   */
  const matcher = matcherForTyped(typed);
  if (matcher && !holds(matcher)) {
    const members = matcherMembers(matcher, scoped, prepared);
    if (members.length > 0) {
      const name = matcherText(matcher);
      const gain = whatIf(name, analysis, prepared.aliases);
      ranked.push({
        name,
        unlocks: gain.unlocks.length,
        helps: gain.helps,
        count: members.reduce((sum, member) => sum + member.recipes, 0),
        matcher: { kinds: members.length },
      });
    }
  }
  const plain: AddCandidate[] = ranked
    .sort(
      (a, b) =>
        b.unlocks - a.unlocks ||
        b.helps - a.helps ||
        b.count - a.count ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
    .map(({ name, unlocks, helps, matcher: family }) => ({
      name,
      unlocks,
      helps,
      ...(family ? { matcher: family } : {}),
    }));
  /*
   * "Match every line with 'bean'" (43m): last, so it never outranks a name,
   * and only when it would match two names or more here — one is just that
   * name.
   */
  const prefix = prefixForTyped(typed);
  if (prefix && !holds(prefix)) {
    const row = patternRow(prefix, true);
    if (row.pattern.names > 1) plain.push(row);
  }
  return plain;
}

/** Ingredients "Most used here" lists at most (43m). */
export const MOST_USED_LIMIT = 40;

/** One row of "Most used here" (43m): a name, and the recipes that use it. */
export interface MostUsed {
  /** The normalized name (43n), as a line names it and as a tap adds it. */
  name: string;
  /** Scoped recipes with a required line naming it. */
  recipes: number;
}

/**
 * What the scoped recipes use most (43m, "start from nothing"): every
 * required line's names, normalized (43n's `nameKey`, so "mild feta cheese"
 * and "feta" are one `feta cheese`), counted once per recipe — "in 34 of
 * 120 drinks" — most used first. An A-or-B line counts each of its names.
 * Staples and optional lines are skipped, and so is a name the list (with
 * the assumed staples) already covers, so a tap always adds something. A
 * line's plain "beans" is left to the `any bean` matcher, as the add field
 * leaves it. `canned black bean` and `black bean` stay two names (43n's
 * Dn2): each meets the other's lines, so either tap does.
 */
export function mostUsed({
  scoped,
  prepared,
  have,
  staples,
  limit = MOST_USED_LIMIT,
}: {
  scoped: MakeRecipe[];
  prepared: PreparedCorpus;
  have: string[];
  staples: string[];
  limit?: number;
}): MostUsed[] {
  const found = new Map<
    string,
    { name: string; requirement: Requirement; slugs: Set<string> }
  >();
  for (const recipe of scoped) {
    const entry = prepared.recipes.get(recipe.slug) ?? prepareRecipe(recipe);
    for (const requirement of entry.requirements) {
      if (requirement.staple || requirement.optional) continue;
      for (const alternative of requirement.alternatives) {
        if (alternative.words.length === 0) continue;
        const key = nameKey(alternative);
        let row = found.get(key);
        if (!row) {
          const name = nameLabel(alternative);
          if (matcherOf(name)) continue;
          row = {
            name,
            requirement: {
              ...requirement,
              alternatives: [alternative],
              aliases: [],
              aliasKeys: [],
            },
            slugs: new Set(),
          };
          found.set(key, row);
        }
        row.slugs.add(recipe.slug);
      }
    }
  }
  const items = have.map(parseInventoryItem);
  const stapleItems = staples.map(parseInventoryItem);
  return [...found.values()]
    .sort((a, b) => b.slugs.size - a.slugs.size || a.name.localeCompare(b.name))
    .filter(
      ({ requirement }) => !probablyOnHand(requirement, items, stapleItems),
    )
    .slice(0, limit)
    .map(({ name, slugs }) => ({ name, recipes: slugs.size }));
}

/** One family member the scope uses (42m2): a refine popover's row. */
export interface MatcherMember {
  /** As a line names it, and as it is added: `chickpea`, `black bean`. */
  name: string;
  /** Scoped recipes with a required line naming it. */
  recipes: number;
}

/**
 * The members of `matcher`'s family the scoped recipes ask for (42m2), each
 * with how many recipes ask — the "Keep only these" list, and the add
 * field's "matches 9 kinds in these recipes". Specific members only
 * (`chickpea`, not "mixed beans"); one row per name; required lines only;
 * most used first. A pattern's members (43m) are the normalized names it
 * matches: `bean*` → black bean, green bean, vanilla bean, ….
 */
export function matcherMembers(
  matcher: IngredientMatcher,
  scoped: MakeRecipe[],
  prepared: PreparedCorpus,
): MatcherMember[] {
  const found = new Map<string, { name: string; slugs: Set<string> }>();
  for (const recipe of scoped) {
    const entry = prepared.recipes.get(recipe.slug) ?? prepareRecipe(recipe);
    for (const requirement of entry.requirements) {
      if (requirement.optional || requirement.loose) continue;
      for (const alternative of requirement.alternatives) {
        if (alternative.na) continue;
        for (const name of matcher.specificNames(alternative)) {
          let member = found.get(name);
          if (!member) {
            member = { name, slugs: new Set() };
            found.set(name, member);
          }
          member.slugs.add(recipe.slug);
        }
      }
    }
  }
  return [...found.values()]
    .map(({ name, slugs }) => ({ name, recipes: slugs.size }))
    .sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name));
}

/**
 * The list after "Keep only these" (42m2): the matcher at `item` replaced
 * by `chosen`, in its place, without repeating what the list already has.
 */
export function refineMatcher(
  have: string[],
  item: string,
  chosen: string[],
): string[] {
  const key = inventoryKey(item);
  const at = have.findIndex((kept) => inventoryKey(kept) === key);
  const rest = have.filter((kept) => inventoryKey(kept) !== key);
  const index = at < 0 ? rest.length : at;
  return dedupeItems([
    ...rest.slice(0, index),
    ...chosen,
    ...rest.slice(index),
  ]);
}

/** "Southside, Paloma, Dark 'n' Stormy and 4 more" — a name list, cut short. */
export function namesAndMore(names: string[], shown = 3): string {
  const short = names.map((name) => name.replace(/\s*\([^)]*\)\s*$/, ""));
  const head = short.slice(0, shown).join(", ");
  const rest = short.length - shown;
  return rest > 0 ? `${head} and ${rest} more` : head;
}
