"use client";

import { formatDayLong, parseDayKey } from "../../util/holidayDates";
import { useToday } from "./useToday";

/**
 * The intro's date eyebrow, "Thursday 15 October" — the reader's own day,
 * never the build's: the server renders an empty line of the same height and
 * the browser fills it in, so a static export never prints a stale date.
 *
 * A `<time>`, which is right for the content and also what the visual specs
 * mask by default — a baseline that printed the date would fail tomorrow.
 * `block`, so the masked box is the line's full width whatever the date's
 * length.
 */
export function TodayLine() {
  const today = useToday(null);
  return (
    <time
      dateTime={today ?? undefined}
      className="block min-h-[1.5em] font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground"
    >
      {today ? formatDayLong(parseDayKey(today)) : " "}
    </time>
  );
}

export default TodayLine;
