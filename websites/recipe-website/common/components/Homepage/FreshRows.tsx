"use client";

import type { ReactNode } from "react";
import type { FreshBatch } from "../../controller/homepageFresh";
import { countLabel } from "../../controller/homepageIntents";
import { addDays, dayKey, parseDayKey } from "../../util/holidays";
import { useHomeDay } from "./HomeDay";
import { weekdayOf } from "./DayLeaf";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A batch's day: "Today" or "Yesterday" once the browser's day is known,
 * else "Mon 9 Nov" — the server's calendar day the recipes were added on
 * (42f's Df9). A `<time>`, which the visual specs mask.
 */
function BatchDay({ day }: { day: string }) {
  const page = useHomeDay();
  const parsed = parseDayKey(day);
  let label = `${weekdayOf(parsed)} ${parsed.day} ${MONTHS[parsed.month - 1]}`;
  if (page?.known) {
    if (page.today === day) label = "Today";
    else if (dayKey(addDays(parseDayKey(page.today), -1)) === day) {
      label = "Yesterday";
    }
  }
  return (
    <time
      dateTime={day}
      className="inline-flex min-h-6 items-center rounded-sm bg-accent px-2 font-mono text-xs font-medium tracking-[0.06em] text-accent-foreground uppercase"
    >
      {label}
    </time>
  );
}

/**
 * New in the collection's tiles (48e), by batch: the recipes the day's
 * answer keeps (`homepageDay`: none a section above shows), in order, under
 * the batch each was added in — "Today · 8 · Thanksgiving · Desserts and
 * Breads & doughs" — else, outside a `HomeDayProvider`, the first `limit`.
 * Each tile is rendered on the server; this only chooses and groups.
 *
 * Every batch's list keeps `data-testid="recipe-list"`, which
 * `checkNamesInOrder` reads the order from across them.
 */
export function FreshRows({
  rows,
  batches,
  limit,
}: {
  rows: Array<{ slug: string; row: ReactNode }>;
  batches: FreshBatch[];
  limit: number;
}) {
  const page = useHomeDay();
  const bySlug = new Map(rows.map((entry) => [entry.slug, entry.row]));
  const shown = page
    ? page.day.fresh.filter((slug) => bySlug.has(slug))
    : rows.slice(0, limit).map((entry) => entry.slug);
  const shownSet = new Set(shown);
  const groups = batches.flatMap((batch) => {
    const slugs = batch.slugs.filter((slug) => shownSet.has(slug));
    return slugs.length > 0 ? [{ batch, slugs }] : [];
  });
  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ batch, slugs }) => {
        return (
          <div key={batch.day} className="flex flex-col gap-2.5">
            <p
              className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
              data-testid="fresh-batch"
            >
              <BatchDay day={batch.day} />
              <span className="font-mono text-xs tabular-nums">
                {countLabel(batch.slugs.length, "recipe")}
              </span>
              {batch.summary && <span>{batch.summary}</span>}
            </p>
            <ul
              data-testid="recipe-list"
              className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6"
            >
              {slugs.map((slug) => bySlug.get(slug))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default FreshRows;
