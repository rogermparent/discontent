/**
 * "What can I make?" (25c/D9): which recipes an inventory covers, which are
 * one or two items short, and what to buy next.
 *
 * Pure, so the `/make` page runs it in the browser over the corpus it already
 * holds, and 25d's `inventory_makeable` runs the same code over the same index
 * lines on the server — the two can't disagree.
 */
import {
  aliasKey,
  DERIVED_FORMS,
  isGenericHead,
  nameKey,
  nameLabel,
  parseIngredientList,
  requirementLabel,
  toName,
  type IngredientName,
  type Requirement,
} from "./ingredientNames";

/** The slice of a recipe the matcher reads — structurally `MassagedRecipeEntry`. */
export interface MakeRecipe {
  slug: string;
  name: string;
  ingredients?: string[];
  /** Line indexes of stored headings (25c index field). */
  ingredientHeadings?: number[];
  /** Each `/recipe/<slug>` link in a line (25c index field). */
  ingredientRecipeLinks?: { line: number; slug: string }[];
}

/** An inventory entry, through the same word pipeline as a line. */
export interface InventoryItem {
  text: string;
  /** `aliasKey` of the whole entry: "Gnista" → `gnista`. */
  key: string;
  /** Keys of parentheticals: "aperitif (Gnista)" also says `gnista`. */
  aliasKeys: string[];
  names: IngredientName[];
}

export function parseInventoryItem(text: string): InventoryItem {
  const aliasKeys: string[] = [];
  const outside = text.replace(/\(([^()]*)\)/g, (_, inner: string) => {
    aliasKeys.push(aliasKey(inner));
    return " ";
  });
  const name = toName(outside);
  return {
    text,
    key: aliasKey(outside),
    aliasKeys: aliasKeys.filter(Boolean),
    names: name.words.length > 0 ? [name] : [],
  };
}

/** Alias key → the requirement names it is written against, across the corpus. */
export type AliasIndex = Map<string, Set<string>>;

function isTail(short: string[], long: string[]): boolean {
  if (short.length === 0 || short.length > long.length) return false;
  const offset = long.length - short.length;
  return short.every((word, i) => long[offset + i] === word);
}

/**
 * Item and line name the same thing, one maybe more precisely: `vermouth`
 * covers `extra dry vermouth`, `london dry gin` covers `gin`. A lone vague
 * word (`syrup`, `juice`) never stands for a longer name.
 */
function namesMatch(item: string[], line: string[]): boolean {
  if (isTail(line, item)) return true;
  if (!isTail(item, line)) return false;
  return !(item.length === 1 && line.length > 1 && isGenericHead(item[0]));
}

function contains(haystack: string[], needle: string[]): boolean {
  const flat = ` ${haystack.join(" ")} `;
  return flat.includes(` ${needle.join(" ")} `);
}

/**
 * Does one inventory item meet one requirement? True if any alternative passes
 * any rule:
 *
 * - **alias** — the item is exactly a brand or example the line names, and
 *   that alias means one thing across the corpus (`Gnista` yes, `Toschi` —
 *   five syrups — no). Checked first, so a brand meets a non-alcoholic line
 *   without saying so.
 * - **no-alcohol guard** — both sides non-alcoholic or neither: `gin` never
 *   meets `non-alcoholic gin`.
 * - **generic / specific** — one name is the tail of the other.
 * - **derived form** — `lime` meets `lime juice`, `hibiscus` `hibiscus tea`.
 * - **loose** — an infusion's flavour is met by any item mentioning it.
 */
export function satisfies(
  item: InventoryItem,
  requirement: Requirement,
  aliases?: AliasIndex,
): boolean {
  if (requirement.aliasKeys.length > 0) {
    for (const key of [item.key, ...item.aliasKeys]) {
      if (!key || !requirement.aliasKeys.includes(key)) continue;
      const meanings = aliases?.get(key);
      if (!aliases || (meanings && meanings.size === 1)) return true;
    }
  }
  for (const alternative of requirement.alternatives) {
    for (const name of item.names) {
      if (name.na !== alternative.na) continue;
      if (requirement.loose) {
        if (contains(name.words, alternative.words)) return true;
        continue;
      }
      if (namesMatch(name.words, alternative.words)) return true;
      const last = alternative.words[alternative.words.length - 1];
      if (
        alternative.words.length > 1 &&
        DERIVED_FORMS.has(last) &&
        namesMatch(name.words, alternative.words.slice(0, -1))
      ) {
        return true;
      }
    }
  }
  return false;
}

