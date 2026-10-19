"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  almanacView,
  rulerLanes,
  type DatedHoliday,
  type HolidayEntry,
} from "../../controller/holidaysPage";
import {
  dayKey,
  formatDayLong,
  formatDayShort,
  parseDayKey,
  type CalendarDay,
} from "../../util/holidays";
import { useToday } from "../Homepage/useToday";
import { countsLine, daysTo, holidayHref } from "./shared";

/** A holiday as the almanac draws it: the entry and its server-made picture. */
export type AlmanacCard = Omit<HolidayEntry, "image" | "recipeImage"> & {
  picture: ReactNode;
};

/** How many holidays get a full card; the rest are rows. */
const FEATURED = 3;
/** Labels closer than this (a share of the ruler) take the next lane. */
const LABEL_GAP = 0.11;
const LANE_HEIGHT = 18;

/**
 * The almanac (42e, the homepage canvas's variant C): the year ahead to
 * scale, then the holidays soonest first with their countdowns.
 *
 * **Today is the browser's.** The export is static, so the server's day —
 * the build's, on the export — only orders the first render
 * (`serverDay`); the countdown numbers wait for the browser's own day
 * (`useToday(null)`), as the homepage's Coming up does (U1), so the static
 * HTML never prints a number that is wrong by morning. Calendar days, never
 * instants. The dates are `<time>` elements, which the visual specs mask.
 */
export function Almanac({
  cards,
  serverDay,
}: {
  cards: AlmanacCard[];
  serverDay: string;
}) {
  const browserDay = useToday(null);
  const today = parseDayKey(browserDay ?? serverDay);
  const view = almanacView(cards, today);
  const counted = browserDay !== null;
  const featured = view.dated.slice(0, FEATURED);
  const later = view.dated.slice(FEATURED);
  const nextId = useId();
  const laterId = useId();
  const undatedId = useId();

  return (
    <div className="flex flex-col gap-14 sm:gap-16">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-foreground pb-2.5">
          <p className="m-0 font-mono text-xs font-medium tracking-[0.1em] text-foreground uppercase">
            The year ahead ·{" "}
            <span data-testid="almanac-count">
              {cards.length} {cards.length === 1 ? "holiday" : "holidays"}
            </span>
          </p>
          {counted && (
            <time
              dateTime={dayKey(today)}
              className="inline-block font-mono text-xs font-medium tracking-[0.1em] text-foreground uppercase"
            >
              {formatDayLong(today)}
            </time>
          )}
        </div>
        <h1 className="m-0 font-display text-[clamp(3rem,1.6rem+6vw,7rem)] leading-[0.92] font-extrabold tracking-[-0.045em]">
          Holidays
        </h1>
      </header>

      {view.dated.some((holiday) => holiday.position !== undefined) && (
        <Ruler holidays={view.dated} ticks={view.ticks} />
      )}

      {featured.length > 0 && (
        <section aria-labelledby={nextId} className="flex flex-col gap-5">
          <SectionHeading id={nextId}>Next up</SectionHeading>
          <ol
            className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr]"
            data-testid="almanac-next"
          >
            {featured.map((holiday, index) => (
              <FeaturedHoliday
                key={holiday.slug}
                holiday={holiday}
                lead={index === 0}
                counted={counted}
              />
            ))}
          </ol>
        </section>
      )}

      {later.length > 0 && (
        <section aria-labelledby={laterId} className="flex flex-col gap-5">
          <SectionHeading id={laterId}>Later in the year</SectionHeading>
          <HolidayRows
            holidays={later}
            counted={counted}
            testId="almanac-later"
          />
        </section>
      )}

      {view.undated.length > 0 && (
        <section aria-labelledby={undatedId} className="flex flex-col gap-5">
          <SectionHeading id={undatedId}>Any time</SectionHeading>
          <HolidayRows
            holidays={view.undated}
            counted={counted}
            testId="almanac-undated"
          />
        </section>
      )}
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="m-0 border-b border-foreground pb-2.5 font-display text-2xl leading-none font-bold tracking-[-0.03em] sm:text-[2rem]"
    >
      {children}
    </h2>
  );
}

/**
 * The year to scale: a line from today to a year on, a tick at the start of
 * each month, a dot per holiday. Decorative — `aria-hidden`, nothing in it
 * is a control — because the cards and rows below say the same in order,
 * with links; a phone, where twelve months don't fit across, shows only
 * those.
 */
