import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { RecipeListEntry } from "./paginationConfigs";
import {
  HOLIDAYS_ROOT,
  SEASONAL_WINDOW_DAYS,
  holidayRuleKey,
  withinComingUpWindow,
  type CalendarDay,
} from "../util/holidays";
import { inventoryKey } from "../util/inventoryText";
import { tagSlug } from "./tagSlug";
import {
  mergeTermRows,
  ownAliases,
  subtreeKeys,
  subtreeSlugs,
  type TermRow,
} from "./tagVocabulary";

/**
 * `/drinks` (usability pass, U3; canvas B, 42d), the pure half: the tag tree
 * and the per-term recipe rows in, everything the page prints out.
 * `readDrinksPage.ts` reads; this decides — the `tagVocabulary.ts` split, for
 * the same reasons.
 *
 * Every count is distinct drinks: a recipe under the `drink` root that also
 * sits under the index's term. A `tea` recipe that is not a drink doesn't
 * count towards Tea, and a group never counts at all.
 */

/** Every drink carries `drink` (agent-mixology.md, D7). */
export const DRINK_ROOT = "drink";
/** "Spirit & base" (epic 33, D6): `vodka`, `gin`, `tea`… */
export const SPIRIT_ROOT = "spirit";
export { HOLIDAYS_ROOT };

/**
 * Which children of `drink` are styles rather than drink names.
 *
 * Nothing in the data says so: the styles (agent-mixology.md, D7, plus
 * `shaken` from 27c and `warm-drinks` from 34e) and the 56 drink-name
 * families (`margarita`, `negroni`… epic 33, D6) are all plain children of
 * `drink`. So the list is kept here, in display order for a tie. A child of
 * `drink` not named here is a family and goes under Classics; a slug named
 * here that the site doesn't have is left out.
 */
export const DRINK_STYLE_SLUGS = [
  "sour",
  "highball",
  "collins",
  "shaken",
  "stirred",
  "built",
  "batch",
  "low-abv",
  "zero-proof",
  "warm-drinks",
] as const;

/** How many families the index's Classics column lists before "All". */
export const CLASSICS_LIMIT = 24;
/** Drinks kept per holiday: its cards, then the names of "Also: …". */
export const DRINK_CARD_LIMIT = 6;
/**
 * A drink is NEW (42d, canvas B's mark — B drops the "New drinks" row) for
 * this many days after its recipe's date.
 */
export const NEW_DRINK_DAYS = 30;

/** An index line: a term and how many drinks are under it. */
export interface DrinkTerm {
  slug: string;
  label: string;
  count: number;
}

/** A drink card: the list entry plus its base and style, for the meta line. */
export interface DrinkCard extends RecipeListEntry {
  /** E.g. `["Tequila", "Shaken"]` — empty when neither is tagged. */
  meta: string[];
}

/** One holiday's drinks — the browser picks the pair (42d, `holidayPair`). */
export interface SeasonalDrinks {
  slug: string;
  label: string;
  /**
   * The `HOLIDAY_RULES` key that dates it — its slug, else an alias's
   * (`holidayRuleKey`, 42e); absent when undated, and then never in the pair.
   */
  rule?: string;
  /** Every drink under the holiday, before the card cap. */
  count: number;
  /** The newest `DRINK_CARD_LIMIT`. */
  drinks: DrinkCard[];
}

/**
 * What a drink's meta line is made of, for the browser too (42d: Pour now
 * is judged in the browser): which spirit a tag is under, and the styles.
 */
export interface DrinkMetaLookup {
  /** A tag slug in a spirit's subtree → that spirit's label. */
  bases: Record<string, string>;
  /** The styles the site has: slug → label. */
  styles: Record<string, string>;
}

