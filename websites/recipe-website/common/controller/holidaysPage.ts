import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { RecipeListEntry } from "./paginationConfigs";
import { DRINK_ROOT, DRINK_STYLE_SLUGS, SPIRIT_ROOT } from "./drinksPage";
import { COURSE_ROOT } from "./homepageComingUp";
import { tagSlug } from "./tagSlug";
import {
  aliasTarget,
  applyPinned,
  mergeTermRows,
  ownAliases,
  subtreeKeys,
  type TermRow,
} from "./tagVocabulary";
import {
  HOLIDAYS_ROOT,
  addDays,
  daysBetween,
  formatMonthTick,
  holidayRuleKey,
  nextOccurrence,
  orderByNextOccurrence,
  type CalendarDay,
} from "../util/holidays";

/**
 * The holiday pages (42e), the pure half: `/holidays` — the almanac, a
 * to-scale year of the holidays that have recipes — and `/holidays/<slug>`,
 * one holiday's menu. The tag tree and the per-term recipe rows in, what the
 * pages print out; `data/readHolidays.ts` reads. The `drinksPage.ts` split,
 * for the same reasons: everything here takes plain values, so the rules are
 * unit-tested without an index, and the browser can import it.
 *
 * **Which terms are holidays.** The children of the `holidays` root (epic
 * 34e), however many there are — the content repo adds them as it likes
 * (42k). A child's page lists its subtree, aliases included, as its term
 * page does (34a). Dates per D4: `util/holidays.ts`' rules, looked up by the
 * term's slug, then by its aliases (`holidayRuleKey`); a term with no rule is
 * undated and goes last.
 *
 * **Kinds.** A recipe is a drink when one of its tags is in the `drink`
 * subtree (or an alias of a term in it) — what `tag:drink`, the Make page's
 * Drinks kind, finds — and a dish otherwise, as Make's Food kind is
 * `-tag:drink`. The ids are `MAKE_KINDS`' (`food`, `drinks`).
 */

/** The other facet root the menu reads (epic 33), beside `course`. */
export const MAIN_INGREDIENT_ROOT = "main-ingredient";
export { COURSE_ROOT, HOLIDAYS_ROOT };

/**
 * The order courses print in on a menu: a meal's order, not the tree's (the
 * tree keeps its children oldest first, which is the order the curator made
 * them). A course not named here follows, in the tree's order; a slug named
 * here that the site doesn't have is skipped. Like `DRINK_STYLE_SLUGS`, a
 * list kept in code because nothing in the data says it.
 */
export const MENU_COURSE_ORDER = [
  "breakfast",
  "snack",
  "soup",
  "salad",
  "main",
  "side",
  "bread",
  "sauce",
  "dessert",
] as const;

/** How far the almanac's ruler reaches: a year from today. */
export const ALMANAC_WINDOW_DAYS = 365;
/** Recipe names on an almanac card, pinned first. */
export const ALMANAC_TOP_RECIPES = 3;
/** Picture cards at the top of a menu page, for the kind shown. */
export const MENU_LEAD_CARDS = 4;
/** The group of a menu's dishes (or drinks) with no course (or style). */
export const MORE_GROUP = "more";

export type HolidayKind = "food" | "drinks";

/** One recipe of a holiday, as the pages list it. */
export interface HolidayRecipe {
  slug: string;
  name: string;
  date: number;
  image?: string;
  kind: HolidayKind;
  /** Food: the course term it is grouped under (`MENU_COURSE_ORDER`). */
  course?: string;
  /** Drinks: the style term it is grouped under (`DRINK_STYLE_SLUGS`). */
  style?: string;
  /**
   * The right-hand side of its menu line: a drink's spirit or base, a dish's
   * main ingredient — the label of the root's child it sits under.
   */
  base?: string;
}

export interface HolidayCounts {
  /** Every recipe under the holiday. */
  recipes: number;
  /** Of them, not drinks. */
  dishes: number;
  drinks: number;
}

