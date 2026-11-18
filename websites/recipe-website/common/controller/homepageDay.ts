import {
  nextSeasonal,
  withinComingUpWindow,
  type CalendarDay,
} from "../util/holidays";
import type { ShownFeature } from "./homepageComingUp";

/**
 * What the homepage shows on one day (48e, canvas B; 47h's `homepageShown`
 * before it), worked out once in the browser on the reader's day — the
 * server's for the first render — so every section agrees. Pure and
 * dependency-light: the browser imports it.
 *
 * **A recipe shows once on the page, and the earliest section wins**, in
 * the page's reading order: Tonight, the next holiday's courses, the
 * holidays after it, Featured, New in the collection. A plan shown under its
 * holiday is not shown again in "On the plan" or Featured.
 */

/** Quick dinners Tonight shows (canvas B: two). */
export const TONIGHT_QUICK = 2;
/** Warm drinks: the pick and the "or …" line under it. */
export const TONIGHT_WARM = 2;
/** Holidays after the next one that get a card ("Then"). */
export const THEN_LIMIT = 2;
/** Pictures on a "Then" card with no plan. */
export const THEN_PICKS = 4;

/** The day as a whole number, for a pick that moves once a day. */
export function dayNumber({ year, month, day }: CalendarDay): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * `count` items of `items` starting at `seed` (wrapping), each once: the
 * day's turn through a fixed list, so every candidate gets its night.
 */
export function rotate<T>(items: T[], seed: number, count: number): T[] {
  if (items.length === 0) return [];
  const start = ((seed % items.length) + items.length) % items.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, items.length); i++) {
    out.push(items[(start + i) % items.length]);
  }
  return out;
}

/** A dated holiday as the day reads it. */
export interface DayFeast {
  slug: string;
  rule: string;
  /** Each course card's candidates, in lead order. */
  cards: Array<{ slug: string; picks: string[] }>;
  /** Every recipe's slug in lead order, for a card's pictures. */
  top: string[];
  /** The plan filed under it (the newest), if any. */
  plan?: string;
}

export interface HomepageDay {
  tonight: {
    /** Tonight's quick dinners. */
    quick: string[];
    /** The warm drink and its "or …", or none out of season. */
    warm: string[];
  };
  /** The soonest dated holiday within 180 days, with each card's pick. */
  next?: {
    slug: string;
    days: number;
    cards: Array<{ slug: string; pick?: string }>;
  };
  /** The holidays after it, each with its pictures (none when it has a plan). */
  then: Array<{ slug: string; days: number; picks: string[] }>;
  /** The holiday after those, for "After that: …". */
  after?: { slug: string; days: number };
  /** "On the plan"'s plan is shown under its holiday above. */
  planShown: boolean;
  /** Featured's rows, in order, by `key`. */
  featured: string[];
  /** New in the collection's recipes, in order. */
  fresh: string[];
}

/**
 * The day's answer.
 *
 * - **Tonight**: `TONIGHT_QUICK` quick dinners, the day's turn
 *   (`rotate` by `dayNumber`); a warm drink and its "or" when a holiday with
 *   warm drinks is within 60 days (`warmHolidays`, `nextSeasonal`).
 * - **Next up**: the soonest holiday within the 180-day window; each card
 *   takes its first candidate nothing above shows, else its first (a
 *   course with a card still shows its dish).
 * - **Then**: the `THEN_LIMIT` after it; a holiday with a plan shows the
 *   plan, one without its first `THEN_PICKS` unshown recipes. **After
 *   that**: the one after those.
 * - **Featured** less a holiday with a row above, a dated holiday outside
 *   the window (past), a plan shown above or in "On the plan", a recipe
 *   already shown or featured twice; cut to `featuredLimit`, and a
 *   dangling entry drops after the cut (22g: it takes its slot).
 * - **New in the collection**: the candidates nothing above shows, cut to
 *   `freshLimit` — the newest anyway when every one is above.
 */
