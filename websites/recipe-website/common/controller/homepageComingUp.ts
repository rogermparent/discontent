import {
  HOLIDAYS_ROOT,
  HOLIDAY_RULES,
  holidayRuleKey,
  withinComingUpWindow,
  type CalendarDay,
} from "../util/holidays";
import { tagSlug } from "./tagSlug";
import type { TermHierarchyNode } from "./tagVocabulary";

/**
 * The homepage's "This season" section, as plain values (usability pass,
 * 2026-10-15, "Coming up" until 42f): the children of the `holidays` root
 * (epic 34e), each with how many recipes and plans sit under it, a picture,
 * and a few of its recipes to show as a strip.
 *
 * Which ones show and in what order is a question about *today*, which the
 * static export cannot answer at build time — so this hands over every
 * holiday that leads somewhere, and the browser orders and cuts them
 * (`ThisSeason`, by `util/holidays.ts`).
 */

/** The root whose children are the holidays. */
export { HOLIDAYS_ROOT };

/** The fields of a by-term row this needs. */
export interface ComingUpRow {
  slug: string;
  date?: number;
  image?: string;
}

export interface ComingUpEntry extends TermSummary {
  slug: string;
  label: string;
  /**
   * The `HOLIDAY_RULES` key that dates it (42e's `holidayRuleKey`: its slug,
   * else an alias's), absent for an undated holiday.
   */
  rule?: string;
  /** A few of its recipes for the row's strip (`seasonPicks`). */
  picks: SeasonPick[];
  /** Whether a feature points at this holiday's term (42f: shown here, not twice). */
  featured?: boolean;
}

/** One recipe in a season row's strip. */
export interface SeasonPick {
  slug: string;
  name?: string;
  image?: string;
}

/** How many recipes a season row shows as pictures (42f, canvas B). */
export const SEASON_PICKS = 4;

/** How many holidays "This season" shows (42f: the canvas's three). */
export const SEASON_LIMIT = 3;

/**
 * The season's rows on `today`: the next `SEASON_LIMIT` holidays within the
 * 180-day window (`withinComingUpWindow`), soonest first. The browser
 * asks, with the reader's day (the server's for the first render): which
 * rows show, and which featured holidays they stand in for.
 */
export function seasonRows<T extends { slug: string; rule?: string }>(
  entries: T[],
  today: CalendarDay,
): Array<T & { days: number }> {
  return withinComingUpWindow(entries, today).slice(0, SEASON_LIMIT);
}

/**
 * The holidays a date rule covers (`util/holidays.ts`, D4) — the only ones
 * a season row can show. An undated holiday never has a row. Dated by
 * `rule` when the entry carries one (an alias's rule, 42e), else its slug.
 */
export function datedHolidays<T extends { slug: string; rule?: string }>(
  entries: T[],
): T[] {
  return entries.filter((entry) =>
    Object.prototype.hasOwnProperty.call(
      HOLIDAY_RULES,
      entry.rule ?? entry.slug,
    ),
  );
}

function subtree(node: Pick<TermHierarchyNode, "slug" | "children">): string[] {
  return [node.slug, ...node.children.flatMap(subtree)];
}

type RecipeRows = (slug: string) => Array<ComingUpRow & { name?: string }>;
type GroupRows = (slug: string) => ComingUpRow[];

/** A term's picture and counts — what Coming up and the featured strip show. */
export interface TermSummary {
  /** Distinct recipes of the term and every term under it. */
  recipes: number;
  /** Distinct groups ("plans") of the same subtree. */
  groups: number;
  /** The term record's own picture. */
  image?: string;
  /** Else the newest recipe under it that has a photo. */
  recipeImage?: { slug: string; image: string; name?: string };
}

/** The node for `slug` anywhere in the hierarchy, or `undefined`. */
export function findTermNode(
  tree: TermHierarchyNode[],
  slug: string,
): TermHierarchyNode | undefined {
  for (const node of tree) {
    if (node.slug === slug) return node;
    const found = findTermNode(node.children, slug);
    if (found) return found;
  }
  return undefined;
}

/**
 * One term's counts and picture over its subtree. `recipeRows` and
 * `groupRows` are a term's **own** carriers (the by-term maps' items); the
 * subtree is walked here, so a recipe tagged both `christmas` and a child of
 * it counts once. A term outside the hierarchy (no record, or a leaf root) is
 * passed as a bare node and counts its own carriers.
 *
 * The picture precedence is the one every term tile on the homepage uses:
 * the record's image, else the newest recipe photo under it, else (in the
 * component) a monogram.
 */
export function termSummary(
  node: Pick<TermHierarchyNode, "slug" | "image" | "children">,
  recipeRows: RecipeRows,
  groupRows: GroupRows,
): TermSummary {
  const slugs = subtree(node);
  const recipes = new Map<string, ComingUpRow & { name?: string }>();
  for (const slug of slugs) {
    for (const row of recipeRows(slug)) recipes.set(row.slug, row);
  }
  const groups = new Set(
    slugs.flatMap((slug) => groupRows(slug).map((row) => row.slug)),
  );
  const pictured = [...recipes.values()]
    .filter((row) => row.image)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  return {
    recipes: recipes.size,
    groups: groups.size,
    ...(node.image ? { image: node.image } : {}),
    ...(!node.image && pictured?.image
      ? {
          recipeImage: {
            slug: pictured.slug,
            image: pictured.image,
            ...(pictured.name ? { name: pictured.name } : {}),
          },
        }
      : {}),
  };
}

