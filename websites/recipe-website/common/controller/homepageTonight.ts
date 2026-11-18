import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { RecipeListEntry } from "./paginationConfigs";
import { holidayChildren, holidayRule, menuStyles } from "./holidaysPage";
import { tagSlug } from "./tagSlug";
import { mergeTermRows, subtreeKeys, type TermRow } from "./tagVocabulary";

/**
 * The homepage's "Tonight" row (48e, canvas B), the pure half: a quick
 * dinner, and something warm to drink when the season calls for one. No
 * model and no guess — tags and dates only:
 *
 * - **A quick dinner** is a recipe tagged `quick` (epic 33's D2: done in 30
 *   minutes or less) and filed under the `main` course, each term's subtree
 *   and aliases included, as `tag:quick tag:main` finds them.
 * - **Something warm** is a recipe under `warm-drinks`. It is in season when
 *   a dated holiday within `/drinks`' 60-day window (38a,
 *   `SEASONAL_WINDOW_DAYS`) has a warm drink filed under it — the corpus's
 *   own say on when warm drinks are wanted, rather than a calendar rule in
 *   code (canvas B's "Nov–Feb").
 *
 * The server hands over every candidate, in a fixed order (by slug), and the
 * reader's day picks among them (`homepageDay`): which recipe is tonight's
 * moves once a day and is the same for everyone that day. The export is
 * static, so a build day's pick would stay up for weeks.
 */

export const QUICK_TERM = "quick";
export const MAIN_COURSE = "main";
export const WARM_TERM = "warm-drinks";
export const EASY_TERM = "easy";
export const CUISINE_ROOT = "cuisine";

/** One Tonight candidate, as its card prints it. */
export interface TonightRecipe {
  slug: string;
  name: string;
  image?: string;
  /** Total minutes, else prep + cook (48a's card rule); absent with none. */
  minutes?: number;
  /** The card's words after the time: "Chinese · easy", "Batch". */
  meta: string[];
}

export interface TonightCandidates {
  quick: TonightRecipe[];
  warm: TonightRecipe[];
  /** The dated holidays a warm drink is filed under: the warm season. */
  warmHolidays: Array<{ slug: string; rule: string }>;
}

type RecipeRows = (key: string) => TermRow<RecipeListEntry> | null | undefined;

function labelOf(tree: TermTree | null | undefined, slug: string): string {
  const label = tree?.[slug]?.label;
  if (label) return label;
  const spaced = slug.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Tag slug → the label of the first of `terms` whose subtree holds it. */
function termLookup(
  tree: TermTree | null | undefined,
  terms: string[],
): Map<string, string> {
  const found = new Map<string, string>();
  for (const term of terms) {
    for (const key of subtreeKeys(tree, term)) {
      if (!found.has(key)) found.set(key, labelOf(tree, term));
    }
  }
  return found;
}

function rowsUnder(
  tree: TermTree | null | undefined,
  slug: string,
  recipeRows: RecipeRows,
): RecipeListEntry[] {
  return mergeTermRows(
    subtreeKeys(tree, slug).map((key) => recipeRows(key)?.items),
  );
}

function minutesOf(row: RecipeListEntry): number | undefined {
  const minutes = row.totalTime || (row.prepTime ?? 0) + (row.cookTime ?? 0);
  return minutes > 0 ? minutes : undefined;
}

const bySlug = (a: { slug: string }, b: { slug: string }) =>
  a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;

/** The row's tags as slugs, each once. */
function tagsOf(row: RecipeListEntry): string[] {
  return [...new Set((row.tags ?? []).map((tag) => tagSlug(tag)))];
}

/**
 * Tonight's candidates from the tree and the by-term rows: every quick main
 * and every warm drink, by slug, and the holidays that make the warm season.
 * Empty lists when the site has no such terms — the row then shows what it
 * has, and nothing at all with neither (`Tonight`).
 */
export function tonightCandidates({
  tree,
  recipeRows,
}: {
  tree: TermTree | null | undefined;
  recipeRows: RecipeRows;
}): TonightCandidates {
  const mains = new Set(subtreeKeys(tree, MAIN_COURSE));
  const easy = new Set(subtreeKeys(tree, EASY_TERM));
  const cuisines = termLookup(
    tree,
    (tree?.[CUISINE_ROOT]?.children ?? []).filter(
      (child) => child !== CUISINE_ROOT,
    ),
  );
  const styles = termLookup(
    tree,
    menuStyles(tree)
      .map((style) => style.slug)
      .filter((slug) => slug !== WARM_TERM),
  );

  const quick = rowsUnder(tree, QUICK_TERM, recipeRows)
    .filter((row) => tagsOf(row).some((tag) => mains.has(tag)))
    .map((row): TonightRecipe => {
      const tags = tagsOf(row);
      const cuisine = tags.map((tag) => cuisines.get(tag)).find(Boolean);
      const minutes = minutesOf(row);
      return {
        slug: row.slug,
        name: row.name,
        ...(row.image ? { image: row.image } : {}),
        ...(minutes ? { minutes } : {}),
        meta: [
          ...(cuisine ? [cuisine] : []),
          ...(tags.some((tag) => easy.has(tag)) ? ["easy"] : []),
        ],
      };
    })
    .sort(bySlug);

  const warmRows = rowsUnder(tree, WARM_TERM, recipeRows);
  const warm = warmRows
    .map((row): TonightRecipe => {
      const labels = [
        ...new Set(
          tagsOf(row).flatMap((tag) => {
            const label = styles.get(tag);
            return label ? [label] : [];
          }),
        ),
      ].slice(0, 2);
      const minutes = minutesOf(row);
      return {
        slug: row.slug,
        name: row.name,
        ...(row.image ? { image: row.image } : {}),
        ...(minutes ? { minutes } : {}),
        meta: labels,
      };
    })
    .sort(bySlug);

  const warmTags = warmRows.map((row) => tagsOf(row));
  const warmHolidays = holidayChildren(tree).flatMap((slug) => {
    const rule = holidayRule(tree, slug);
    if (!rule) return [];
    const keys = new Set(subtreeKeys(tree, slug));
    return warmTags.some((tags) => tags.some((tag) => keys.has(tag)))
      ? [{ slug, rule }]
      : [];
  });

  return { quick, warm, warmHolidays };
}
