"use client";

import { formatDayLong, parseDayKey } from "../../util/holidays";
import { useHomeDay } from "./HomeDay";
import { useToday } from "./useToday";

/**
 * The intro's eyebrow, "Thursday 15 October · 17 days to Thanksgiving" — the
 * reader's own day, never the build's: the server renders an empty line of
 * the same height and the browser fills it in, so a static export never
 * prints a stale date. The countdown (48e) is to the holiday "Next up"
 * shows, by `labels`, and only once the browser's day is known.
 *
 * The date is a `<time>`, which is right for the content and also what the
 * visual specs mask by default — a baseline that printed the date would
 * fail tomorrow.
 */
export function TodayLine({
  labels = {},
}: {
  labels?: Record<string, string>;
}) {
  const today = useToday(null);
  const next = useHomeDay()?.day.next;
  const label = next ? labels[next.slug] : undefined;
  return (
    <p className="flex min-h-[1.5em] flex-row flex-wrap gap-x-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
      <time dateTime={today ?? undefined} className="inline-block min-w-40">
        {today ? formatDayLong(parseDayKey(today)) : " "}
      </time>
      {today && next && label && (
        <span data-testid="today-countdown">
          ·{" "}
          {next.days === 0
            ? `${label} is today`
            : next.days === 1
              ? `${label} is tomorrow`
              : `${next.days} days to ${label}`}
        </span>
      )}
    </p>
  );
}

export default TodayLine;
