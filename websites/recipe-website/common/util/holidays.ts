/**
 * When each holiday falls (usability pass, 2026-10-15): the one calendar the
 * site keeps, shared by the homepage's "Coming up" (U1, through
 * `withinComingUpWindow`) and the Drinks page's seasonal row (U3, the first
 * dated entry of `orderByNextOccurrence`). Each caller keeps its own policy;
 * the date rules are these. Pure and safe in the browser — both callers run
 * it there, because the export is static and a date chosen at build time
 * goes stale.
 *
 * A built-in table keyed by **term slug**, because the vocabulary has no date
 * field and a holiday's date is a rule rather than a value: Easter moves,
 * Thanksgiving is a weekday. A `holidays` child with no rule here still shows,
 * after the dated ones and without a countdown — a "Fall favorites" term is a
 * season, not a day, and that is the right place for it.
 *
 * Several spellings per holiday, since the slug is whatever the curator typed.
 * Hanukkah is left out on purpose: it follows the Hebrew calendar, and a
 * table of its Gregorian start dates would be a list someone has to extend
 * every few years. It sorts with the undated terms instead.
 *
 * Calendar dates only (`CalendarDay`), never instants: "in 3 days" is a
 * question about the reader's local calendar, so the caller converts the
 * browser's `Date` once with `localDay` and everything here is time-zone free.
 */

/** The tag root whose children are the holidays (epic 34e); dated here by slug. */
export const HOLIDAYS_ROOT = "holidays";

/** A date on the calendar, month 1–12. */
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

type Rule = (year: number) => { month: number; day: number };

const fixed =
  (month: number, day: number): Rule =>
  () => ({ month, day });

/** The `n`th `weekday` (0 = Sunday) of `month` in `year`. */
function nthWeekday(month: number, weekday: number, n: number): Rule {
  return (year) => {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return { month, day: 1 + ((weekday - first + 7) % 7) + (n - 1) * 7 };
  };
}

/** Western Easter Sunday — the anonymous Gregorian computus. */
export function easterSunday(year: number): { month: number; day: number } {
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

const newYear = fixed(1, 1);
const valentines = fixed(2, 14);
const stPatricks = fixed(3, 17);
const independence = fixed(7, 4);

/** Slug → rule. Every spelling of one holiday shares its rule. */
export const HOLIDAY_RULES: Readonly<Record<string, Rule>> = {
  "new-year": newYear,
  "new-years": newYear,
  "new-years-day": newYear,
  "new-years-eve": fixed(12, 31),
  valentines,
  "valentines-day": valentines,
  "st-patricks": stPatricks,
  "st-patricks-day": stPatricks,
  "saint-patricks-day": stPatricks,
  easter: easterSunday,
  "july-4th": independence,
  "fourth-of-july": independence,
  "independence-day": independence,
  halloween: fixed(10, 31),
  /* US Thanksgiving: the fourth Thursday of November. */
  thanksgiving: nthWeekday(11, 4, 4),
  "christmas-eve": fixed(12, 24),
  christmas: fixed(12, 25),
};

/** The browser's (or server's) local calendar day for an instant. */
export function localDay(date: Date): CalendarDay {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function dayNumber({ year, month, day }: CalendarDay): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Whole days from `from` to `to` (0 when they are the same day). */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

/**
 * The holiday's next date on or after `today` — today itself counts, so
 * Christmas morning says "today" — or `undefined` for a slug with no rule.
 */
export function nextOccurrence(
  slug: string,
  today: CalendarDay,
): CalendarDay | undefined {
  const rule = HOLIDAY_RULES[slug];
  if (!rule) return undefined;
  const thisYear = { year: today.year, ...rule(today.year) };
  if (daysBetween(today, thisYear) >= 0) return thisYear;
  return { year: today.year + 1, ...rule(today.year + 1) };
}

/** `YYYY-MM-DD` — a day as a stable string, for snapshots and `dateTime`. */
export function dayKey({ year, month, day }: CalendarDay): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDayKey(key: string): CalendarDay {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "Thursday 15 October". Spelled out rather than through `Intl`, whose
 * punctuation for this shape differs by locale and runtime ("Thursday, 15
 * October" in some), so the line reads the same everywhere.
 */
export function formatDayLong(day: CalendarDay): string {
  const weekday = new Date(
    Date.UTC(day.year, day.month - 1, day.day),
  ).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day.day} ${MONTHS[day.month - 1]}`;
}

/** "today", "tomorrow", "in 16 days". */
export function countdownLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Holidays in the order they come round: dated ones soonest first, then the
 * undated ones in their incoming order. Each gets its `days` to go, or
 * `undefined` when it has no rule.
 */
export function orderByNextOccurrence<T extends { slug: string }>(
  items: T[],
  today: CalendarDay,
): Array<T & { days?: number }> {
  const withDays = items.map((item, index) => {
    const next = nextOccurrence(item.slug, today);
    return {
      item: { ...item, days: next ? daysBetween(today, next) : undefined },
      index,
    };
  });
  return withDays
    .sort((a, b) => {
      const da = a.item.days;
      const db = b.item.days;
      if (da !== undefined && db !== undefined)
        return da - db || a.index - b.index;
      if (da !== undefined) return -1;
      if (db !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * How far ahead "Coming up" looks (review round, 2026-10-15). A holiday
 * further off than this doesn't show — the section counts down, it doesn't
 * list every holiday there is — and an undated one never qualifies, since it
 * has no `days` to compare.
 */
export const COMING_UP_WINDOW_DAYS = 180;

/**
 * `items` ordered by `orderByNextOccurrence` and cut to the ones due within
 * `windowDays`. An empty result is the cue to hide the section rather than
 * fall back to the undated entries `orderByNextOccurrence` would otherwise
 * put after them.
 */
export function withinComingUpWindow<T extends { slug: string }>(
  items: T[],
  today: CalendarDay,
  windowDays: number = COMING_UP_WINDOW_DAYS,
): Array<T & { days: number }> {
  return orderByNextOccurrence(items, today).filter(
    (item): item is T & { days: number } =>
      item.days !== undefined && item.days <= windowDays,
  );
}