// --- corpus ----------------------------------------------------------------

export interface PreparedRecipe {
  recipe: MakeRecipe;
  requirements: Requirement[];
  /** Line index → linked recipe slugs. */
  links: Map<number, string[]>;
}

export interface PreparedCorpus {
  recipes: Map<string, PreparedRecipe>;
  /** `nameKey` of a recipe's name (parentheticals dropped) → slugs. */
  byName: Map<string, string[]>;
  aliases: AliasIndex;
}

export function prepareRecipe(recipe: MakeRecipe): PreparedRecipe {
  const links = new Map<number, string[]>();
  for (const { line, slug } of recipe.ingredientRecipeLinks ?? []) {
    links.set(line, [...(links.get(line) ?? []), slug]);
  }
  return {
    recipe,
    requirements: parseIngredientList(
      recipe.ingredients ?? [],
      recipe.ingredientHeadings,
    ),
    links,
  };
}

/** Parse every recipe once; the inventory can then change cheaply. */
export function prepareCorpus(corpus: MakeRecipe[]): PreparedCorpus {
  const recipes = new Map<string, PreparedRecipe>();
  const byName = new Map<string, string[]>();
  const aliases: AliasIndex = new Map();
  for (const recipe of corpus) {
    const prepared = prepareRecipe(recipe);
    recipes.set(recipe.slug, prepared);
    const key = nameKey(toName(recipe.name.replace(/\([^()]*\)/g, " ")));
    byName.set(key, [...(byName.get(key) ?? []), recipe.slug]);
    for (const requirement of prepared.requirements) {
      const meaning = nameKey(requirement.alternatives[0]);
      for (const alias of requirement.aliasKeys) {
        const meanings = aliases.get(alias) ?? new Set<string>();
        meanings.add(meaning);
        aliases.set(alias, meanings);
      }
    }
  }
  return { recipes, byName, aliases };
}

// --- analysis --------------------------------------------------------------

/** A line met by making another recipe first. */
export interface ViaRecipe {
  requirement: Requirement;
  slug: string;
  name: string;
}

export interface RecipeMatch {
  recipe: MakeRecipe;
  /** Required lines the inventory doesn't meet, even through a sub-recipe. */
  missing: Requirement[];
  /** Lines met by making a recipe first: "Make lavender syrup first". */
  via: ViaRecipe[];
  /** `missing.length`; an alternative group counts once. */
  distance: number;
}

export interface BuyNext {
  /** What to add to the inventory: the first alternative's name. */
  item: string;
  /** The requirement as it reads: `lemon juice or lime juice`. */
  label: string;
  /** One-away recipes missing only this. */
  unlocks: number;
  /** Two-away recipes this is one of the two for. */
  helps: number;
  /** Slugs of the recipes it unlocks. */
  recipes: string[];
}

export interface MakeableAnalysis {
  canMake: RecipeMatch[];
  oneAway: RecipeMatch[];
  twoAway: RecipeMatch[];
  further: RecipeMatch[];
  buyNext: BuyNext[];
  /** Scoped recipes with no ingredient lines to judge — left out of the buckets. */
  unjudged: number;
}

const BUY_NEXT_LIMIT = 5;

function isMet(
  requirement: Requirement,
  items: InventoryItem[],
  aliases: AliasIndex,
): boolean {
  return (
    requirement.staple ||
    items.some((item) => satisfies(item, requirement, aliases))
  );
}

/** Every required line met directly — what a sub-recipe has to pass. */
function directlyMakeable(
  prepared: PreparedRecipe,
  items: InventoryItem[],
  aliases: AliasIndex,
): boolean {
  return prepared.requirements.every(
    (requirement) => requirement.optional || isMet(requirement, items, aliases),
  );
}

function byName(a: RecipeMatch, b: RecipeMatch): number {
  return a.recipe.name.localeCompare(b.recipe.name);
}

/**
 * Bucket `scoped` by how far `inventory` is from making each.
 *
 * A line the inventory misses can still be met by a recipe it names — through
 * a `/recipe/<slug>` link, or by its name matching a recipe's exactly, over
 * the **whole** corpus ("lavender syrup" → Lavender Syrup) — when that
 * recipe's own lines are all met directly. One level deep, and never itself.
 */
