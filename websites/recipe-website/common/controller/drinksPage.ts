import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { RecipeListEntry } from "./paginationConfigs";
import { HOLIDAYS_ROOT } from "../util/holidays";
import { tagSlug } from "./tagSlug";
import {
  mergeTermRows,
  subtreeKeys,
  subtreeSlugs,
  type TermRow,
} from "./tagVocabulary";

/**
 * `/drinks` (usability pass, U3), the pure half: the tag tree and the per-term
 * recipe rows in, everything the page prints out. `readDrinksPage.ts` reads;
 * this decides — the `tagVocabulary.ts` split, for the same reasons.
 *
 * Every count is distinct drinks: a recipe under the `drink` root that also
 * sits under the tile's term. A `tea` recipe that is not a drink doesn't
 * count towards the Tea tile, and a group never counts at all.
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
 * `drink` not named here is a family and goes in the Classics row; a slug
 * named here that the site doesn't have is left out.
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

/** How many family chips the Classics row shows before "All drinks". */
export const CLASSICS_LIMIT = 24;
/** Drink cards in "New drinks" and in a seasonal row. */
export const DRINK_CARD_LIMIT = 6;

/** A tile or a chip: a term and how many drinks are under it. */
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

/** One holiday's drinks — the client picks which holiday is next. */
export interface SeasonalDrinks {
  slug: string;
  label: string;
  /** Every drink under the holiday, before the card cap. */
  count: number;
  drinks: DrinkCard[];
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
  /** The newest drinks. */
  latest: DrinkCard[];
  /**
   * Each drink's drink-name families (38a): recipe slug → the family terms
   * it carries, most drinks first (then by label), for the make panel's
   * ready list, which groups several sources of one drink (Daiquiri ×2)
   * behind one entry. A family is a child of `drink` that is no style
   * (`DRINK_STYLE_SLUGS`), with its subtree and aliases. Which family a drink
   * in two of them is listed under depends on what is ready, so the list
   * picks (`groupReady`); a drink in none is absent.
   */
  familyOf: Record<string, Array<Pick<DrinkTerm, "slug" | "label">>>;
}

/** One entry of the make panel's ready list (38a). */
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
 * The ready drinks as the panel lists them (38a): two or more of one family
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
    .filter((tile) => tile.count > 0)
    .sort(byCountThenLabel);
  const styleSlugs = new Set<string>(DRINK_STYLE_SLUGS);
  const styles = DRINK_STYLE_SLUGS.map(term)
    .filter((chip) => chip.count > 0)
    .sort((a, b) => b.count - a.count);
  const families = childrenOf(DRINK_ROOT)
    .filter((child) => !styleSlugs.has(child))
    .map(term)
    .filter((chip) => chip.count > 0)
    .sort(byCountThenLabel);

  /*
   * The card's meta line: the first base, then the first style, by the tag
   * the recipe carries — the subtree of each tile, so a `bourbon` tag under
   * `whiskey` would still say Whiskey.
   */
  const baseOf = new Map<string, string>();
  for (const spirit of childrenOf(SPIRIT_ROOT)) {
    for (const slug of subtreeSlugs(tree, spirit)) {
      if (!baseOf.has(slug)) baseOf.set(slug, labelOf(spirit));
    }
  }
  const styleLabels = new Map(styles.map((style) => [style.slug, style.label]));
  const card = (recipe: RecipeListEntry): DrinkCard => {
    const tags = (recipe.tags ?? []).map(tagSlug);
    const base = tags.map((tag) => baseOf.get(tag)).find(Boolean);
    const style = DRINK_STYLE_SLUGS.find((slug) => tags.includes(slug));
    return {
      ...recipe,
      meta: [base, style && styleLabels.get(style)].filter(
        (part): part is string => !!part,
      ),
    };
  };

  const seasonal = childrenOf(HOLIDAYS_ROOT)
    .map((slug) => {
      const found = drinksUnder(slug);
      return {
        slug,
        label: labelOf(slug),
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
    latest: drinks.slice(0, DRINK_CARD_LIMIT).map(card),
    familyOf,
  };
}
