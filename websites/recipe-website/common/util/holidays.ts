/**
 * When each holiday falls, keyed by its term slug (usability pass, 2026-10-15).
 *
 * The `holidays` root's children are ordinary tag terms with no date on them,
 * so the site keeps the calendar here: the homepage's "Coming up" and the
 * Drinks page's seasonal row both ask which holiday is next. Pure and safe in
 * the browser — both callers run it there, because the export is static and a
 * date chosen at build time goes stale.
 *
 * A slug this table doesn't know has no date: callers list it after the dated
 * ones, without a countdown. Several spellings of one holiday share a rule.
 * Hanukkah is left out on purpose: it follows the Hebrew calendar, which is
 * not cheap to compute, and a wrong date is worse than none.
 */

/** A calendar day in some year, month 1–12. */
interface MonthDay {
  month: number;
  day: number;
}

type HolidayRule = (year: number) => MonthDay;

const fixed =
  (month: number, day: number): HolidayRule =>
  () => ({ month, day });

/** The `nth` `weekday` (0 = Sunday) of `month`, e.g. the fourth Thursday. */
const nthWeekday =
  (nth: number, weekday: number, month: number): HolidayRule =>
  (year) => {
    const first = new Date(year, month - 1, 1).getDay();
    return { month, day: 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7 };
  };

/** Western Easter Sunday — the anonymous Gregorian computus. */
function easter(year: number): MonthDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const NEW_YEAR = fixed(1, 1);
const VALENTINES = fixed(2, 14);
const ST_PATRICKS = fixed(3, 17);
const JULY_4 = fixed(7, 4);

/** Term slug → when it falls. Add a spelling here when a term uses one. */
export const HOLIDAY_RULES: Readonly<Record<string, HolidayRule>> = {
  "new-year": NEW_YEAR,
  "new-years": NEW_YEAR,
  "new-years-day": NEW_YEAR,
  "new-years-eve": fixed(12, 31),
  valentines: VALENTINES,
  "valentines-day": VALENTINES,
  "st-patricks": ST_PATRICKS,
  "st-patricks-day": ST_PATRICKS,
  easter,
  "july-4th": JULY_4,
  "fourth-of-july": JULY_4,
  "independence-day": JULY_4,
  halloween: fixed(10, 31),
  /* The US holiday: the fourth Thursday of November. */
  thanksgiving: nthWeekday(4, 4, 11),
  christmas: fixed(12, 25),
  "christmas-eve": fixed(12, 24),
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight of `date`'s day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The next day `slug` falls on, today included, in local time — or
 * `undefined` for a slug with no rule.
 */
export function nextOccurrence(slug: string, from: Date): Date | undefined {
  const rule = HOLIDAY_RULES[slug];
  if (!rule) return undefined;
  const today = startOfDay(from);
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const { month, day } = rule(year);
    const date = new Date(year, month - 1, day);
    if (date >= today) return date;
  }
  return undefined;
}

/** Whole days from `from`'s day to `date`'s: 0 on the day itself. */
export function daysUntil(date: Date, from: Date): number {
  /* Rounded: a daylight-saving change makes one day 23 or 25 hours long. */
  return Math.round(
    (startOfDay(date).getTime() - startOfDay(from).getTime()) / DAY_MS,
  );
}

export interface DatedHoliday<T> {
  item: T;
  /** The next occurrence, or `undefined` when the slug has no rule. */
  date?: Date;
  /** Days until `date`; `undefined` with it. */
  days?: number;
}

/**
 * `items` in the order their holidays come round, starting `from`: the dated
 * ones soonest first, then every slug without a rule in the order given.
 */
export function orderByNextOccurrence<T>(
  items: readonly T[],
  slugOf: (item: T) => string,
  from: Date,
): DatedHoliday<T>[] {
  const dated: DatedHoliday<T>[] = [];
  const undated: DatedHoliday<T>[] = [];
  for (const item of items) {
    const date = nextOccurrence(slugOf(item), from);
    if (date) dated.push({ item, date, days: daysUntil(date, from) });
    else undated.push({ item });
  }
  dated.sort((a, b) => a.days! - b.days!);
  return [...dated, ...undated];
}
