import { cn } from "@discontent/component-library/lib/utils";
import { dayKey, type CalendarDay } from "../../util/holidays";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

/** "Thu", for a calendar day. */
export function weekdayOf(day: CalendarDay): string {
  return WEEKDAYS[
    new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
  ];
}

/**
 * A holiday's date as a calendar leaf — "THU / 26 / NOV" (42f; 48e's Next
 * up and Then). A `<time>`, which the visual specs mask (U1's trap: a
 * baseline that printed a date would fail when the year turns), and a
 * fixed-size block so the mask's box — and the row — is the same whatever
 * the date.
 *
 * Empty until the browser's day is known (`day` undefined): the export's
 * HTML would otherwise print the build day's next date (U1: the export
 * never prints a build day's date). The box keeps its size, so nothing
 * shifts.
 */
export function DayLeaf({
  day,
  className,
}: {
  day?: CalendarDay;
  className?: string;
}) {
  const box = cn(
    "flex h-[3.75rem] w-12 shrink-0 flex-col items-start font-mono tabular-nums sm:w-[4.75rem]",
    className,
  );
  if (!day) return <time className={box} />;
  return (
    <time dateTime={dayKey(day)} className={box}>
      <span className="text-[0.6875rem] leading-4 tracking-[0.1em] text-muted-foreground uppercase">
        {weekdayOf(day)}
      </span>{" "}
      <span className="text-[1.75rem] leading-none font-medium tracking-tight">
        {day.day}
      </span>{" "}
      <span className="text-[0.6875rem] leading-4 tracking-[0.1em] text-muted-foreground uppercase">
        {MONTHS[day.month - 1]}
      </span>
    </time>
  );
}

export default DayLeaf;
