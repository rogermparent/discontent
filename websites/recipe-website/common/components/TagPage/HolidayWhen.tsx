"use client";

import Link from "next/link";
import { Gift, Utensils } from "lucide-react";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  dayKey,
  daysBetween,
  formatDayShort,
  nextOccurrence,
  parseDayKey,
} from "../../util/holidays";
import { useToday } from "../Homepage/useToday";
import { holidayHref } from "../HolidaysPage/shared";

/**
 * A holiday term page's "when" card (43t, canvas B): how many days to go on
 * the browser's day (the export is static — `useToday`, as the almanac
 * counts), the date, its menu and What can I make with its recipes. An
 * undated holiday keeps the two links and no number.
 */
export function HolidayWhen({
  slug,
  label,
  rule,
  serverDay,
  makeHref,
}: {
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it; absent when undated. */
  rule?: string;
  serverDay: string;
  /** `/make?q=tag:…`, when the term has recipes. */
  makeHref?: string;
}) {
  const browserDay = useToday(null);
  const today = parseDayKey(browserDay ?? serverDay);
  const date = rule ? nextOccurrence(rule, today) : undefined;
  const days = date ? daysBetween(today, date) : undefined;
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-[18px]"
      data-testid="term-when"
    >
      {date && days !== undefined && (
        <p className="m-0 flex min-h-11 items-baseline gap-2.5">
          {browserDay !== null && (
            <>
              <b className="font-mono text-[2.75rem] leading-none font-medium tracking-[-0.02em] tabular-nums">
                {days > 0 ? days : "Today"}
              </b>
              <span className="font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {days > 0 && `${days === 1 ? "day" : "days"} · `}
                <time dateTime={dayKey(date)} className="inline-block">
                  {formatDayShort(date)}
                </time>
              </span>
            </>
          )}
        </p>
      )}
      <Link
        href={holidayHref(slug)}
        className={cn(buttonVariants(), "min-h-11")}
        data-testid="term-holiday-link"
      >
        <Utensils aria-hidden />
        Open the {label} menu
      </Link>
      {makeHref && (
        <Link
          href={makeHref}
          className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
          data-testid="term-make-link"
        >
          <Gift aria-hidden />
          What can I make with these?
        </Link>
      )}
    </div>
  );
}
