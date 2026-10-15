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
  CLASS_NOUNS_EITHER_WAY,
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

/**
 * Pantry staples (usability pass, U5): what most kitchens keep, assumed on
 * hand while "Assume pantry staples" is on — **on by default**, on `/make`,
 * in `inventory_makeable` (`staples: false` turns it off) and in `recipes
 * inventory make` (`--no-staples`). Matched as an inventory item is, so
 * `flour` meets "all-purpose flour" and `sugar` "granulated sugar"; and
 * through the close tier, so `vegetable oil` stands in for canola oil and
 * `eggs` for egg yolks — the close note says so, and "Count close matches"
 * still decides whether that counts. `STAPLE_NOT_MODIFIERS` keeps a staple
 * off the lines it only shares a last word with (almond flour, brown sugar).
 *
 * The page prints this list beside the switch, so it reads as people write.
 */
export const PANTRY_STAPLES = [
  "flour",
  "sugar",
  "butter",
  "eggs",
  "vegetable oil",
  "olive oil",
  "milk",
  "baking soda",
  "baking powder",
];

/**
 * Words that make a staple's name another ingredient: almond flour is not
 * flour, brown sugar is not sugar, oat milk is not milk, apple butter is not
 * butter. A line naming one of these before the staple's own words is never
 * met — or stood in for — by a staple; it is by an inventory item.
 */
export const STAPLE_NOT_MODIFIERS = new Set([
  "almond",
  "apple",
  "brown",
  "buckwheat",
  "cashew",
  "chickpea",
  "chocolate",
  "cocoa",
  "coconut",
  "condensed",
  "confectioner",
  "confectioners",
  "evaporated",
  "hazelnut",
  "icing",
  "maple",
  "nut",
  "oat",
  "pistachio",
  "powdered",
  "rice",
  "soy",
  "tapioca",
]);

/**
 * The staples `analyzeMakeable` assumes: `base` (the always-on list,
 * `DEFAULT_STAPLES` unless edited) plus `PANTRY_STAPLES` while `pantry` is
 * on. `/make` builds its list with this, so a page that passes
 * `useMakeSettings().staples` to the judge gets the switch for free.
 */
export function assumedStaples(
  base: string[] = DEFAULT_STAPLES,
  pantry = true,
): string[] {
  if (!pantry) return base;
  const seen = new Set(base.map((item) => item.trim().toLowerCase()));
  return [
    ...base,
    ...PANTRY_STAPLES.filter((item) => !seen.has(item.toLowerCase())),
  ];
}

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

/**
 * Shortest word the typo rule touches (32j review): at five letters too many
 * real words sit one edit apart — basil/basic, sheet/sheep, grape/grade.
 */
const MIN_TYPO_WORD = 6;

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
 * The same word, typed differently: one edit apart, both 6+ letters, the
 * same first letter (a typo rarely starts the word — capers/paper and
 * Lillet/fillet are different things), not a known pair of different things
 * (`cherry`/`sherry`, `tomato`/`potato`) — and only when one side is
 * unusual. The item's word is one the corpus never uses (the person's
 * spelling), or the line's word is rare (the corpus's typo). Two words the
 * corpus uses freely are two things.
 */
