import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { RecipeListEntry } from "./paginationConfigs";
import {
  MORE_GROUP,
  holidayChildren,
  holidayMenuData,
  holidayRule,
  type HolidayCounts,
  type HolidayRecipe,
  type HolidayRecord,
  type MenuGroup,
} from "./holidaysPage";
import type { TermRow } from "./tagVocabulary";

/**
 * The homepage's holidays as menus (48e, canvas B "Tonight, then the next
 * feast"), the pure half: each dated holiday that has a recipe, as its
 * courses (42e's `holidayMenuData`, so the homepage and `/holidays/<slug>`
 * group a recipe the same way) with a count and a few candidates each.
 * Which holiday is "next up" is the reader's day's question — the export is
 * static — so this hands over every one and the browser picks
 * (`homepageDay`).
 *
 * **Which recipe leads a course** (47h row 13: Thanksgiving's strip showed
 * the newest imports — rolls and pie bars — and no turkey, stuffing or pie):
 * the holiday's pins first, then the recipe whose name says most of what the
 * holiday's description names ("turkey, stuffing and sides, cranberry sauce,
 * rolls, and pumpkin, pecan and apple pies"), then one with a photo, then
 * the newest. The description is the curator's own words for the holiday's
 * classics; a holiday with none falls back to pins, photos and dates.
 */

/** Course cards on the homepage's menu row (canvas B draws six). */
export const FEAST_CARDS = 6;
/** Candidates per card, so one an earlier section shows can give way. */
export const FEAST_PICK_CANDIDATES = 3;
/** Recipes a "Then" card is handed for its pictures (it shows `THEN_PICKS`). */
export const FEAST_TOP_CANDIDATES = 8;
/** The courses a menu row always shows when the holiday has them (48e). */
export const FEAST_ESSENTIALS: readonly string[] = ["main", "side", "dessert"];
/** The drinks' card: one, whatever their styles. */
export const DRINKS_CARD = "drinks";

/** One course on the homepage's menu: its size and a few candidates. */
export interface FeastCourse {
  slug: string;
  label: string;
  count: number;
  /** Lead order (`leadOrder`), at most `FEAST_PICK_CANDIDATES`. */
  picks: string[];
}

/** One dated holiday, as the homepage's Next up and Then read it. */
export interface FeastEntry {
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it. */
  rule: string;
  counts: HolidayCounts;
  /** A feature points at its term (42f: it shows once, as its row). */
  featured?: boolean;
  /** The courses the row shows, in menu order, drinks last. */
  cards: FeastCourse[];
  /** The rest, for "Also on the menu". */
  also: Array<Pick<FeastCourse, "slug" | "label" | "count">>;
  /** Every recipe in lead order, cut to `FEAST_TOP_CANDIDATES`. */
  top: string[];
}

/** Words a description uses that never name a dish. */
const STOP_WORDS = new Set([
  "and",
  "all",
  "any",
  "are",
  "but",
  "for",
  "from",
  "has",
  "its",
  "more",
  "not",
  "one",
  "our",
  "plus",
  "some",
  "the",
  "their",
  "them",
  "then",
  "this",
  "too",
  "two",
  "whole",
  "table",
  "with",
  "you",
  "your",
  "recipe",
  "recipes",
  "dish",
  "dishes",
  "easy",
  "best",
  "classic",
  "favorite",
  "homemade",
]);

/** A text's words, lower-case, accents off, three letters or more. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** One word and another as the same dish word: "pies" is "pie". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    long === `${short}s` ||
    long === `${short}es` ||
    (short.endsWith("y") && long === `${short.slice(0, -1)}ies`)
  );
}

/** The dish words a holiday's description names, each once. */
export function classicWords(description: string | undefined): string[] {
  const found: string[] = [];
  for (const word of words(description ?? "")) {
    if (!found.some((seen) => sameWord(seen, word))) found.push(word);
  }
  return found;
}

/**
 * How many of `classics` a recipe's name says, and one more when its last
 * word — the dish itself, in English — is one of them: "Pumpkin Pie" is a
 * pie, "Cranberry Crumble Pie Bars" are bars. A trailing "(Source)" is not
 * part of the name.
 */
export function classicScore(name: string, classics: string[]): number {
  if (classics.length === 0) return 0;
  const own = words(name.replace(/\s*\([^)]*\)\s*$/, ""));
  const named = classics.filter((classic) =>
    own.some((word) => sameWord(word, classic)),
  ).length;
  const head = own[own.length - 1];
  const dish =
    head !== undefined && classics.some((classic) => sameWord(head, classic));
  return named + (dish ? 1 : 0);
}

/**
 * `recipes` in the order a course offers them: pinned first, in the pins'
 * order; then the most `classics` named, then a photo, then the newest
 * (then the slug, so the order never depends on the input's).
 */
export function leadOrder<
  T extends Pick<HolidayRecipe, "slug" | "name" | "date" | "image">,