export function analyzeMakeable(
  scoped: MakeRecipe[],
  corpus: MakeRecipe[] | PreparedCorpus,
  inventory: string[],
): MakeableAnalysis {
  const prepared = Array.isArray(corpus) ? prepareCorpus(corpus) : corpus;
  const items = inventory.map(parseInventoryItem);
  const subMakeable = new Map<string, boolean>();
  const canMakeSub = (slug: string): boolean => {
    let known = subMakeable.get(slug);
    if (known === undefined) {
      const sub = prepared.recipes.get(slug);
      known =
        !!sub &&
        sub.requirements.length > 0 &&
        directlyMakeable(sub, items, prepared.aliases);
      subMakeable.set(slug, known);
    }
    return known;
  };

  const analysis: MakeableAnalysis = {
    canMake: [],
    oneAway: [],
    twoAway: [],
    further: [],
    buyNext: [],
    unjudged: 0,
  };

  for (const recipe of scoped) {
    const entry = prepared.recipes.get(recipe.slug) ?? prepareRecipe(recipe);
    if (entry.requirements.length === 0) {
      analysis.unjudged += 1;
      continue;
    }
    const missing: Requirement[] = [];
    const via: ViaRecipe[] = [];
    for (const requirement of entry.requirements) {
      if (requirement.optional) continue;
      if (isMet(requirement, items, prepared.aliases)) continue;
      const candidates = [
        ...(entry.links.get(requirement.line) ?? []),
        ...requirement.alternatives.flatMap(
          (name) => prepared.byName.get(nameKey(name)) ?? [],
        ),
      ].filter((slug) => slug !== recipe.slug);
      const sub = candidates.find(canMakeSub);
      if (sub) {
        via.push({
          requirement,
          slug: sub,
          name: prepared.recipes.get(sub)?.recipe.name ?? sub,
        });
      } else {
        missing.push(requirement);
      }
    }
    const match: RecipeMatch = {
      recipe,
      missing,
      via,
      distance: missing.length,
    };
    if (missing.length === 0) analysis.canMake.push(match);
    else if (missing.length === 1) analysis.oneAway.push(match);
    else if (missing.length === 2) analysis.twoAway.push(match);
    else analysis.further.push(match);
  }

  for (const bucket of [
    analysis.canMake,
    analysis.oneAway,
    analysis.twoAway,
    analysis.further,
  ]) {
    bucket.sort(byName);
  }
  analysis.buyNext = rankBuyNext(analysis.oneAway, analysis.twoAway);
  return analysis;
}

function requirementKey(requirement: Requirement): string {
  return (
    requirement.alternatives.map(nameKey).join("|") +
    (requirement.loose ? "~" : "")
  );
}

/**
 * What to buy: ranked by the one-away recipes it alone unlocks, then by the
 * two-away recipes it helps with.
 */
function rankBuyNext(
  oneAway: RecipeMatch[],
  twoAway: RecipeMatch[],
): BuyNext[] {
  const tally = new Map<string, BuyNext>();
  const entry = (requirement: Requirement): BuyNext => {
    const key = requirementKey(requirement);
    let found = tally.get(key);
    if (!found) {
      found = {
        item: nameLabel(requirement.alternatives[0]),
        label: requirementLabel(requirement),
        unlocks: 0,
        helps: 0,
        recipes: [],
      };
      tally.set(key, found);
    }
    return found;
  };
  for (const match of oneAway) {
    const found = entry(match.missing[0]);
    found.unlocks += 1;
    found.recipes.push(match.recipe.slug);
  }
  for (const match of twoAway) {
    for (const requirement of match.missing) entry(requirement).helps += 1;
  }
  return [...tally.values()]
    .sort(
      (a, b) =>
        b.unlocks - a.unlocks ||
        b.helps - a.helps ||
        a.label.localeCompare(b.label),
    )
    .slice(0, BUY_NEXT_LIMIT);
}

/**
 * Names worth offering as someone types an inventory item: every name a line
 * asks for, and every alias that means one thing — most used first.
 */
export function suggestNames(corpus: MakeRecipe[] | PreparedCorpus): string[] {
  const prepared = Array.isArray(corpus) ? prepareCorpus(corpus) : corpus;
  const counts = new Map<string, number>();
  const bump = (name: string) => {
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  for (const { requirements } of prepared.recipes.values()) {
    for (const requirement of requirements) {
      if (requirement.staple) continue;
      for (const name of requirement.alternatives) bump(nameLabel(name));
      requirement.aliases.forEach((alias, i) => {
        if (prepared.aliases.get(requirement.aliasKeys[i])?.size === 1) {
          bump(alias);
        }
      });
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

export { requirementLabel } from "./ingredientNames";
