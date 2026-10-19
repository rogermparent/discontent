import { DRINK_ROOT } from "../../controller/drinksPage";
import {
  activeFacetSlugs,
  countFacets,
  facetGroups,
  type FacetKind,
  type FacetModel,
  type FacetRecipe,
} from "../../util/facets";
import { formatDurationCompact } from "../../util/formatDuration";
import { normalizeUnit, parseAmount } from "../../util/ingredientAmount";
import { orderByNextOccurrence, type CalendarDay } from "../../util/holidays";
import { fold } from "./queryLanguage";

/**
 * How `/search` lays a result set out (43s, canvas B "Sorted by what it is").
 * Pure, and **presentation only**: every function here partitions or labels
 * the list it is given and keeps its order, so the engine's ranking and the
 * filter's result set (42s, `searchIndex.test.ts`) are untouched — a band is
 * a slice of the ranked list, never a re-ranking of it.
 *
 * - **Kinds** — Drinks and Food, four cards each and an "Also:" line, when a
 *   result set holds both and the query names no Kind (`tag:drink` /
 *   `-tag:drink`, D3). The band holding the best match comes first, so the
 *   first card on the page is still the top result.
 * - **Seasons** — a `tag:` query opens on its term (`subjectOf`), and its
 *   results band by date: the holidays among them in the order they come
 *   round, then the Collections, then "Any time" (what neither holds). A
 *   recipe sits in every band it belongs to, as the canvas notes.
 * - **Grid** — everything else: one kind, or a Kind already chosen.
 */

/** What a card and a band read from a recipe. `FacetRecipe` plus a little. */
export interface ViewRecipe extends FacetRecipe {
  slug: string;
  name: string;
  description?: string;
  ingredients?: string[];
  totalTime?: number;
  prepTime?: number;
  cookTime?: number;
}

/** Is the recipe a drink — does any of its tags sit under `drink`? */
export function isDrinkRecipe(model: FacetModel, recipe: FacetRecipe): boolean {
  for (const tag of recipe.tags ?? []) {
    const slug = tag ? model.resolve(tag) : undefined;
    if (slug !== undefined && model.ancestors(slug).includes(DRINK_ROOT)) {
      return true;
    }
  }
  return false;
}

/** Does the recipe carry `slug`, an alias of it, or anything under it? */
export function isUnder(
  model: FacetModel,
  recipe: FacetRecipe,
  slug: string,
): boolean {
  for (const tag of recipe.tags ?? []) {
    const resolved = tag ? model.resolve(tag) : undefined;
    if (resolved !== undefined && model.ancestors(resolved).includes(slug)) {
      return true;
    }
  }
  return false;
}

// --- kinds --------------------------------------------------------------------

/** Cards a band shows before its "Also:" line. */
export const BAND_CARDS = 4;
/** Names the "Also:" line lists before "N more". */
export const BAND_ALSO = 5;

export interface KindBand<R> {
  kind: FacetKind;
  /** Every result of this kind, in result order. */
  recipes: R[];
  /** The first `BAND_CARDS`. */
  cards: R[];
  /** The next `BAND_ALSO`, named on the "Also:" line. */
  also: R[];
  /** How many more past those. */
  more: number;
}

/**
 * Drinks and Food, when the results hold both — else `undefined` (one kind
 * is a plain grid). The band with the best match leads.
 */
export function kindBands<R extends FacetRecipe>(
  model: FacetModel,
  recipes: readonly R[],
): KindBand<R>[] | undefined {
  const drinks: R[] = [];
  const food: R[] = [];
  for (const recipe of recipes) {
    (isDrinkRecipe(model, recipe) ? drinks : food).push(recipe);
  }
  if (drinks.length === 0 || food.length === 0) return undefined;
  const band = (kind: FacetKind, list: R[]): KindBand<R> => ({
    kind,
    recipes: list,
    cards: list.slice(0, BAND_CARDS),
    also: list.slice(BAND_CARDS, BAND_CARDS + BAND_ALSO),
    more: Math.max(0, list.length - BAND_CARDS - BAND_ALSO),
  });
  const bands = [band("drinks", drinks), band("food", food)];
  return recipes[0] && !isDrinkRecipe(model, recipes[0])
    ? bands.reverse()
    : bands;
}

// --- the subject: a `tag:` query opens on its term ---------------------------------

/**
 * The term a query is about: the positive `tag:` terms it names (the Kind
 * aside), when they lie on one line of the tree — the deepest of them, so
 * `tag:cookies tag:linzer-cookies` (a Narrower chip pressed) is about Linzer
 * Cookies. Only a term with a record is a subject: a bare carried string has
 * no place, description or narrower terms to show.
 */