export function homepageDay({
  today,
  quick,
  warm,
  warmHolidays,
  feasts,
  featured,
  featuredLimit,
  planGroup,
  fresh,
  freshLimit,
}: {
  today: CalendarDay;
  /** Quick dinners, in their fixed order. */
  quick: string[];
  /** Warm drinks, in their fixed order. */
  warm: string[];
  warmHolidays: Array<{ slug: string; rule?: string }>;
  feasts: DayFeast[];
  featured: ShownFeature[];
  featuredLimit: number;
  /** The plan "On the plan" shows (the newest). */
  planGroup?: string;
  /** New in the collection's candidates, newest first. */
  fresh: string[];
  freshLimit: number;
}): HomepageDay {
  const shown = new Set<string>();
  const seed = dayNumber(today);
  const quickPicks = rotate(quick, seed, TONIGHT_QUICK);
  for (const slug of quickPicks) shown.add(slug);
  const warmPicks = nextSeasonal(warmHolidays, today)
    ? rotate(
        warm.filter((slug) => !shown.has(slug)),
        seed,
        TONIGHT_WARM,
      )
    : [];
  for (const slug of warmPicks) shown.add(slug);

  const coming = withinComingUpWindow(feasts, today);
  const [first, ...later] = coming;
  const shownPlans = new Set<string>();
  const next = first && {
    slug: first.slug,
    days: first.days,
    cards: first.cards.map((card) => {
      const pick = card.picks.find((slug) => !shown.has(slug)) ?? card.picks[0];
      if (pick) shown.add(pick);
      return { slug: card.slug, ...(pick ? { pick } : {}) };
    }),
  };
  if (first?.plan) shownPlans.add(first.plan);
  const then = later.slice(0, THEN_LIMIT).map((feast) => {
    if (feast.plan) {
      shownPlans.add(feast.plan);
      return { slug: feast.slug, days: feast.days, picks: [] };
    }
    const picks = feast.top
      .filter((slug) => !shown.has(slug))
      .slice(0, THEN_PICKS);
    for (const slug of picks) shown.add(slug);
    return { slug: feast.slug, days: feast.days, picks };
  });
  const afterFeast = later[THEN_LIMIT];
  const planShown = planGroup !== undefined && shownPlans.has(planGroup);

  const onPage = new Set(
    [first, ...later.slice(0, THEN_LIMIT)].flatMap((feast) =>
      feast ? [feast.slug] : [],
    ),
  );
  const inWindow = new Set(coming.map((feast) => feast.slug));
  const dated = new Set(feasts.map((feast) => feast.slug));
  const featuredRecipes = new Set<string>();
  const kept = featured
    .filter((entry) => {
      if (entry.holiday) {
        if (onPage.has(entry.holiday)) return false;
        if (dated.has(entry.holiday) && !inWindow.has(entry.holiday)) {
          return false;
        }
      }
      if (entry.group) {
        if (shownPlans.has(entry.group)) return false;
        if (!planShown && entry.group === planGroup) return false;
      }
      if (entry.recipe) {
        if (shown.has(entry.recipe) || featuredRecipes.has(entry.recipe)) {
          return false;
        }
        featuredRecipes.add(entry.recipe);
      }
      return true;
    })
    .slice(0, featuredLimit)
    .filter((entry) => !entry.dangling);
  for (const entry of kept) if (entry.recipe) shown.add(entry.recipe);
  const unseen = fresh.filter((slug) => !shown.has(slug));

  return {
    tonight: { quick: quickPicks, warm: warmPicks },
    ...(next ? { next } : {}),
    then,
    ...(afterFeast
      ? { after: { slug: afterFeast.slug, days: afterFeast.days } }
      : {}),
    planShown,
    featured: kept.map((entry) => entry.key),
    fresh: (unseen.length > 0 ? unseen : fresh).slice(0, freshLimit),
  };
}
