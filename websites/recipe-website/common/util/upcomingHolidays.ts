import {
  formatDayShort,
  nextOccurrence,
  daysBetween,
  type CalendarDay,
} from "./holidays";

/**
 * The group form's "Upcoming" tag chips (51, Dg4/Dg5): the holidays whose
 * day falls today or within the next `UPCOMING_WINDOW_DAYS`, nearest first,
 * at most `UPCOMING_MAX` — leaving out the ones already tagged.
 *
 * A holiday is one calendar day here (`HOLIDAY_RULES`), so "in progress" is
 * the day itself: today counts. Dated on the reader's calendar, so the
 * caller passes the browser's `localDay(new Date())`.
 */
export const UPCOMING_WINDOW_DAYS = 42;
export const UPCOMING_MAX = 3;

export interface HolidayChoice {
  /** The holiday's tag term. */
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it, when that is not its slug. */
  rule?: string;
}

export interface UpcomingHoliday extends HolidayChoice {
  days: number;
  date: CalendarDay;
  /** "Thu 26 Nov". */
  when: string;
}

export function upcomingHolidays(
  holidays: readonly HolidayChoice[],
  today: CalendarDay,
  tagged: ReadonlySet<string> = new Set(),
  windowDays: number = UPCOMING_WINDOW_DAYS,
  max: number = UPCOMING_MAX,
): UpcomingHoliday[] {
  const out: UpcomingHoliday[] = [];
  for (const holiday of holidays) {
    if (tagged.has(holiday.slug)) continue;
    const date = nextOccurrence(holiday.rule ?? holiday.slug, today);
    if (!date) continue;
    const days = daysBetween(today, date);
    if (days < 0 || days > windowDays) continue;
    out.push({ ...holiday, days, date, when: formatDayShort(date) });
  }
  return out.sort((a, b) => a.days - b.days).slice(0, max);
}