export function subjectOf(
  model: FacetModel,
  query: string,
): string | undefined {
  const active = [...activeFacetSlugs(model, query)].filter(
    (slug) => slug !== DRINK_ROOT,
  );
  if (active.length === 0) return undefined;
  const deepest = active.find((slug) => {
    const line = model.ancestors(slug);
    return active.every((other) => line.includes(other));
  });
  if (deepest === undefined || !model.terms.get(deepest)?.record) {
    return undefined;
  }
  return deepest;
}

/** "Course › Desserts": where the subject sits, root first, itself left out. */
export function breadcrumbOf(model: FacetModel, slug: string): string[] {
  return model
    .ancestors(slug)
    .slice(1)
    .reverse()
    .map((up) => model.terms.get(up)?.label ?? up);
}

// --- seasons ----------------------------------------------------------------------

export interface SeasonBand<R> {
  slug: string;
  label: string;
  kind: "holiday" | "collection";
  /** Days until the holiday comes round; absent for an undated one. */
  days?: number;
  recipes: R[];
}

export interface SeasonView<R> {
  bands: SeasonBand<R>[];
  /** "Any time": the results no band holds, in result order. */
  rest: R[];
}

/**
 * The subject's results by date (canvas B, `tag:cookies`): each holiday that
 * holds some of them, soonest first (`orderByNextOccurrence`, 42e), then each
 * Collection, biggest first; "Any time" is the rest. A band on the subject's
 * own line of the tree (itself, an ancestor, a descendant) is left out — it
 * would hold everything. `undefined` when no band holds anything: the
 * results are then one band, which is a plain grid.
 */
export function seasonBands<R extends FacetRecipe>(
  model: FacetModel,
  recipes: readonly R[],
  subject: string,
  today: CalendarDay,
): SeasonView<R> | undefined {
  const line = new Set(model.ancestors(subject));
  const groups = facetGroups(model, countFacets(model, recipes));
  const rowsOf = (id: string) =>
    groups
      .find((group) => group.id === id)
      ?.rows.filter(
        (row) =>
          row.count > 0 &&
          !line.has(row.slug) &&
          !model.ancestors(row.slug).includes(subject),
      ) ?? [];

  const members = (slug: string) =>
    recipes.filter((recipe) => isUnder(model, recipe, slug));

  const bands: SeasonBand<R>[] = [];
  for (const row of orderByNextOccurrence(rowsOf("holidays"), today)) {
    bands.push({
      slug: row.slug,
      label: row.label,
      kind: "holiday",
      ...(row.days !== undefined ? { days: row.days } : {}),
      recipes: members(row.slug),
    });
  }
  for (const row of rowsOf("collections")) {
    bands.push({
      slug: row.slug,
      label: row.label,
      kind: "collection",
      recipes: members(row.slug),
    });
  }
  if (bands.length === 0) return undefined;
  const banded = new Set(bands.flatMap((band) => band.recipes));
  return { bands, rest: recipes.filter((recipe) => !banded.has(recipe)) };
}

// --- a card's meta line -------------------------------------------------------------

/** The deepest term the recipe carries under `root`, as a label. */
function deepestUnder(
  model: FacetModel,
  recipe: FacetRecipe,
  roots: readonly string[],
): string | undefined {
  let best: { label: string; depth: number } | undefined;
  for (const tag of recipe.tags ?? []) {
    const slug = tag ? model.resolve(tag) : undefined;
    if (slug === undefined) continue;
    const line = model.ancestors(slug);
    const at = line.findIndex((up) => roots.includes(up));
    if (at === -1 || roots.includes(slug)) continue;
    /* Depth below the root: Desserts 1, Cookies 2. */
    if (!best || at > best.depth) {
      best = { label: model.terms.get(slug)?.label ?? slug, depth: at };
    }
  }
  return best?.label;
}

/** The first top-level row of a group the recipe carries (Highball, Sour). */
function rowUnder(
  model: FacetModel,
  recipe: FacetRecipe,
  rows: readonly string[],
): string | undefined {
  for (const tag of recipe.tags ?? []) {
    const slug = tag ? model.resolve(tag) : undefined;
    if (slug === undefined) continue;
    const row = model.ancestors(slug).find((up) => rows.includes(up));
    if (row !== undefined) return model.terms.get(row)?.label ?? row;
  }
  return undefined;
}

/** Total minutes, else prep + cook. */
export function minutesOf(recipe: ViewRecipe): number | undefined {
  if (recipe.totalTime) return recipe.totalTime;
  const sum = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  return sum > 0 ? sum : undefined;
}

/**
 * A card's meta line, as parts: what it is — a drink's style (else its
 * family), a dish's course at its most specific — then how long it takes,
 * or its speed & effort term when it has no time (canvas: "Highball · 5m",
 * "Desserts", "Sauces · Quick").
 */
