import type { HolidayCounts } from "../../controller/holidaysPage";
import { MAKE_KINDS, type MakeKind } from "../MakePage/kinds";

/** Where a holiday's menu lives (42e). */
export const holidayHref = (slug: string) => `/holidays/${slug}`;
/** The almanac. */
export const ALMANAC_HREF = "/holidays";

const kindOf = (id: string): MakeKind =>
  MAKE_KINDS.find((kind) => kind.id === id) ?? MAKE_KINDS[0];

/** "1 drink", "12 dishes" — `MAKE_KINDS`' own words. */
export function kindCount(count: number, id: string): string {
  const kind = kindOf(id);
  return `${count} ${count === 1 ? kind.one : kind.word}`;
}

/**
 * What a holiday holds: "9 dishes · 3 drinks", or "12 dishes" or "3 drinks"
 * when it is all one kind.
 */
export function countsLine(counts: HolidayCounts): string {
  if (counts.dishes > 0 && counts.drinks > 0) {
    return `${kindCount(counts.dishes, "food")} · ${kindCount(counts.drinks, "drinks")}`;
  }
  if (counts.drinks > 0) return kindCount(counts.drinks, "drinks");
  return kindCount(counts.dishes, "food");
}

/**
 * "13 days to", "1 day to" — the countdown's words beside its number, or
 * `undefined` on the day itself (the page says "today" instead).
 */
export function daysTo(days: number): string | undefined {
  if (days <= 0) return undefined;
  return days === 1 ? "day to" : "days to";
}