/** One holiday on the almanac. */
export interface HolidayEntry extends HolidayCounts {
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it; absent when undated. */
  rule?: string;
  /** The term record's own picture. */
  image?: string;
  /** Else the newest recipe photo under it. */
  recipeImage?: { slug: string; image: string; name?: string };
  /** The first few recipes, pinned first, then the newest. */
  top: Array<{ slug: string; name: string }>;
}

/** A labelled run of a menu: a course, a style, or "More". */
export interface MenuGroup {
  slug: string;
  label: string;
  recipes: HolidayRecipe[];
}

/** One holiday's menu page. */
export interface HolidayMenuData {
  slug: string;
  label: string;
  rule?: string;
  description?: string;
  image?: string;
  counts: HolidayCounts;
  /** Every recipe, pinned first, then the newest — the lead cards' order. */
  recipes: HolidayRecipe[];
  /** Dishes by course (`MENU_COURSE_ORDER`), then "More". */
  courses: MenuGroup[];
  /** Drinks by style (`DRINK_STYLE_SLUGS`), then "More". */
  styles: MenuGroup[];
}

type RecipeRows = (key: string) => TermRow<RecipeListEntry> | null | undefined;

/** A record's fields these pages read. */
export interface HolidayRecord {
  label?: string;
  description?: string;
  image?: string;
  pinned?: string[];
}

/** The holidays: the `holidays` root's children, in the tree's order. */
export function holidayChildren(tree: TermTree | null | undefined): string[] {
  return (tree?.[HOLIDAYS_ROOT]?.children ?? []).filter(
    (child) => child !== HOLIDAYS_ROOT,
  );
}

/** Every by-term key the almanac reads: each holiday's subtree and aliases. */
export function holidayKeys(tree: TermTree | null | undefined): string[] {
  return [
    ...new Set(
      holidayChildren(tree).flatMap((child) => subtreeKeys(tree, child)),
    ),
  ];
}

/** The rule that dates a holiday term: by slug, then by alias (42e). */
export function holidayRule(
  tree: TermTree | null | undefined,
  slug: string,
): string | undefined {
  return holidayRuleKey(
    slug,
    ownAliases(tree, slug).map((alias) => tagSlug(alias)),
  );
}

/**
 * The holiday `/holidays/<slug>` should send the reader on to, when `slug`
 * is no holiday but an alias of one (`christmas-cookies` → `christmas`) —
 * else `undefined`, and the page is a 404.
 */
export function holidayAliasTarget(
  tree: TermTree | null | undefined,
  slug: string,
): { slug: string; label: string } | undefined {
  /* A term of its own is never an alias here, as `ownAliases` has it. */
  if (tree?.[slug] || holidayChildren(tree).includes(slug)) return undefined;
  const target = aliasTarget(tree, slug);
  if (!target || !holidayChildren(tree).includes(target)) return undefined;
  return { slug: target, label: tree?.[target]?.label ?? target };
}