>(recipes: T[], pinned: string[] | undefined, classics: string[]): T[] {
  const pin = new Map((pinned ?? []).map((slug, index) => [slug, index]));
  const score = new Map(
    recipes.map((recipe) => [recipe.slug, classicScore(recipe.name, classics)]),
  );
  return [...recipes].sort(
    (a, b) =>
      (pin.get(a.slug) ?? Infinity) - (pin.get(b.slug) ?? Infinity) ||
      score.get(b.slug)! - score.get(a.slug)! ||
      Number(Boolean(b.image)) - Number(Boolean(a.image)) ||
      b.date - a.date ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}

/**
 * Which courses get a card (48e): the essentials (`FEAST_ESSENTIALS`) and
 * the drinks whenever the holiday has them — the brief's mains, sides,
 * desserts, drinks — then the biggest of the rest up to `limit`; "More"
 * (dishes with no course) only when nothing else is left. Cards print in
 * the menu's order, drinks last; what is left over is "Also on the menu".
 */
export function chooseCards(
  courses: FeastCourse[],
  limit: number = FEAST_CARDS,
): { cards: FeastCourse[]; also: FeastCourse[] } {
  const essential = new Set([...FEAST_ESSENTIALS, DRINKS_CARD]);
  const keep = new Set(
    courses
      .filter((course) => essential.has(course.slug))
      .slice(0, limit)
      .map((course) => course.slug),
  );
  const rest = courses
    .map((course, index) => ({ course, index }))
    .filter(({ course }) => !keep.has(course.slug))
    .sort(
      (a, b) =>
        Number(a.course.slug === MORE_GROUP) -
          Number(b.course.slug === MORE_GROUP) ||
        b.course.count - a.course.count ||
        a.index - b.index,
    );
  for (const { course } of rest) {
    if (keep.size >= limit) break;
    keep.add(course.slug);
  }
  return {
    cards: courses.filter((course) => keep.has(course.slug)),
    also: courses.filter((course) => !keep.has(course.slug)),
  };
}

function feastCourse(
  group: Pick<MenuGroup, "slug" | "label" | "recipes">,
  order: (recipes: HolidayRecipe[]) => HolidayRecipe[],
): FeastCourse {
  return {
    slug: group.slug,
    label: group.slug === MORE_GROUP ? "Other dishes" : group.label,
    count: group.recipes.length,
    picks: order(group.recipes)
      .slice(0, FEAST_PICK_CANDIDATES)
      .map((recipe) => recipe.slug),
  };
}

type RecipeRows = (key: string) => TermRow<RecipeListEntry> | null | undefined;

/**
 * Every dated holiday with a recipe, as a homepage menu, in the tree's order
 * (the browser orders them by its day), and every recipe they name, by slug,
 * for the names and pictures. `records` answers each holiday's record (its
 * pins and description). An undated holiday is left out: it is never "next".
 */
export function feastEntries({
  tree,
  records,
  recipeRows,
  featuredTerms = new Set(),
}: {
  tree: TermTree | null | undefined;
  records: (slug: string) => HolidayRecord | null | undefined;
  recipeRows: RecipeRows;
  featuredTerms?: ReadonlySet<string>;
}): { feasts: FeastEntry[]; recipes: Map<string, HolidayRecipe> } {
  const recipes = new Map<string, HolidayRecipe>();
  const feasts: FeastEntry[] = [];
  for (const slug of holidayChildren(tree)) {
    const rule = holidayRule(tree, slug);
    if (!rule) continue;
    const record = records(slug);
    const menu = holidayMenuData({ slug, tree, record, recipeRows });
    if (!menu || menu.counts.recipes === 0) continue;
    for (const recipe of menu.recipes) recipes.set(recipe.slug, recipe);
    const classics = classicWords(record?.description);
    const order = (list: HolidayRecipe[]) =>
      leadOrder(list, record?.pinned, classics);
    const drinks = menu.recipes.filter((recipe) => recipe.kind === "drinks");
    const { cards, also } = chooseCards([
      ...menu.courses.map((group) => feastCourse(group, order)),
      ...(drinks.length > 0
        ? [
            feastCourse(
              { slug: DRINKS_CARD, label: "Drinks", recipes: drinks },
              order,
            ),
          ]
        : []),
    ]);
    feasts.push({
      slug,
      label: menu.label,
      rule,
      counts: menu.counts,
      ...(featuredTerms.has(slug) ? { featured: true } : {}),
      cards,
      also: also.map(({ slug: course, label, count }) => ({
        slug: course,
        label,
        count,
      })),
      top: order(menu.recipes)
        .slice(0, FEAST_TOP_CANDIDATES)
        .map((recipe) => recipe.slug),
    });
  }
  return { feasts, recipes };
}

/** "52 dishes · 7 drinks" — what a holiday holds, by kind (42f's Df8). */
export function feastCounts(counts: HolidayCounts, featured?: boolean): string {
  const parts: string[] = [];
  if (counts.dishes > 0) {
    parts.push(`${counts.dishes} dish${counts.dishes === 1 ? "" : "es"}`);
  }
  if (counts.drinks > 0) {
    parts.push(`${counts.drinks} drink${counts.drinks === 1 ? "" : "s"}`);
  }
  if (featured) parts.push("featured");
  return parts.join(" · ");
}