export interface DrinksPageData {
  /** Every drink: distinct recipes under `drink`. */
  count: number;
  /** The `spirit` root's children, most drinks first. */
  spirits: DrinkTerm[];
  /** `DRINK_STYLE_SLUGS` the site has, most drinks first. */
  styles: DrinkTerm[];
  /** The other children of `drink` — drink names — most drinks first. */
  classics: DrinkTerm[];
  /** How many families there are, before `CLASSICS_LIMIT`. */
  classicsCount: number;
  /** Each child of `holidays` with at least one drink, in the tree's order. */
  seasonal: SeasonalDrinks[];
  /** The base · style line's lookup (`drinkMeta`). */
  meta: DrinkMetaLookup;
  /**
   * Each drink's drink-name families (38a): recipe slug → the family terms
   * it carries, most drinks first (then by label), for Pour now, which
   * groups several sources of one drink (Daiquiri ×2) behind one entry. A
   * family is a child of `drink` that is no style (`DRINK_STYLE_SLUGS`),
   * with its subtree and aliases. Which family a drink in two of them is
   * listed under depends on what is ready, so the list picks (`groupReady`);
   * a drink in none is absent.
   */
  familyOf: Record<string, Array<Pick<DrinkTerm, "slug" | "label">>>;
}

/** One entry of Pour now (38a's ready list). */
export type ReadyEntry<T extends { recipe: { slug: string } }> =
  | { kind: "recipe"; match: T }
  | {
      kind: "family";
      slug: string;
      label: string;
      /** Two or more ready drinks of the family, in the incoming order. */
      matches: T[];
    };

/**
 * The ready drinks as Pour now lists them (38a): two or more of one family
 * become one entry, at the place of the first of them; a family of one, and
 * a drink with no family, stays its own entry. The judge's order is kept.
 *
 * A drink in two families goes to the one with more *ready* drinks, then
 * the one with more drinks, then by label (`familyOf`'s order) — so a
 * Hemingway Daiquiri joins two ready Daiquiris rather than standing alone
 * as a Hemingway of one.
 */
export function groupReady<T extends { recipe: { slug: string } }>(
  matches: T[],
  familyOf: DrinksPageData["familyOf"],
): ReadyEntry<T>[] {
  const readyIn = new Map<string, number>();
  for (const match of matches) {
    for (const family of familyOf[match.recipe.slug] ?? []) {
      readyIn.set(family.slug, (readyIn.get(family.slug) ?? 0) + 1);
    }
  }
  const chosen = new Map<T, Pick<DrinkTerm, "slug" | "label">>();
  const byFamily = new Map<string, T[]>();
  for (const match of matches) {
    let family: Pick<DrinkTerm, "slug" | "label"> | undefined;
    for (const candidate of familyOf[match.recipe.slug] ?? []) {
      if (
        !family ||
        (readyIn.get(candidate.slug) ?? 0) > (readyIn.get(family.slug) ?? 0)
      ) {
        family = candidate;
      }
    }
    if (!family) continue;
    chosen.set(match, family);
    const list = byFamily.get(family.slug);
    if (list) list.push(match);
    else byFamily.set(family.slug, [match]);
  }
  const entries: ReadyEntry<T>[] = [];
  const placed = new Set<string>();
  for (const match of matches) {
    const family = chosen.get(match);
    const members = family && byFamily.get(family.slug);
    if (!family || !members || members.length < 2) {
      entries.push({ kind: "recipe", match });
    } else if (!placed.has(family.slug)) {
      placed.add(family.slug);
      entries.push({
        kind: "family",
        slug: family.slug,
        label: family.label,
        matches: members,
      });
    }
  }
  return entries;
}

/**
 * Every by-term key the page reads: the subtrees of `drink`, `spirit` and
 * `holidays`, and each style's (a style outside the `drink` tree still
 * counts — `warm-drinks` could move under `holidays` one day).
 */
export function drinksPageKeys(tree: TermTree | null | undefined): string[] {
  return [
    ...new Set(
      [DRINK_ROOT, SPIRIT_ROOT, HOLIDAYS_ROOT, ...DRINK_STYLE_SLUGS].flatMap(
        (slug) => subtreeKeys(tree, slug),
      ),
    ),
  ];
}

const byCountThenLabel = (a: DrinkTerm, b: DrinkTerm) =>
  b.count - a.count || a.label.localeCompare(b.label);