function Ruler({
  holidays,
  ticks,
}: {
  holidays: Array<DatedHoliday<AlmanacCard>>;
  ticks: ReturnType<typeof almanacView>["ticks"];
}) {
  const placed = holidays.filter(
    (holiday): holiday is typeof holiday & { position: number } =>
      holiday.position !== undefined,
  );
  /* "Today" holds lane 0 at the start. */
  const lanes = rulerLanes(
    [0, ...placed.map((holiday) => holiday.position)],
    LABEL_GAP,
  );
  const top = (Math.max(...lanes) + 1) * LANE_HEIGHT + 6;
  const edge = (position: number) =>
    position < 0.04
      ? { left: `${position * 100}%` }
      : position > 0.96
        ? { right: `${(1 - position) * 100}%` }
        : { left: `${position * 100}%`, transform: "translateX(-50%)" };

  return (
    <div
      aria-hidden
      data-testid="almanac-ruler"
      className="relative hidden md:block"
      style={{ height: top + 44 }}
    >
      <div
        className="absolute inset-x-0 h-0.5 bg-foreground"
        style={{ top: top + 8 }}
      />
      {ticks.map((tick) => (
        <span key={tick.key}>
          <i
            className="absolute h-3.5 w-px bg-foreground"
            style={{ left: `${tick.position * 100}%`, top: top + 2 }}
          />
          <span
            className="absolute font-mono text-[0.7rem] leading-4 tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase"
            style={{ top: top + 20, ...edge(tick.position) }}
          >
            {tick.label}
          </span>
        </span>
      ))}
      <i
        className="absolute size-[18px] rounded-full border-2 border-foreground bg-foreground"
        style={{ left: 0, top: top }}
      />
      <span
        className="absolute font-display text-[0.8rem] leading-4 font-semibold whitespace-nowrap"
        style={{ left: 0, top: lanes[0] * LANE_HEIGHT }}
      >
        Today
      </span>
      {placed.map((holiday, index) => {
        const next = index === 0;
        return (
          <span key={holiday.slug} data-testid="almanac-dot">
            <i
              className={cn(
                "absolute -ml-[9px] size-[18px] rounded-full border-2",
                next
                  ? "border-primary bg-primary"
                  : "border-foreground bg-background",
              )}
              style={{
                left:
                  holiday.position > 0.98
                    ? "calc(100% - 9px)"
                    : `max(9px, ${holiday.position * 100}%)`,
                top,
              }}
            />
            <span
              className={cn(
                "absolute font-display text-[0.8rem] leading-4 font-semibold whitespace-nowrap",
                next && "text-primary",
              )}
              style={{
                top: lanes[index + 1] * LANE_HEIGHT,
                ...edge(holiday.position),
              }}
            >
              {holiday.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** "13" over "days to / Halloween", or "Today". */
function Countdown({
  days,
  label,
  lead,
}: {
  days: number;
  label: string;
  lead: boolean;
}) {
  const words = daysTo(days);
  return (
    <p
      className="m-0 flex items-baseline gap-3"
      data-testid="almanac-countdown"
    >
      {words ? (
        <>
          <b
            className={cn(
              "font-mono font-medium tracking-[-0.06em] tabular-nums",
              lead
                ? "text-[clamp(5rem,3rem+5vw,8rem)] leading-[0.85] text-primary"
                : "text-[clamp(4rem,2.6rem+4vw,6.5rem)] leading-[0.85]",
            )}
          >
            {days}
          </b>
          <span className="font-mono text-xs leading-tight font-medium tracking-[0.08em] text-muted-foreground uppercase sm:text-sm">
            {words}
            <br />
            {label}
          </span>
        </>
      ) : (
        <b
          className={cn(
            "font-display text-[clamp(3.5rem,2.4rem+4vw,6rem)] leading-[0.9] font-extrabold tracking-[-0.04em]",
            lead && "text-primary",
          )}
        >
          Today
        </b>
      )}
    </p>
  );
}

function FeaturedHoliday({
  holiday,
  lead,
  counted,
}: {
  holiday: DatedHoliday<AlmanacCard>;
  lead: boolean;
  counted: boolean;
}) {
  const href = holidayHref(holiday.slug);
  return (
    <li className="flex min-w-0 flex-col gap-3" data-testid="almanac-card">
      {/* The number waits for the browser's day; the box keeps its height. */}
      <div className="min-h-[4.25rem] sm:min-h-[5.5rem]">
        {counted && (
          <Countdown days={holiday.days} label={holiday.label} lead={lead} />
        )}
      </div>
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className={cn(
          "block overflow-hidden rounded-lg bg-muted",
          lead ? "aspect-[4/3]" : "hidden aspect-[16/10] sm:block",
        )}
      >
        {holiday.picture}
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="m-0 font-display text-2xl leading-tight font-bold tracking-[-0.02em]">
          <Link href={href} className="hover:text-primary">
            {holiday.label}
          </Link>
        </h3>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          <time dateTime={dayKey(holiday.date)} className="inline-block">
            {formatDayShort(holiday.date)}
          </time>{" "}
          · {countsLine(holiday)}
        </span>
      </div>
      {holiday.top.length > 0 && (
        <ol className="flex flex-col border-t border-border">
          {holiday.top.map((recipe) => (
            <li key={recipe.slug}>
              <Link
                href={`/recipe/${recipe.slug}`}
                className="flex min-h-8 items-center border-b border-border py-1 text-sm hover:text-primary"
              >
                {recipe.name}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link
        href={href}
        className="inline-flex min-h-6 items-center self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        The {holiday.label} menu
      </Link>
    </li>
  );
}

/** The holidays after the first few, and the undated: one line each. */
function HolidayRows({
  holidays,
  counted,
  testId,
}: {
  holidays: Array<AlmanacCard & { days?: number; date?: CalendarDay }>;
  counted: boolean;
  testId: string;
}) {
  return (
    <ol
      className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3"
      data-testid={testId}
    >
      {holidays.map((holiday) => (
        <li key={holiday.slug} className="border-b border-border">
          <Link
            href={holidayHref(holiday.slug)}
            className="group flex min-h-16 items-center gap-3 py-2"
            data-testid="almanac-row"
          >
            <b className="min-w-16 font-mono text-[2.75rem] leading-[0.9] font-medium tracking-[-0.05em] tabular-nums group-hover:text-primary">
              {holiday.days !== undefined && counted ? (
                <>
                  {holiday.days}
                  <span className="sr-only">
                    {holiday.days === 1 ? " day to" : " days to"}
                  </span>
                </>
              ) : (
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
              )}
            </b>
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-xl leading-tight font-bold group-hover:text-primary">
                {holiday.label}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {holiday.date && (
                  <>
                    <time
                      dateTime={dayKey(holiday.date)}
                      className="inline-block"
                    >
                      {formatDayShort(holiday.date)}
                    </time>
                    {" · "}
                  </>
                )}
                {countsLine(holiday)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
