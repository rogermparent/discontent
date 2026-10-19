/**
 * The holidays, for the agents (42h): `holiday_list` — what's coming up — and
 * `holiday_get` — one holiday's menu — as 41i did for Make.
 *
 * **The pages' view model, not a second one.** Which terms are holidays, how
 * each is dated (its slug's rule, then its aliases'), the counts per kind,
 * the order they come round, the course and style a recipe is filed under,
 * and the holiday after this one are all `holidaysPage.ts`' (42e) —
 * `holidayEntries`, `almanacView`, `holidayMenuData`, `holidayAfter`. What
 * this module adds is the two things only a seat needs: Node-safe reads (the
 * pages' reads are `unstable_cache`, which throws outside Next, T5/D8) and a
 * `today` the caller can freeze.
 *
 * **Reads.** The term tree aggregate, each holiday's record (its label,
 * description and pins) and one by-term row per key of the holidays'
 * subtrees — the pages' reads, uncached. Nothing creates an index (F30).
 *
 * **Today** is a calendar day, `YYYY-MM-DD`; absent, the server's own local
 * day. The pages count from the browser's day instead (De2); a seat has no
 * browser, so the answer names the day it counted from.
 */
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { readTaxonomyByTermEntry } from "@discontent/cms/taxonomies/read";
import {
  termTreeAggregate,
  type TermTree,
} from "@discontent/cms/taxonomies/tree";
import {
  almanacView,
  holidayAfter,
  holidayAliasTarget,
  holidayChildren,
  holidayEntries,
  holidayKeys,
  holidayMenuData,
  type HolidayCounts,
  type HolidayEntry,
  type HolidayRecipe,
  type MenuGroup,
} from "recipe-website-common/controller/holidaysPage";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import type {
  TagTerm,
  TagTermEntryKey,
  TagTermIndexValue,
} from "recipe-website-common/controller/types";
import {
  addDays,
  countdownLabel,
  dayKey,
  daysBetween,
  localDay,
  nextOccurrence,
  parseDayKey,
  type CalendarDay,
} from "recipe-website-common/util/holidays";
import type { CurationContext } from "./context";
import { NotFoundError, ValidationError } from "./errors";

/** Where the almanac is served in both apps (42e). */
export const HOLIDAYS_URL_BASE = "/holidays";

/** `date`'s shape on every surface: a calendar day. */
export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface HolidayOptions {
  /** `YYYY-MM-DD`: count as of this day. Absent: the server's today. */
  date?: string;
}

/** When a holiday next falls, from `today`; all absent when it has no rule. */
interface HolidayWhen {
  /** Whether a date rule dates it (D4); undated holidays come last. */
  dated: boolean;
  /** The rule's key, when that is not the slug (an alias dates it). */
  rule?: string;
  /** Its next day on or after `today`, `YYYY-MM-DD`. */
  date?: string;
  days?: number;
  /** "today", "tomorrow", "in 12 days". */
  countdown?: string;
}

/** One holiday on `holiday_list`. */
export interface HolidayListRow extends HolidayWhen {
  slug: string;
  label: string;
  counts: HolidayCounts;
  /** Other names for it (`tag:<alias>` and `/holidays/<alias>` reach it). */
  aliases?: string[];
  /** Up to three recipes, pinned first, then the newest. */
  top: Array<{ slug: string; name: string }>;
}

export interface HolidayListResult {
  /** The day the countdowns are from. */
  today: string;
  total: number;
  /** Soonest first; undated last, in the tree's order. */
  holidays: HolidayListRow[];
  /** The almanac page. */
  link: string;
}

/** A menu line: `recipe_search`'s compact row, plus what the menu prints. */
export interface HolidayRecipeRow {
  slug: string;
  name: string;
  date: number;
  tags?: string[];
  image?: string;
  /** A dish's main ingredient, a drink's spirit or base. */
  base?: string;
}

export interface HolidayMenuGroup {
  /** A course or style term's slug, or `more` for the rest. */
  slug: string;
  label: string;
  recipes: HolidayRecipeRow[];
}