export function drinksPageData({
  tree,
  recipeRows,
}: {
  tree: TermTree | null | undefined;
  recipeRows: (key: string) => TermRow<RecipeListEntry> | null | undefined;
}): DrinksPageData {
  /* A term's recipes and its subtree's, newest first, each once. */
  const under = (slug: string) =>
    mergeTermRows(subtreeKeys(tree, slug).map((key) => recipeRows(key)?.items));

  const drinks = under(DRINK_ROOT);
  const isDrink = new Set(drinks.map((drink) => drink.slug));
  const drinksUnder = (slug: string) =>
    under(slug).filter((recipe) => isDrink.has(recipe.slug));
  const labelOf = (slug: string) =>
    tree?.[slug]?.label ?? recipeRows(slug)?.label ?? slug;
  const term = (slug: string): DrinkTerm => ({
    slug,
    label: labelOf(slug),
    count: drinksUnder(slug).length,
  });
  const childrenOf = (slug: string) =>
    (tree?.[slug]?.children ?? []).filter((child) => child !== slug);

  const spirits = childrenOf(SPIRIT_ROOT)
    .map(term)
    .filter((line) => line.count > 0)
    .sort(byCountThenLabel);
  const styleSlugs = new Set<string>(DRINK_STYLE_SLUGS);
  const styles = DRINK_STYLE_SLUGS.map(term)
    .filter((line) => line.count > 0)
    .sort((a, b) => b.count - a.count);
  const families = childrenOf(DRINK_ROOT)
    .filter((child) => !styleSlugs.has(child))
    .map(term)
    .filter((line) => line.count > 0)
    .sort(byCountThenLabel);

  /*
   * The card's meta line (`drinkMeta`): the subtree of each spirit, so a
   * `bourbon` tag under `whiskey` would still say Whiskey.
   */
  const meta: DrinkMetaLookup = { bases: {}, styles: {} };
  for (const spirit of childrenOf(SPIRIT_ROOT)) {
    for (const slug of subtreeSlugs(tree, spirit)) {
      meta.bases[slug] ??= labelOf(spirit);
    }
  }
  for (const style of styles) meta.styles[style.slug] = style.label;
  const card = (recipe: RecipeListEntry): DrinkCard => ({
    ...recipe,
    meta: drinkMeta(recipe.tags, meta),
  });

  const seasonal = childrenOf(HOLIDAYS_ROOT)
    .map((slug): SeasonalDrinks => {
      const found = drinksUnder(slug);
      const rule = holidayRuleKey(
        slug,
        ownAliases(tree, slug).map((alias) => tagSlug(alias)),
      );
      return {
        slug,
        label: labelOf(slug),
        ...(rule ? { rule } : {}),
        count: found.length,
        drinks: found.slice(0, DRINK_CARD_LIMIT).map(card),
      };
    })
    .filter((holiday) => holiday.count > 0);

  /* Each drink's families in `families`' own order: most drinks, then label. */
  const familyOf: DrinksPageData["familyOf"] = {};
  for (const family of families) {
    for (const recipe of drinksUnder(family.slug)) {
      (familyOf[recipe.slug] ??= []).push({
        slug: family.slug,
        label: family.label,
      });
    }
  }

  return {
    count: drinks.length,
    spirits,
    styles,
    classics: families.slice(0, CLASSICS_LIMIT),
    classicsCount: families.length,
    seasonal,
    meta,
    familyOf,
  };
}

/**
 * A drink's meta line, "Tequila · Sour": the first base, then the first
 * style (`DRINK_STYLE_SLUGS`' order), by the tags it carries. Empty when
 * neither is tagged. Pure, so the server's cards and the browser's Pour now
 * rows say the same.
 */
export function drinkMeta(
  tags: readonly string[] | undefined,
  lookup: DrinkMetaLookup,
): string[] {
  const slugs = (tags ?? []).map((tag) => tagSlug(tag));
  const base = slugs.map((slug) => lookup.bases[slug]).find(Boolean);
  const style = DRINK_STYLE_SLUGS.find(
    (slug) => slugs.includes(slug) && lookup.styles[slug],
  );
  return [base, style && lookup.styles[style]].filter(
    (part): part is string => !!part,
  );
}

