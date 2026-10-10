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
  CLASS_NOUNS,
  CLOSE_GROUPS,
  CLOSE_HEAD_EXCLUDED,
  CLOSE_PAIRS,
  CONFUSABLE_WORDS,
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

/**
 * What `inventory_makeable`, `recipes inventory make` and `/api/inventory/make`
 * scope to when nothing says otherwise: every recipe (32j). It was
 * `tag:drink` while drinks were the only thing with an inventory story;
 * `/make` dropped that default at 28g, and `tag:drink` still narrows.
 */
export const DEFAULT_MAKE_QUERY = "";

/**
 * What everyone has, assumed on hand unless the person says otherwise (32j):
 * a dinner recipe is never blocked on salt and pepper. `/make` keeps an
 * editable copy in the browser; the server seats use this one.
 */
export const DEFAULT_STAPLES = ["salt", "black pepper", "water", "ice"];

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
      if (strictWords(name.words, alternative.words)) return true;
    }
  }
  return false;
}

/** The generic/specific and derived-form rules, on words alone. */
function strictWords(item: string[], line: string[]): boolean {
  if (namesMatch(item, line)) return true;
  const last = line[line.length - 1];
  return (
    line.length > 1 &&
    DERIVED_FORMS.has(last) &&
    namesMatch(item, line.slice(0, -1))
  );
}

// --- close matches (32j) ---------------------------------------------------

/** How often each word appears across the corpus's requirement names. */
export type WordCounts = Map<string, number>;

/** A word seen this often or less may be the corpus's own typo. */
const RARE_WORD = 2;

/** At most one insertion, deletion or substitution apart. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * The same word, typed differently: one edit apart, both 5+ letters, not a
 * known pair of different things (`cherry`/`sherry`, `tomato`/`potato`) —
 * and only when one side is unusual. The item's word is one the corpus never
 * uses (the person's spelling), or the line's word is rare (the corpus's
 * typo). Two words the corpus uses freely are two things.
 */
function typoOf(
  itemWord: string,
  lineWord: string,
  counts: WordCounts | undefined,
): boolean {
  if (itemWord === lineWord) return false;
  if (itemWord.length < 5 || lineWord.length < 5) return false;
  if (itemWord.includes(" ") || lineWord.includes(" ")) return false;
  if (!withinOneEdit(itemWord, lineWord)) return false;
  if (CONFUSABLE_WORDS.has([itemWord, lineWord].sort().join("|"))) {
    return false;
  }
  if (!counts) return true;
  return !counts.has(itemWord) || (counts.get(lineWord) ?? 0) <= RARE_WORD;
}

/** Some member is the tail of `words`: `olive oil` names `extra virgin olive oil`. */
function memberOf(members: string[][], words: string[]): boolean {
  return members.some((member) => isTail(member, words));
}

/**
 * Close, not the same: a name that would do in a pinch, or the same name
 * typed differently. Tried only once the strict rules have failed. Any rule:
 *
 * - **substitutes** — curated groups (`olive oil` / `vegetable oil`,
 *   `shallot` / `onion`, `broth` / `stock`) and one-way pairs (`egg` →
 *   `egg white`);
 * - **same head** — two longer names ending in the same noun (`brown rice`
 *   for `white rice`, `cheddar cheese` for `parmesan cheese`), unless the noun
 *   is vague (`juice`, `syrup`) or names different things (`pepper`, `bean`);
 * - **class noun** — the name without its kind (`parmesan` for
 *   `parmesan cheese`, `vanilla` for `vanilla extract`), either way;
 * - **typo** — the strict rules again, one word allowed one edit
 *   (`mozarella`, `parmesean`, `tomatoe`).
 *
 * The no-alcohol guard holds, and a lone vague word (`juice`, `oil`) still
 * never stands for a longer name: `juice` is not close to `lime juice`.
 */
export function closeTo(
  item: InventoryItem,
  requirement: Requirement,
  counts?: WordCounts,
): boolean {
  if (requirement.loose) return false;
  for (const alternative of requirement.alternatives) {
    for (const name of item.names) {
      if (name.na !== alternative.na) continue;
      if (name.words.length === 1 && isGenericHead(name.words[0])) continue;
      if (closeWords(name.words, alternative.words, counts)) return true;
    }
  }
  return false;
}

function closeWords(
  have: string[],
  line: string[],
  counts: WordCounts | undefined,
): boolean {
  for (const group of CLOSE_GROUPS) {
    if (memberOf(group, have) && memberOf(group, line)) return true;
  }
  for (const [from, to] of CLOSE_PAIRS) {
    if (isTail(from, have) && isTail(to, line)) return true;
  }
  const head = have[have.length - 1];
  if (
    have.length > 1 &&
    line.length > 1 &&
    head === line[line.length - 1] &&
    !isGenericHead(head) &&
    !CLOSE_HEAD_EXCLUDED.has(head)
  ) {
    return true;
  }
  const classDrop = (long: string[], short: string[]) =>
    long.length === short.length + 1 &&
    CLASS_NOUNS.has(long[long.length - 1]) &&
    short.every((word, i) => long[i] === word);
  if (classDrop(line, have) || classDrop(have, line)) return true;
  /* One word typed differently: rewrite it to the line's, then the strict
   * rules decide. */
  let typos = 0;
  const rewritten = have.map((word) => {
    const match = line.find((lineWord) => typoOf(word, lineWord, counts));
    if (!match) return word;
    typos += 1;
    return match;
  });
  return typos === 1 && strictWords(rewritten, line);
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
  /** Words across every requirement name: the close tier's typo guard. */
  words: WordCounts;
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
  const words: WordCounts = new Map();
  for (const recipe of corpus) {
    const prepared = prepareRecipe(recipe);
    recipes.set(recipe.slug, prepared);
    const key = nameKey(toName(recipe.name.replace(/\([^()]*\)/g, " ")));
    byName.set(key, [...(byName.get(key) ?? []), recipe.slug]);
    for (const requirement of prepared.requirements) {
      for (const name of requirement.alternatives) {
        for (const word of name.words) {
          words.set(word, (words.get(word) ?? 0) + 1);
        }
      }
      const meaning = nameKey(requirement.alternatives[0]);
      for (const alias of requirement.aliasKeys) {
        const meanings = aliases.get(alias) ?? new Set<string>();
        meanings.add(meaning);
        aliases.set(alias, meanings);
      }
    }
  }
  return { recipes, byName, aliases, words };
}