export function recipeMeta(
  model: FacetModel,
  recipe: ViewRecipe,
  drink = isDrinkRecipe(model, recipe),
): string[] {
  const group = (id: string) => model.groups.find((g) => g.id === id);
  const parts: string[] = [];
  if (drink) {
    const what =
      rowUnder(model, recipe, group("style")?.rows ?? []) ??
      rowUnder(model, recipe, group("families")?.rows ?? []);
    if (what) parts.push(what);
  } else {
    const course = group("course")?.root;
    const what = course ? deepestUnder(model, recipe, [course]) : undefined;
    if (what) parts.push(what);
  }
  const minutes = minutesOf(recipe);
  if (minutes !== undefined) {
    parts.push(formatDurationCompact(minutes));
  } else if (!drink) {
    const effort = group("effort")?.root;
    const how = effort ? deepestUnder(model, recipe, [effort]) : undefined;
    if (how) parts.push(how);
  }
  return parts;
}

// --- the "why" line -------------------------------------------------------------

/** The free text's words, folded, as the highlighter reads them. */
export function queryWords(text: string): string[] {
  return text
    .split(" ")
    .map((word) => fold(word))
    .filter(Boolean);
}

/** Would `highlightText` mark something in `text`? Its rule, word-prefix. */
export function textMatches(text: string, words: readonly string[]): boolean {
  if (words.length === 0) return false;
  return text.split(" ").some((word) => {
    const folded = fold(word);
    return words.some((needle) => folded.startsWith(needle));
  });
}

const QTY = String.raw`(?:\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+|\s*[½¼¾⅓⅔⅛⅜⅝⅞])?|[½¼¾⅓⅔⅛⅜⅝⅞])`;
const AMOUNT_HEAD_RE = new RegExp(
  String.raw`^\s*((?:about|approx\.?|~)\s*)?${QTY}(?:\s*(?:-|–|to)\s*${QTY})?`,
  "i",
);

/**
 * A line's amount as it is written at its start — "1 1/2 oz", "120 g",
 * "1 T", "2" — and the rest of the line, for the "why" line's mono column.
 * Only when `parseAmount` reads an amount from the line, and only when the
 * amount leads it: "juice of 2 limes" shows as written, with no column.
 */
export function leadingAmount(
  line: string,
): { amount: string; rest: string } | undefined {
  const parsed = parseAmount(line);
  if (!parsed || parsed.parts.length === 0) return undefined;
  const head = AMOUNT_HEAD_RE.exec(line);
  if (!head) return undefined;
  let amount = head[0].trim();
  let rest = line.slice(head[0].length);
  /* The unit after it, if it is one: two words first ("fl oz"), then one. */
  const words = /^\s*(\S+)(?:\s+(\S+))?/.exec(rest);
  if (words) {
    const two = words[2] ? `${words[1]} ${words[2]}` : undefined;
    if (two && normalizeUnit(two)) {
      amount = `${amount} ${two}`;
      rest = rest.slice(words[0].length);
    } else if (normalizeUnit(words[1].replace(/[,;]$/, ""))) {
      amount = `${amount} ${words[1].replace(/[,;]$/, "")}`;
      rest = rest.replace(/^\s*\S+/, "");
    }
  }
  rest = rest.replace(/^\s*(?:of\s+)?/i, "").trim();
  if (!rest) return undefined;
  return { amount, rest };
}

export type WhyMatch =
  | { kind: "ingredient"; line: string; amount?: string; rest: string }
  | { kind: "description"; text: string };

/**
 * Why a card is in the results, when its name does not say: the first
 * ingredient line the free text marks (with its amount, once the lines have
 * loaded — 42s fetches them lazily, so before then there is no line and no
 * layout jump), else the description when that is where it matched.
 */
export function whyMatch(
  recipe: ViewRecipe,
  words: readonly string[],
): WhyMatch | undefined {
  if (words.length === 0) return undefined;
  for (const line of recipe.ingredients ?? []) {
    if (!textMatches(line, words)) continue;
    const split = leadingAmount(line);
    return split
      ? { kind: "ingredient", line, amount: split.amount, rest: split.rest }
      : { kind: "ingredient", line, rest: line };
  }
  if (recipe.description && textMatches(recipe.description, words)) {
    return { kind: "description", text: recipe.description };
  }
  return undefined;
}

// --- browse roots -------------------------------------------------------------------

export interface BrowseRoot {
  slug: string;
  label: string;
  /** Terms under the root, at any depth. */
  terms: number;
}

/**
 * "Or browse by" on a search that found nothing: each facet root the site
 * has (Course, Cuisine, Main ingredient, Spirit & base…), with how many
 * terms it holds — `/tags/<root>` lists them. Families' root is `drink`,
 * which is the Kind rather than a facet, so it is left out.
 */
export function browseRoots(model: FacetModel): BrowseRoot[] {
  const count = (slug: string): number =>
    model.children(slug).reduce((total, child) => total + 1 + count(child), 0);
  return model.groups
    .filter((group) => group.root !== undefined && group.id !== "families")
    .map((group) => ({
      slug: group.root as string,
      label: group.label,
      terms: count(group.root as string),
    }))
    .filter((root) => root.terms > 0);
}