export interface HolidayGetResult extends HolidayWhen {
  today: string;
  slug: string;
  label: string;
  /** Set when the slug asked for was an alias of this holiday. */
  requested?: string;
  description?: string;
  image?: string;
  aliases?: string[];
  counts: HolidayCounts;
  /** Dishes by course, in a meal's order, then "More". */
  courses: HolidayMenuGroup[];
  /** Drinks by style, then "More". */
  styles: HolidayMenuGroup[];
  /** The next holiday with recipes after this one: the page's "Then …". */
  next?: {
    slug: string;
    label: string;
    date: string;
    days: number;
    countdown: string;
  };
  /** The menu page. */
  link: string;
}

/**
 * `date` as a calendar day, or today's. A string that is not a real day
 * (`2026-02-30`, `10/19`) is a `validation` error on `date`.
 */
export function holidayToday(
  date?: string,
  now: Date = new Date(),
): CalendarDay {
  if (date === undefined) return localDay(now);
  const day = DAY_KEY_PATTERN.test(date) ? parseDayKey(date) : undefined;
  if (!day || dayKey(addDays(day, 0)) !== date) {
    throw new ValidationError(
      `"${date}" is not a day: give it as YYYY-MM-DD, e.g. 2026-10-31.`,
      [{ path: "date", message: "A calendar day as YYYY-MM-DD" }],
    );
  }
  return day;
}

/* --- reads ------------------------------------------------------------- */

/** A by-term row's recipe: the index's list entry (`RecipeListEntry`). */
interface ListEntry {
  slug: string;
  name: string;
  date: number;
  image?: string;
  tags?: string[];
}

interface HolidayReads {
  tree: TermTree | null;
  records: Map<string, TagTerm | null>;
  rows: Map<string, { label: string; items: ListEntry[] } | null>;
}

async function readHolidays(ctx: CurationContext): Promise<HolidayReads> {
  const { contentDirectory } = ctx;
  const tree = await readAggregate({
    config: tagTermContentConfig,
    aggregateConfig: termTreeAggregate(),
    contentDirectory,
  });
  const children = holidayChildren(tree);
  const keys = holidayKeys(tree);
  const [records, rows] = await Promise.all([
    Promise.all(
      children.map((slug) =>
        readContentFileOrNull<TagTerm, TagTermIndexValue, TagTermEntryKey>({
          config: tagTermContentConfig,
          slug,
          contentDirectory,
        }),
      ),
    ),
    Promise.all(
      keys.map((key) =>
        readTaxonomyByTermEntry({
          config: recipeContentConfig,
          taxonomy: recipeTagTaxonomy,
          contentDirectory,
          slug: key,
        }),
      ),
    ),
  ]);
  return {
    tree,
    records: new Map(children.map((slug, i) => [slug, records[i]])),
    rows: new Map(keys.map((key, i) => [key, rows[i]])),
  };
}

function entriesOf(
  { tree, records, rows }: HolidayReads,
  includeEmpty: boolean,
): HolidayEntry[] {
  return (
    holidayEntries({
      tree,
      records: (slug) => records.get(slug),
      recipeRows: (key) => rows.get(key),
      includeEmpty,
    }) ?? []
  );
}

function whenOf(
  item: { slug: string; rule?: string },
  today: CalendarDay,
): HolidayWhen {
  const key = item.rule ?? item.slug;
  const next = item.rule ? nextOccurrence(key, today) : undefined;
  if (!next) return { dated: false };
  const days = daysBetween(today, next);
  return {
    dated: true,
    ...(item.rule !== item.slug ? { rule: item.rule } : {}),
    date: dayKey(next),
    days,
    countdown: countdownLabel(days),
  };
}

function aliasesOf(tree: TermTree | null, slug: string): string[] | undefined {
  const aliases = tree?.[slug]?.aliases;
  return aliases && aliases.length > 0 ? aliases : undefined;
}

/* --- seats ------------------------------------------------------------- */

/**
 * Every child of the `holidays` root — those nothing is filed under yet too,
 * with counts of 0 (unlike the almanac, De3) — soonest first, undated last.
 * No `holidays` root: an empty list.
 */