/** Which list counts — `/make`'s Count from (41h), as `CountFrom`. */
type ShelfSource = "browser" | "saved" | "both";

/** A label on `/drinks`' shelf: an item and whose list it is on. */
export interface ShelfLabel {
  item: string;
  /** `have`: this browser's (tape). `saved`: the second list's (outlined). */
  kind: "have" | "saved";
}

/**
 * The shelf as `/drinks` shows it (42d): exactly the list Count from counts
 * (`countFromItems`) — this browser's labels when it counts, then the second
 * list's that this browser doesn't also have. Never a list that doesn't
 * count: the shelf is what the numbers beside it judge.
 */
export function shelfLabels(
  source: ShelfSource,
  browser: string[],
  second?: string[],
): ShelfLabel[] {
  const counting = second ? source : "browser";
  const labels: ShelfLabel[] = [];
  const seen = new Set<string>();
  if (counting !== "saved") {
    for (const item of browser) {
      const key = inventoryKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push({ item, kind: "have" });
    }
  }
  if (counting !== "browser") {
    for (const item of second ?? []) {
      const key = inventoryKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push({ item, kind: "saved" });
    }
  }
  return labels;
}

/**
 * The line under the question (42d): whose list the shelf is, and how
 * many things are on it — "From your saved list — 23 things on the
 * shelf." `secondKind` names the second list: the signed-in editor's
 * `saved` list or the export's `house` list.
 */
export function shelfSourceLine(
  source: ShelfSource,
  secondKind: "saved" | "house" | undefined,
  size: number,
): string {
  const second = secondKind === "house" ? "the house list" : "your saved list";
  const whose =
    !secondKind || source === "browser"
      ? "this browser's list"
      : source === "saved"
        ? second
        : `this browser and ${second}`;
  if (size === 0) {
    return source === "both" && secondKind
      ? "Nothing on the shelf yet."
      : `Nothing on the shelf yet — ${whose} is empty.`;
  }
  return `From ${whose} — ${size} ${size === 1 ? "thing" : "things"} on the shelf.`;
}

/** NEW (42d): dated within `NEW_DRINK_DAYS` before `now` (both epoch ms). */
export function isNewDrink(date: number, now: number): boolean {
  const age = now - date;
  return age >= 0 && age < NEW_DRINK_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * A pair slot (42d): the sooner holiday is "now" while it is in season
 * (38a's 60-day window, the old row's rule) and "soon" further off; the
 * later one is "next".
 */
export type PairSlot = "now" | "soon" | "next";

/**
 * The current and next holiday (42d, canvas B's "In season"): the holidays
 * with drinks that fall within the homepage's "Coming up" window
 * (`withinComingUpWindow`, 180 days), soonest first, cut to two. Undated
 * holidays never qualify, and an empty answer hides the section.
 */
export function holidayPair<T extends { slug: string; rule?: string }>(
  holidays: T[],
  today: CalendarDay,
): Array<T & { days: number; slot: PairSlot }> {
  return withinComingUpWindow(holidays, today)
    .slice(0, 2)
    .map((holiday, i) => ({
      ...holiday,
      slot:
        i > 0 ? "next" : holiday.days <= SEASONAL_WINDOW_DAYS ? "now" : "soon",
    }));
}

/**
 * "Also: Apple Cider Mimosa, Mulled Cider and 3 more." — the drinks a pair
 * slot has after the cards it shows. `names` are the drinks kept (newest
 * first), `total` every drink under the holiday, `shown` the cards before
 * them, and at most `listed` are named. A trailing "(Source)" is dropped,
 * as `/make`'s `namesAndMore` does. Empty when nothing is left over.
 */
export function alsoLine(
  names: string[],
  total: number,
  shown: number,
  listed = 3,
): string {
  const rest = names
    .slice(shown, shown + listed)
    .map((name) => name.replace(/\s*\([^)]*\)\s*$/, ""));
  if (rest.length === 0) return "";
  const more = total - shown - rest.length;
  if (more > 0) return `Also: ${rest.join(", ")} and ${more} more.`;
  if (rest.length === 1) return `Also: ${rest[0]}.`;
  return `Also: ${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}.`;
}