function typoOf(
  itemWord: string,
  lineWord: string,
  counts: WordCounts | undefined,
): boolean {
  if (itemWord === lineWord) return false;
  if (itemWord.length < MIN_TYPO_WORD || lineWord.length < MIN_TYPO_WORD) {
    return false;
  }
  if (itemWord[0] !== lineWord[0]) return false;
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
 * - **class noun** — the shorter name on hand for the line with its kind
 *   (`garlic` for `garlic powder`, `basmati` for `basmati rice`), never the
 *   other way: garlic powder is no stand-in for a garlic clove. Cheese alone
 *   goes both ways (`parmesan cheese` for `parmesan`);
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
  const classDrop = (long: string[], short: string[], kinds: Set<string>) =>
    long.length === short.length + 1 &&
    kinds.has(long[long.length - 1]) &&
    short.every((word, i) => long[i] === word);
  if (classDrop(line, have, CLASS_NOUNS)) return true;
  if (classDrop(have, line, CLASS_NOUNS_EITHER_WAY)) return true;
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

/**
 * The inventory sorted by what could make it close to a line (32j review):
 * a close match needs a shared group, a shared head, a line that is the item
 * plus a kind, or a word of the same first letter and near length. Looking
 * those up skips nearly every pair `closeTo` would otherwise try; the
 * candidates it returns are a superset, and `closeTo` still decides.
 */
interface CloseIndex {
  items: InventoryItem[];
  byGroup: Map<number, Set<number>>;
  byPair: Map<number, Set<number>>;
  byHead: Map<string, Set<number>>;
  /** Words of the item, joined: the line is these plus a class noun. */
  byWords: Map<string, Set<number>>;
  /** Words of the item without its trailing either-way class noun. */
  byShortWords: Map<string, Set<number>>;
  /** `<first letter>:<length>` a typo of one of the item's words may have. */
  byTypo: Map<string, Set<number>>;
}

function addTo<K>(map: Map<K, Set<number>>, key: K, index: number) {
  let found = map.get(key);
  if (!found) {
    found = new Set();
    map.set(key, found);
  }
  found.add(index);
}

function buildCloseIndex(items: InventoryItem[]): CloseIndex {
  const index: CloseIndex = {
    items,
    byGroup: new Map(),
    byPair: new Map(),
    byHead: new Map(),
    byWords: new Map(),
    byShortWords: new Map(),
    byTypo: new Map(),
  };
  items.forEach((item, i) => {
    for (const { words } of item.names) {
      if (words.length === 0) continue;
      CLOSE_GROUPS.forEach((group, g) => {
        if (memberOf(group, words)) addTo(index.byGroup, g, i);
      });
      CLOSE_PAIRS.forEach(([from], p) => {
        if (isTail(from, words)) addTo(index.byPair, p, i);
      });
      addTo(index.byHead, words[words.length - 1], i);
      addTo(index.byWords, words.join(" "), i);
      if (CLASS_NOUNS_EITHER_WAY.has(words[words.length - 1])) {
        addTo(index.byShortWords, words.slice(0, -1).join(" "), i);
      }
      for (const word of words) {
        if (word.length < MIN_TYPO_WORD || word.includes(" ")) continue;
        for (const length of [word.length - 1, word.length, word.length + 1]) {
          addTo(index.byTypo, `${word[0]}:${length}`, i);
        }
      }
    }
  });
  return index;
}

/** What a line's name looks up in a `CloseIndex` — a pure function of its words. */
interface LineKeys {
  groups: number[];
  pairs: number[];
  head: string;
  /** The words less the last, when there is more than one. */
  prefix?: string;
  full: string;
  typo: string[];
}

/** Memoized per name object, which a prepared corpus keeps across calls. */
const lineKeyCache = new WeakMap<IngredientName, LineKeys | null>();
function lineKeys(name: IngredientName): LineKeys | null {
  let keys = lineKeyCache.get(name);
  if (keys === undefined) {
    const line = name.words;
    keys =
      line.length === 0
        ? null
        : {
            groups: CLOSE_GROUPS.flatMap((group, g) =>
              memberOf(group, line) ? [g] : [],
            ),
            pairs: CLOSE_PAIRS.flatMap(([, to], p) =>
              isTail(to, line) ? [p] : [],
            ),
            head: line[line.length - 1],
            prefix: line.length > 1 ? line.slice(0, -1).join(" ") : undefined,
            full: line.join(" "),
            typo: line.flatMap((word) =>
              word.length >= MIN_TYPO_WORD && !word.includes(" ")
                ? [`${word[0]}:${word.length}`]
                : [],
            ),
          };
    lineKeyCache.set(name, keys);
  }
  return keys;
}

/** The first item, in inventory order, close to `requirement`. */
function firstClose(
  index: CloseIndex,
  requirement: Requirement,
  counts: WordCounts,
): InventoryItem | undefined {
  if (requirement.loose) return undefined;
  const candidates = new Set<number>();
  const take = (found?: Set<number>) => {
    if (found) for (const i of found) candidates.add(i);
  };
  for (const alternative of requirement.alternatives) {
    const keys = lineKeys(alternative);
    if (!keys) continue;
    for (const g of keys.groups) take(index.byGroup.get(g));
    for (const p of keys.pairs) take(index.byPair.get(p));
    take(index.byHead.get(keys.head));
    if (keys.prefix !== undefined) take(index.byWords.get(keys.prefix));
    take(index.byShortWords.get(keys.full));
    for (const key of keys.typo) take(index.byTypo.get(key));
  }
  if (candidates.size === 0) return undefined;
  for (const i of [...candidates].sort((a, b) => a - b)) {
    if (closeTo(index.items[i], requirement, counts)) return index.items[i];
  }
  return undefined;
}

/**
 * What a requirement asks, as a key: two lines naming the same thing the
 * same way get the same answer, so one call judges each once (32j review).
 * Memoized per requirement object: a prepared corpus keeps its requirements
 * across calls, so the key is built once, not once per keystroke.
 */
const signatures = new WeakMap<Requirement, string>();
function requirementSignature(requirement: Requirement): string {
  let signature = signatures.get(requirement);
  if (signature === undefined) {
    signature = [
      requirement.alternatives.map(nameKey).join("|"),
      requirement.loose ? "~" : "",
      requirement.staple ? "!" : "",
      requirement.aliasKeys.join("|"),
    ].join("#");
    signatures.set(requirement, signature);
  }
  return signature;
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
  /**
   * Assumed on hand, matched like inventory items: the whole list. Absent,
   * `DEFAULT_STAPLES` plus — unless `pantryStaples` is `false` —
   * `PANTRY_STAPLES` (U5: pantry staples are on by default).
   */
  staples?: string[];
  /**
   * Add `PANTRY_STAPLES` to `staples` (U5). Defaults to `true` when `staples`
   * is absent and to `false` when it is given, since a given list is whole:
   * `/make` passes `assumedStaples(alwaysHave, switch)` already built.
   */
  pantryStaples?: boolean;
}

/** `options`' staples as the judge sees them (see `MakeableOptions`). */
export function resolveStaples({
  staples,
  pantryStaples,
}: Pick<MakeableOptions, "staples" | "pantryStaples"> = {}): string[] {
  return assumedStaples(
    staples ?? DEFAULT_STAPLES,
    pantryStaples ?? staples === undefined,
  );
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
 * The alternatives a staple may meet: those with no `STAPLE_NOT_MODIFIERS`
 * word before their last — "almond flour" and "brown sugar" are out, "all-
 * purpose flour" is in. Memoized per requirement, which a prepared corpus
 * keeps across calls.
 */
const stapleOpen = new WeakMap<Requirement, IngredientName[]>();
function stapleAlternatives(requirement: Requirement): IngredientName[] {
  let open = stapleOpen.get(requirement);
  if (!open) {
    open = requirement.alternatives.filter(
      ({ words }) =>
        !words.slice(0, -1).some((word) => STAPLE_NOT_MODIFIERS.has(word)),
    );
    stapleOpen.set(requirement, open);
  }
  return open;
}

/**
 * A staple meets a line as an item would — `salt` meets "kosher salt",
 * `black pepper` meets "pepper" — and a one-word staple also meets the water
 * and ice lines `STAPLES` marks: `water` meets "tap water", which a vague
 * word could never stand for as an item.
 */
function stapleMeets(
  staple: InventoryItem,
  requirement: Requirement,
  aliases?: AliasIndex,
): boolean {
  const open = stapleAlternatives(requirement);
  if (open.length === 0) return false;
  const narrowed =
    open.length === requirement.alternatives.length
      ? requirement
      : { ...requirement, alternatives: open };
  if (satisfies(staple, narrowed, aliases)) return true;
  if (!requirement.staple) return false;
  return staple.names.some(
    (name) =>
      name.words.length === 1 &&
      requirement.alternatives.some((alternative) =>
        alternative.words.join(" ").split(" ").includes(name.words[0]),
      ),
  );
}

/**
 * Is `requirement` probably on hand — met by an inventory item or a staple?
 * The shopping list's "probably on hand" fold (epic 35, D3): the same rules
 * as `/make`, without the corpus's alias check (a brand on the list meets a
 * line naming it), since the list judges lines one at a time.
 */
export function probablyOnHand(
  requirement: Requirement,
  items: InventoryItem[],
  staples: InventoryItem[],
): boolean {
  return (
    items.some((item) => satisfies(item, requirement)) ||
    staples.some((staple) => stapleMeets(staple, requirement))
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

function byName(a: RecipeMatch, b: RecipeMatch): number {
  return a.recipe.name.localeCompare(b.recipe.name);
}

interface JudgementCache {
  key: string;
  met: Map<string, boolean>;
  close: Map<string, InventoryItem | null>;
}

const judgements = new WeakMap<PreparedCorpus, JudgementCache[]>();

/**
 * Answers kept per corpus: one per inventory a page judges side by side
 * (U6: this browser's list, and it with the secondary list), most recent
 * first, so alternating between them re-judges nothing.
 */
const JUDGEMENTS_KEPT = 4;

/** An inventory's answers for this corpus, or fresh maps for a new one. */
function judgementCache(
  prepared: PreparedCorpus,
  inventory: string[],
  staples: string[],
): JudgementCache {
  const key = JSON.stringify([inventory, staples]);
  const kept = judgements.get(prepared) ?? [];
  const found = kept.findIndex((cache) => cache.key === key);
  const cache =
    found >= 0 ? kept[found] : { key, met: new Map(), close: new Map() };
  judgements.set(prepared, [
    cache,
    ...kept.filter((other) => other !== cache).slice(0, JUDGEMENTS_KEPT - 1),
  ]);
  return cache;
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
  options: MakeableOptions = {},
): MakeableAnalysis {
  const { countClose = true } = options;
  const staples = resolveStaples(options);
  const prepared = Array.isArray(corpus) ? prepareCorpus(corpus) : corpus;
  const items = inventory.map(parseInventoryItem);
  const stapleItems = staples.map(parseInventoryItem);
  /*
   * By requirement signature, since lines repeat across the corpus — and
   * kept with the prepared corpus while the inventory, staples and toggle-
   * independent answers stay the same, so retyping the scope (the page's
   * per-keystroke rerun) judges no line twice.
   */
  const { met: metCache, close: closeCache } = judgementCache(
    prepared,
    inventory,
    staples,
  );
  const met = (requirement: Requirement): boolean => {
    const key = requirementSignature(requirement);
    let known = metCache.get(key);
    if (known === undefined) {
      known = isMet(requirement, items, stapleItems, prepared.aliases);
      metCache.set(key, known);
    }
    return known;
  };
  let closeIndex: CloseIndex | undefined;
  let stapleCloseIndex: CloseIndex | undefined;
  /* The list's own items first; a staple stands in only where no item does
   * and the line is one a staple may meet at all (U5). */
  const nearest = (requirement: Requirement): InventoryItem | undefined => {
    const key = requirementSignature(requirement);
    let known = closeCache.get(key);
    if (known === undefined) {
      closeIndex ??= buildCloseIndex(items);
      known = firstClose(closeIndex, requirement, prepared.words) ?? null;
      if (!known && stapleItems.length > 0) {
        const open = stapleAlternatives(requirement);
        if (open.length > 0) {
          stapleCloseIndex ??= buildCloseIndex(stapleItems);
          known =
            firstClose(
              stapleCloseIndex,
              open.length === requirement.alternatives.length
                ? requirement
                : { ...requirement, alternatives: open },
              prepared.words,
            ) ?? null;
        }
      }
      closeCache.set(key, known);
    }
    return known ?? undefined;
  };
  const subMakeable = new Map<string, boolean>();
  const canMakeSub = (slug: string): boolean => {
    let known = subMakeable.get(slug);
    if (known === undefined) {
      const sub = prepared.recipes.get(slug);
      known =
        !!sub &&
        sub.requirements.length > 0 &&
        sub.requirements.every(
          (requirement) => requirement.optional || met(requirement),
        );
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
      if (met(requirement)) continue;
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
      const near = nearest(requirement);
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