/** "warm-drinks" → "Warm drinks", for a term with no record. */
function slugLabel(slug: string): string {
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelOf(tree: TermTree | null | undefined, slug: string): string {
  return tree?.[slug]?.label ?? slugLabel(slug);
}

/** The children of `root`, as `{slug, label}`, in the tree's order. */
function childTerms(
  tree: TermTree | null | undefined,
  root: string,
): Array<{ slug: string; label: string }> {
  return (tree?.[root]?.children ?? [])
    .filter((child) => child !== root)
    .map((slug) => ({ slug, label: labelOf(tree, slug) }));
}

/** The course terms in menu order: `MENU_COURSE_ORDER`, then the rest. */
export function menuCourses(
  tree: TermTree | null | undefined,
): Array<{ slug: string; label: string }> {
  const courses = childTerms(tree, COURSE_ROOT);
  const rank = (slug: string) => {
    const at = (MENU_COURSE_ORDER as readonly string[]).indexOf(slug);
    return at === -1 ? MENU_COURSE_ORDER.length : at;
  };
  return courses
    .map((course, index) => ({ course, index }))
    .sort(
      (a, b) => rank(a.course.slug) - rank(b.course.slug) || a.index - b.index,
    )
    .map(({ course }) => course);
}

/** The drink styles, in `DRINK_STYLE_SLUGS`' order. */
export function menuStyles(
  tree: TermTree | null | undefined,
): Array<{ slug: string; label: string }> {
  return DRINK_STYLE_SLUGS.map((slug) => ({
    slug,
    label: labelOf(tree, slug),
  }));
}

/**
 * Tag slug → the first of `terms` whose subtree (aliases included) holds
 * it, with that term's place in `terms` (`earliestTerm` picks by it).
 */
function firstTermOf(
  tree: TermTree | null | undefined,
  terms: Array<{ slug: string; label: string }>,
): Map<string, RankedTerm> {
  const found = new Map<string, RankedTerm>();
  terms.forEach((term, rank) => {
    for (const key of subtreeKeys(tree, term.slug)) {
      if (!found.has(key)) found.set(key, { ...term, rank });
    }
  });
  return found;
}

interface RankedTerm {
  slug: string;
  label: string;
  /** Its place in the list it came from: lower is earlier. */
  rank: number;
}

/**
 * The earliest of `terms` (by their list's order, not the tags' order) that
 * any of `tags` falls under — so a recipe tagged `dessert` and `breakfast`
 * is breakfast on a menu (De5), whichever tag it lists first.
 */
function earliestTerm(
  tags: string[],
  terms: Map<string, RankedTerm>,
): RankedTerm | undefined {
  let best: RankedTerm | undefined;
  for (const tag of tags) {
    const term = terms.get(tag);
    if (term && (!best || term.rank < best.rank)) best = term;
  }
  return best;
}

/**
 * How the pages see a recipe: its kind, course or style, and base — from its
 * own tags and the tree, no read. Built once per page.
 */
export function holidayRecipeOf(
  tree: TermTree | null | undefined,
): (recipe: RecipeListEntry) => HolidayRecipe {
  const drinkKeys = new Set(subtreeKeys(tree, DRINK_ROOT));
  const courseOf = firstTermOf(tree, menuCourses(tree));
  const styleOf = firstTermOf(tree, menuStyles(tree));
  const spiritOf = firstTermOf(tree, childTerms(tree, SPIRIT_ROOT));
  const ingredientOf = firstTermOf(
    tree,
    childTerms(tree, MAIN_INGREDIENT_ROOT),
  );
  return (recipe) => {
    const tags = (recipe.tags ?? []).map((tag) => tagSlug(tag));
    const kind: HolidayKind = tags.some((tag) => drinkKeys.has(tag))
      ? "drinks"
      : "food";
    const course = kind === "food" ? earliestTerm(tags, courseOf) : undefined;
    const style = kind === "drinks" ? earliestTerm(tags, styleOf) : undefined;
    const base = earliestTerm(
      tags,
      kind === "drinks" ? spiritOf : ingredientOf,
    );
    return {
      slug: recipe.slug,
      name: recipe.name,
      date: recipe.date,
      ...(recipe.image ? { image: recipe.image } : {}),
      kind,
      ...(course ? { course: course.slug } : {}),
      ...(style ? { style: style.slug } : {}),
      ...(base ? { base: base.label } : {}),
    };
  };
}

function countsOf(recipes: HolidayRecipe[]): HolidayCounts {
  const drinks = recipes.filter((recipe) => recipe.kind === "drinks").length;
  return { recipes: recipes.length, dishes: recipes.length - drinks, drinks };
}

/** A holiday's recipes over its subtree, each once, pinned first. */
function holidayRecipes(
  tree: TermTree | null | undefined,
  slug: string,
  recipeRows: RecipeRows,
  pinned: string[] | undefined,
  view: (recipe: RecipeListEntry) => HolidayRecipe,
): { rows: RecipeListEntry[]; recipes: HolidayRecipe[] } {
  const rows = mergeTermRows(
    subtreeKeys(tree, slug).map((key) => recipeRows(key)?.items),
  );
  return { rows, recipes: applyPinned(rows, pinned).map(view) };
}

/**
 * The almanac's holidays (42e): each child of `holidays` that has a recipe,
 * in the tree's order — the browser orders them by today (`almanacView`),
 * because the export is static. `null` when there is no `holidays` root.
 * `records` answers each holiday's record (for its pins); the picture
 * precedence is Coming up's: the record's image, else the newest recipe
 * photo under it.
 */
export function holidayEntries({
  tree,
  records,
  recipeRows,
}: {
  tree: TermTree | null | undefined;
  records: (slug: string) => HolidayRecord | null | undefined;
  recipeRows: RecipeRows;
}): HolidayEntry[] | null {
  if (!tree?.[HOLIDAYS_ROOT]) return null;
  const view = holidayRecipeOf(tree);
  return holidayChildren(tree)
    .map((slug): HolidayEntry => {
      const record = records(slug);
      const { rows, recipes } = holidayRecipes(
        tree,
        slug,
        recipeRows,
        record?.pinned,
        view,
      );
      const image = record?.image ?? tree?.[slug]?.image;
      const pictured = rows.find((row) => row.image);
      const rule = holidayRule(tree, slug);
      return {
        slug,
        label: record?.label ?? labelOf(tree, slug),
        ...(rule ? { rule } : {}),
        ...countsOf(recipes),
        ...(image ? { image } : {}),
        ...(!image && pictured?.image
          ? {
              recipeImage: {
                slug: pictured.slug,
                image: pictured.image,
                name: pictured.name,
              },
            }
          : {}),
        top: recipes
          .slice(0, ALMANAC_TOP_RECIPES)
          .map(({ slug: recipe, name }) => ({ slug: recipe, name })),
      };
    })
    .filter((entry) => entry.recipes > 0);
}

/**
 * `recipes` as labelled runs: one per term of `terms` that has any, in
 * `terms`' order, each keeping the incoming order — then the rest under
 * "More". `key` picks the field a recipe's term is in.
 */
export function menuGroups(
  recipes: HolidayRecipe[],
  terms: Array<{ slug: string; label: string }>,
  key: "course" | "style",
): MenuGroup[] {
  const groups = terms
    .map((term) => ({
      ...term,
      recipes: recipes.filter((recipe) => recipe[key] === term.slug),
    }))
    .filter((group) => group.recipes.length > 0);
  const known = new Set(terms.map((term) => term.slug));
  const rest = recipes.filter(
    (recipe) => !recipe[key] || !known.has(recipe[key]),
  );
  return rest.length > 0
    ? [...groups, { slug: MORE_GROUP, label: "More", recipes: rest }]
    : groups;
}

/**
 * One holiday's menu (42e), or `null` when `slug` is no child of the
 * `holidays` root — the cue for a 404, or an alias redirect
 * (`holidayAliasTarget`). A holiday nothing is filed under yet still has a
 * page, which says so.
 */
export function holidayMenuData({
  slug,
  tree,
  record,
  recipeRows,
}: {
  slug: string;
  tree: TermTree | null | undefined;
  record?: HolidayRecord | null;
  recipeRows: RecipeRows;
}): HolidayMenuData | null {
  if (!holidayChildren(tree).includes(slug)) return null;
  const { recipes } = holidayRecipes(
    tree,
    slug,
    recipeRows,
    record?.pinned,
    holidayRecipeOf(tree),
  );
  const rule = holidayRule(tree, slug);
  const image = record?.image ?? tree?.[slug]?.image;
  return {
    slug,
    label: record?.label ?? labelOf(tree, slug),
    ...(rule ? { rule } : {}),
    ...(record?.description ? { description: record.description } : {}),
    ...(image ? { image } : {}),
    counts: countsOf(recipes),
    recipes,
    courses: menuGroups(
      recipes.filter((recipe) => recipe.kind === "food"),
      menuCourses(tree),
      "course",
    ),
    styles: menuGroups(
      recipes.filter((recipe) => recipe.kind === "drinks"),
      menuStyles(tree),
      "style",
    ),
  };
}

/** The recipes of one kind (`MAKE_KINDS`' id); `any` keeps them all. */
export function recipesOfKind<T extends { kind: HolidayKind }>(
  recipes: T[],
  kind: string,
): T[] {
  return kind === "any"
    ? recipes
    : recipes.filter((recipe) => recipe.kind === kind);
}

/** How many recipes each `MAKE_KINDS` id holds. */
export function kindCounts(counts: HolidayCounts): Map<string, number> {
  return new Map([
    ["any", counts.recipes],
    ["food", counts.dishes],
    ["drinks", counts.drinks],
  ]);
}

// --- the almanac's calendar (in the browser) --------------------------------

/** A month's first day on the ruler. */
export interface AlmanacTick {
  key: string;
  label: string;
  /** 0 at today, 1 at the window's end. */
  position: number;
}

export type DatedHoliday<T> = T & {
  days: number;
  date: CalendarDay;
  /** On the ruler, 0–1; absent past the window's end. */
  position?: number;
};

export interface AlmanacView<T> {
  /** Soonest first. */
  dated: Array<DatedHoliday<T>>;
  /** No rule: no date, after the dated ones, in the incoming order. */
  undated: T[];
  ticks: AlmanacTick[];
  /** The ruler's last day. */
  end: CalendarDay;
}

/**
 * The almanac on `today`'s calendar: the holidays soonest first with their
 * dates and days to go, each placed on a ruler that runs `windowDays` from
 * today (a year), and a tick at the first of every month inside it — with
 * the year on each January, so a ruler that crosses New Year says so. A
 * holiday further off than the window (Easter can be: a late one after an
 * early one) keeps its card but no place on the ruler.
 */
export function almanacView<T extends { slug: string; rule?: string }>(
  items: T[],
  today: CalendarDay,
  windowDays: number = ALMANAC_WINDOW_DAYS,
): AlmanacView<T> {
  const dated: Array<DatedHoliday<T>> = [];
  const undated: T[] = [];
  for (const item of orderByNextOccurrence(items, today)) {
    const date = nextOccurrence(item.rule ?? item.slug, today);
    const { days, ...rest } = item;
    if (!date || days === undefined) {
      undated.push(rest as unknown as T);
      continue;
    }
    dated.push({
      ...(rest as unknown as T),
      days,
      date,
      ...(days <= windowDays ? { position: days / windowDays } : {}),
    });
  }

  const ticks: AlmanacTick[] = [];
  let month = { year: today.year, month: today.month, day: 1 };
  for (let guard = 0; guard < 24; guard++) {
    month =
      month.month === 12
        ? { year: month.year + 1, month: 1, day: 1 }
        : { year: month.year, month: month.month + 1, day: 1 };
    const days = daysBetween(today, month);
    if (days > windowDays) break;
    ticks.push({
      key: `${month.year}-${month.month}`,
      label: formatMonthTick(month, month.month === 1),
      position: days / windowDays,
    });
  }

  return { dated, undated, ticks, end: addDays(today, windowDays) };
}

/**
 * A lane (row) for each label on the ruler, so names that fall close
 * together — Christmas Eve and Christmas — sit one above the other instead
 * of on top of each other. `positions` ascending, 0–1; a label takes the
 * first lane whose last label is at least `gap` behind it, else the lane
 * that has been free longest.
 */
export function rulerLanes(
  positions: number[],
  gap: number,
  lanes: number = 3,
): number[] {
  const last = Array.from({ length: lanes }, () => -Infinity);
  return positions.map((position) => {
    let lane = last.findIndex((at) => position - at >= gap);
    if (lane === -1) lane = last.indexOf(Math.min(...last));
    last[lane] = position;
    return lane;
  });
}

/**
 * The holiday after `slug` on `today`'s calendar — the menu page's "Then
 * Thanksgiving, in 39 days" — or `undefined` when `slug` is undated or the
 * last dated one.
 */
export function holidayAfter<T extends { slug: string; rule?: string }>(
  items: T[],
  slug: string,
  today: CalendarDay,
): (T & { days: number }) | undefined {
  const ordered = orderByNextOccurrence(items, today);
  const selfDays = ordered.find((item) => item.slug === slug)?.days;
  if (selfDays === undefined) return undefined;
  return ordered.find(
    (item): item is T & { days: number } =>
      item.slug !== slug && item.days !== undefined && item.days > selfDays,
  );
}