export async function holidayList(
  ctx: CurationContext,
  { date }: HolidayOptions = {},
): Promise<HolidayListResult> {
  const today = holidayToday(date);
  const reads = await readHolidays(ctx);
  const { dated, undated } = almanacView(entriesOf(reads, true), today);
  const holidays = [...dated, ...undated].map((entry): HolidayListRow => {
    const aliases = aliasesOf(reads.tree, entry.slug);
    return {
      slug: entry.slug,
      label: entry.label,
      ...whenOf(entry, today),
      counts: {
        recipes: entry.recipes,
        dishes: entry.dishes,
        drinks: entry.drinks,
      },
      ...(aliases ? { aliases } : {}),
      top: entry.top,
    };
  });
  return {
    today: dayKey(today),
    total: holidays.length,
    holidays,
    link: HOLIDAYS_URL_BASE,
  };
}

/**
 * One holiday's menu: its record's label and description, when it next
 * falls, and its recipes grouped as the page groups them — dishes by course,
 * drinks by style. An alias of a holiday answers that holiday, with
 * `requested`; any other slug is `not_found`.
 */
export async function holidayGet(
  ctx: CurationContext,
  slug: string,
  { date }: HolidayOptions = {},
): Promise<HolidayGetResult> {
  const today = holidayToday(date);
  const reads = await readHolidays(ctx);
  const { tree } = reads;
  let target = slug;
  if (!holidayChildren(tree).includes(slug)) {
    const alias = holidayAliasTarget(tree, slug);
    if (!alias) {
      const known = holidayChildren(tree);
      throw new NotFoundError(
        known.length > 0
          ? `No holiday at slug "${slug}" — the holidays are ${known.join(", ")}.`
          : `No holiday at slug "${slug}": this site has no holidays (no children of the \`holidays\` term).`,
        slug,
      );
    }
    target = alias.slug;
  }
  const menu = holidayMenuData({
    slug: target,
    tree,
    record: reads.records.get(target),
    recipeRows: (key) => reads.rows.get(key),
  });
  /* `holidayChildren` held it, so the menu is there; this narrows the type. */
  if (!menu) throw new NotFoundError(`No holiday at slug "${slug}"`, slug);

  const byRecipe = new Map<string, ListEntry>();
  for (const row of reads.rows.values()) {
    for (const item of row?.items ?? []) {
      if (!byRecipe.has(item.slug)) byRecipe.set(item.slug, item);
    }
  }
  const line = (recipe: HolidayRecipe): HolidayRecipeRow => {
    const tags = byRecipe.get(recipe.slug)?.tags;
    return {
      slug: recipe.slug,
      name: recipe.name,
      date: recipe.date,
      ...(tags ? { tags } : {}),
      ...(recipe.image ? { image: recipe.image } : {}),
      ...(recipe.base ? { base: recipe.base } : {}),
    };
  };
  const groups = (list: MenuGroup[]): HolidayMenuGroup[] =>
    list.map((group) => ({
      slug: group.slug,
      label: group.label,
      recipes: group.recipes.map(line),
    }));

  /* "Then …": among the holidays with recipes, as the page has it. */
  const after = holidayAfter(entriesOf(reads, false), target, today);
  const afterWhen = after ? whenOf(after, today) : undefined;
  const aliases = aliasesOf(tree, target);
  return {
    today: dayKey(today),
    slug: menu.slug,
    label: menu.label,
    ...(target !== slug ? { requested: slug } : {}),
    ...whenOf(menu, today),
    ...(menu.description ? { description: menu.description } : {}),
    ...(menu.image ? { image: menu.image } : {}),
    ...(aliases ? { aliases } : {}),
    counts: menu.counts,
    courses: groups(menu.courses),
    styles: groups(menu.styles),
    ...(after && afterWhen?.date && afterWhen.days !== undefined
      ? {
          next: {
            slug: after.slug,
            label: after.label,
            date: afterWhen.date,
            days: afterWhen.days,
            countdown: countdownLabel(afterWhen.days),
          },
        }
      : {}),
    link: `${HOLIDAYS_URL_BASE}/${encodeURIComponent(menu.slug)}`,
  };
}