// --- analysis --------------------------------------------------------------

/** A line met by making another recipe first. */
export interface ViaRecipe {
  requirement: Requirement;
  slug: string;
  name: string;
}

/** A line only an inventory item close to it meets (32j). */
export interface CloseMatch {
  requirement: Requirement;
  /** The inventory entry, as written: "onion" for "1 shallot". */
  item: string;
}

export interface RecipeMatch {
  recipe: MakeRecipe;
  /**
   * Required lines counted against the recipe: not met, even through a
   * sub-recipe — plus the close ones when close matches don't count.
   */
  missing: Requirement[];
  /** Lines met by making a recipe first: "Make lavender syrup first". */
  via: ViaRecipe[];
  /**
   * Lines met only by a close item, counted or not: when `countClose` is
   * off, each is in `missing` as well.
   */
  close: CloseMatch[];
  /** `missing.length`; an alternative group counts once. */
  distance: number;
}

export interface MakeableOptions {
  /** Count a close match as had (default `true`; `/make`'s toggle). */
  countClose?: boolean;
  /** Assumed on hand, matched like inventory items (default `DEFAULT_STAPLES`). */
  staples?: string[];
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

/**
 * A staple meets a line as an item would — `salt` meets "kosher salt",
 * `black pepper` meets "pepper" — and a one-word staple also meets the water
 * and ice lines `STAPLES` marks: `water` meets "tap water", which a vague
 * word could never stand for as an item.
 */
function stapleMeets(
  staple: InventoryItem,
  requirement: Requirement,
  aliases: AliasIndex,
): boolean {
  if (satisfies(staple, requirement, aliases)) return true;
  if (!requirement.staple) return false;
  return staple.names.some(
    (name) =>
      name.words.length === 1 &&
      requirement.alternatives.some((alternative) =>
        alternative.words.join(" ").split(" ").includes(name.words[0]),
      ),
  );
}

function isMet(
  requirement: Requirement,
  items: InventoryItem[],
  staples: InventoryItem[],
  aliases: AliasIndex,
): boolean {
  return (
    items.some((item) => satisfies(item, requirement, aliases)) ||
    staples.some((staple) => stapleMeets(staple, requirement, aliases))
  );
}

/** Every required line met directly — what a sub-recipe has to pass. */
function directlyMakeable(
  prepared: PreparedRecipe,
  items: InventoryItem[],
  staples: InventoryItem[],
  aliases: AliasIndex,
): boolean {
  return prepared.requirements.every(
    (requirement) =>
      requirement.optional || isMet(requirement, items, staples, aliases),
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
  { countClose = true, staples = DEFAULT_STAPLES }: MakeableOptions = {},
): MakeableAnalysis {
  const prepared = Array.isArray(corpus) ? prepareCorpus(corpus) : corpus;
  const items = inventory.map(parseInventoryItem);
  const stapleItems = staples.map(parseInventoryItem);
  const subMakeable = new Map<string, boolean>();
  const canMakeSub = (slug: string): boolean => {
    let known = subMakeable.get(slug);
    if (known === undefined) {
      const sub = prepared.recipes.get(slug);
      known =
        !!sub &&
        sub.requirements.length > 0 &&
        directlyMakeable(sub, items, stapleItems, prepared.aliases);
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
    const close: CloseMatch[] = [];
    for (const requirement of entry.requirements) {
      if (requirement.optional) continue;
      if (isMet(requirement, items, stapleItems, prepared.aliases)) continue;
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
        continue;
      }
      const near = items.find((item) =>
        closeTo(item, requirement, prepared.words),
      );
      if (near) {
        close.push({ requirement, item: near.text });
        if (countClose) continue;
      }
      missing.push(requirement);
    }
    const match: RecipeMatch = {
      recipe,
      missing,
      via,
      close,
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
 *
 * Staples (water, ice) are skipped by default: they always count as on hand,
 * so nobody adds them to an inventory. `includeStaples` keeps them, for
 * search's `ingredient:` completion (32f). That list offers what the lines
 * say, and `ingredient:wat` not offering "water" would read as a bug.
 */
export function suggestNames(
  corpus: MakeRecipe[] | PreparedCorpus,
  { includeStaples = false }: { includeStaples?: boolean } = {},
): string[] {
  const prepared = Array.isArray(corpus) ? prepareCorpus(corpus) : corpus;
  const counts = new Map<string, number>();
  const bump = (name: string) => {
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  for (const { requirements } of prepared.recipes.values()) {
    for (const requirement of requirements) {
      if (requirement.staple && !includeStaples) continue;
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
