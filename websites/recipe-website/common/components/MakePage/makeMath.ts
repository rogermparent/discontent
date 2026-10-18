/**
 * `/make`'s small pure pieces (41h): which list the page counts from, and
 * the add field's suggestions. Pure, so `test/makeFeatured.test.ts` holds
 * them without a page.
 */
import { dedupeItems } from "../../util/inventoryText";
import { nameLabel, type Requirement } from "../../util/ingredientNames";
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
 * feature as the whole list, no staples, and close matches as the page
 * counts them — so `gin` meets a Martini's gin, never a Moscow Mule's
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
  const names = new Map<string, Named>();
  const note = (name: string, requirement: Requirement) => {
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
  return [...names.values()]
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
    })
    .sort(
      (a, b) =>
        b.unlocks - a.unlocks ||
        b.helps - a.helps ||
        b.count - a.count ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
    .map(({ name, unlocks, helps }) => ({ name, unlocks, helps }));
}

/** "Southside, Paloma, Dark 'n' Stormy and 4 more" — a name list, cut short. */
export function namesAndMore(names: string[], shown = 3): string {
  const short = names.map((name) => name.replace(/\s*\([^)]*\)\s*$/, ""));
  const head = short.slice(0, shown).join(", ");
  const rest = short.length - shown;
  return rest > 0 ? `${head} and ${rest} more` : head;
}
