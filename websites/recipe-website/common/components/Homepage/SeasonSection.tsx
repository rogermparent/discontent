"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { seasonRows } from "../../controller/homepageComingUp";
import {
  countdownLabel,
  dayKey,
  nextOccurrence,
  parseDayKey,
  type CalendarDay,
} from "../../util/holidays";
import { cn } from "@discontent/component-library/lib/utils";
import { HomeSection } from "./HomeSection";
import { useToday } from "./useToday";

export interface SeasonRow {
  slug: string;
  label: string;
  /** "32 recipes · 1 plan · featured", already spelled out on the server. */
  counts: string;
  /** The recipe strip, rendered on the server; `null` with nothing to show. */
  strip: ReactNode;
}

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

/**
 * The row's date as a calendar leaf — "SAT / 31 / OCT". A `<time>`, which
 * the visual specs mask (U1's trap: a baseline that printed a date would
 * fail when the year turns), and a fixed-size block so the mask's box — and
 * the row — is the same whatever the date.
 *
 * Empty until the browser's day is known (`day` undefined): the export's
 * HTML would otherwise print the build day's next date, which after a
 * holiday passes is the wrong year's weekday (U1: the export never prints a
 * build day's date). The box keeps its size, so nothing shifts.
 */
function DayLeaf({ day }: { day?: CalendarDay }) {
  const box =
    "flex h-[3.75rem] w-12 shrink-0 flex-col items-start font-mono tabular-nums sm:w-[4.75rem]";
  if (!day) return <time className={box} />;
  const weekday = new Date(
    Date.UTC(day.year, day.month - 1, day.day),
  ).getUTCDay();
  return (
    <time dateTime={dayKey(day)} className={box}>
      <span className="text-[0.6875rem] leading-4 tracking-[0.1em] text-muted-foreground uppercase">
        {WEEKDAYS[weekday]}
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

/**
 * "This season" (42f), ordered and cut by the reader's calendar — the
 * pattern "Coming up" set in the usability pass, taken one step further.
 *
 * The server hands over every dated holiday that leads somewhere, with its
 * strip already rendered; this picks the rows for today (`seasonRows`: the
 * next three within 180 days) and prints each date and countdown, and
 * renders **no section at all** when today has none. `serverDay` is only the
 * first render's day — on the editor that is today; on the static export,
 * the build's. Until 42f the server's day also decided whether the section
 * rendered, so a page served (or a spec run) on 26 December with only
 * Christmas tagged had no section whatever the browser's day was.
 *
 * The countdown **text** waits for the browser's own day (`useToday(null)`),
 * so the export never prints a number computed from the build's day.
 */
export function SeasonSection({
  rows,
  serverDay,
  className,
}: {
  rows: SeasonRow[];
  serverDay: string;
  className?: string;
}) {
  const browserToday = useToday(null);
  const today = parseDayKey(browserToday ?? serverDay);
  const shown = seasonRows(rows, today);
  if (shown.length === 0) return null;
  return (
    <HomeSection
      id="home-season"
      title="This season"
      link={{ href: "/holidays", label: "All holidays" }}
      className={cn("gap-2", className)}
    >
      <ul className="flex flex-col border-t border-border">
        {shown.map((row) => {
          const date = nextOccurrence(row.slug, today);
          return (
            <li
              key={row.slug}
              data-testid="season-row"
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-border py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5"
            >
              <DayLeaf day={browserToday !== null ? date : undefined} />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-row flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <Link
                    href={`/holidays/${row.slug}`}
                    className="font-display text-xl leading-tight font-semibold underline-offset-4 hover:underline"
                  >
                    {row.label}
                  </Link>
                  {browserToday !== null && (
                    <span
                      className="font-mono text-xs whitespace-nowrap text-primary tabular-nums"
                      data-testid="season-countdown"
                    >
                      {countdownLabel(row.days)}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {row.counts}
                </p>
              </div>
              {row.strip && (
                <div className="col-span-2 sm:col-span-1">{row.strip}</div>
              )}
            </li>
          );
        })}
      </ul>
    </HomeSection>
  );
}

export default SeasonSection;