/** The facet root whose children name a dish's course (epic 33, D1). */
export const COURSE_ROOT = "course";

/**
 * Recipe slug → its course's label ("Mains", "Desserts"), for the featured
 * strip's recipe cards. A recipe with two courses gets the bigger one; a
 * recipe with none is absent, and the card says "Recipe".
 */
export function courseLabels(
  tree: TermHierarchyNode[],
  recipeRows: RecipeRows,
): Map<string, string> {
  const labels = new Map<string, string>();
  const course = tree.find((node) => node.slug === COURSE_ROOT);
  if (!course) return labels;
  const children = [...course.children].sort((a, b) => b.total - a.total);
  for (const child of children) {
    for (const slug of subtree(child)) {
      for (const row of recipeRows(slug)) {
        if (!labels.has(row.slug)) labels.set(row.slug, child.label);
      }
    }
  }
  return labels;
}

/**
 * The holidays, in the tree's order, or `null` when there is no `holidays`
 * root at all — the cue to render no section. A holiday nothing is tagged
 * with is left out: a card that leads to an empty page is a dead end.
 */
export function comingUpEntries(
  tree: TermHierarchyNode[],
  recipeRows: RecipeRows,
  groupRows: GroupRows,
  root: string = HOLIDAYS_ROOT,
): ComingUpEntry[] | null {
  const holidays = tree.find((node) => node.slug === root);
  if (!holidays) return null;
  return holidays.children
    .map((node): ComingUpEntry => {
      const rule = holidayRuleKey(
        node.slug,
        (node.aliases ?? []).map((alias) => tagSlug(alias)),
      );
      return {
        slug: node.slug,
        label: node.label,
        ...(rule ? { rule } : {}),
        ...termSummary(node, recipeRows, groupRows),
        picks: seasonPicks(node, recipeRows),
      };
    })
    .filter((entry) => entry.recipes + entry.groups > 0);
}

/**
 * A holiday's strip (42f): up to `limit` distinct recipes of its subtree,
 * those with a photo first, newest first within each half — so a holiday
 * with four photographed recipes shows four photos, and one with fewer fills
 * the rest with monograms rather than leaving a gap.
 */
export function seasonPicks(
  node: Pick<TermHierarchyNode, "slug" | "children">,
  recipeRows: RecipeRows,
  limit: number = SEASON_PICKS,
): SeasonPick[] {
  const recipes = new Map<string, ComingUpRow & { name?: string }>();
  for (const slug of subtree(node)) {
    for (const row of recipeRows(slug)) recipes.set(row.slug, row);
  }
  const newest = (a: ComingUpRow, b: ComingUpRow) =>
    (b.date ?? 0) - (a.date ?? 0);
  const rows = [...recipes.values()];
  return [
    ...rows.filter((row) => row.image).sort(newest),
    ...rows.filter((row) => !row.image).sort(newest),
  ]
    .slice(0, limit)
    .map((row) => ({
      slug: row.slug,
      ...(row.name ? { name: row.name } : {}),
      ...(row.image ? { image: row.image } : {}),
    }));
}

/**
 * Each row marked when a feature points at its holiday's term (42f): the
 * canvas found Halloween, Thanksgiving and Christmas shown twice — once in
 * "Coming up", again in "Featured", with the same photos. A featured holiday
 * now shows once, as its season row saying "featured".
 */
export function markFeaturedHolidays(
  entries: ComingUpEntry[],
  featuredTerms: ReadonlySet<string>,
): ComingUpEntry[] {
  return entries.map((entry) =>
    featuredTerms.has(entry.slug) ? { ...entry, featured: true } : entry,
  );
}

/**
 * The other half of that rule: the featured list without the features whose
 * holiday has a season row (`shown`, the browser's day's rows). Anything
 * else — recipes, plans, terms that are not holidays, and a holiday outside
 * the window — stays. `holiday` is set on a feature of a dated holiday term.
 */
export function withoutSeasonFeatures<T extends { holiday?: string }>(
  features: T[],
  shown: ReadonlySet<string>,
): T[] {
  return features.filter(
    (entry) => !entry.holiday || !shown.has(entry.holiday),
  );
}

/**
 * The features the server hands the featured list (42f): newest first,
 * enough that `limit` remain after the browser hides the holidays in season
 * — every entry up to and including the `limit`th that is not a holiday
 * (`isHoliday`). Which holidays hide is the browser's day's question, so the
 * server cannot cut to six itself; the list then shows the first `limit` it
 * keeps.
 *
 * A dangling entry still takes its slot here (the caller drops it after),
 * so a deleted recipe among the newest yields a shorter list rather than
 * pulling an older feature forward — the rule `getFeaturedRecipes({ limit:
 * 6 })` set.
 */
export function featureCandidates<T>(
  items: T[],
  isHoliday: (item: T) => boolean,
  limit: number,
): T[] {
  const kept: T[] = [];
  let others = 0;
  for (const item of items) {
    if (others >= limit) break;
    kept.push(item);
    if (!isHoliday(item)) others += 1;
  }
  return kept;
}
