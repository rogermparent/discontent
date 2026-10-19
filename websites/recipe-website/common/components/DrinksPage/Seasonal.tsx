"use client";

import Link from "next/link";
import { useId } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { cn } from "@discontent/component-library/lib/utils";
import {
  alsoLine,
  holidayPair,
  isNewDrink,
  type DrinkCard,
  type PairSlot,
  type SeasonalDrinks,
} from "../../controller/drinksPage";
import {
  addDays,
  dayKey,
  countdownLabel,
  formatDayShort,
  parseDayKey,
} from "../../util/holidays";
import { RecipeCardPlaceholder } from "../List/shared";
import { PureRecipeImage } from "../RecipeImage/PureRecipeImage";
import { useToday } from "../Homepage/useToday";
import { NewMark } from "./MakePanel";

/** Cards the sooner holiday shows; the later one shows `NEXT_CARDS`. */
const NOW_CARDS = 4;
const NEXT_CARDS = 2;

const SLOT_LABEL: Record<PairSlot, string> = {
  now: "Now",
  soon: "Coming up",
  next: "Next",
};

/** A drink: a portrait picture (or the monogram), its name, base · style. */
function SeasonCard({ card, now }: { card: DrinkCard; now: number }) {
  return (
    <Link
      href={`/recipe/${card.slug}`}
      className="group flex flex-col gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted">
        {card.image ? (
          <PureRecipeImage
            slug={card.slug}
            image={card.image}
            alt=""
            width={400}
            height={600}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            fallback={<RecipeCardPlaceholder name={card.name} />}
          />
        ) : (
          <RecipeCardPlaceholder name={card.name} />
        )}
      </div>
      <span className="font-display leading-tight font-semibold group-hover:text-primary">
        {now > 0 && isNewDrink(card.date, now) && <NewMark />}
        {card.name}
      </span>
      {card.meta.length > 0 && (
        <span className="font-mono text-xs text-muted-foreground">
          {card.meta.join(" · ")}
        </span>
      )}
    </Link>
  );
}

/**
 * "In season" (42d, canvas B): the current and next holiday side by side —
 * `holidayPair`, the holidays with drinks within the homepage's 180-day
 * "Coming up" window, cut to two — each with its countdown, its date, its
 * drinks and "All N" to its menu page (`/holidays/<slug>`, 42e, on its
 * drinks). The sooner shows four cards, the later two and the names of the
 * rest; on a phone each is a row that scrolls sideways.
 *
 * Today is the browser's (`useToday(null)`, U1): nothing on the server, so
 * the export's static HTML never names a holiday or a number of days.
 */
export function SeasonPair({ holidays }: { holidays: SeasonalDrinks[] }) {
  const headingId = useId();
  const today = useToday(null);
  if (today === null) return null;
  const day = parseDayKey(today);
  const pair = holidayPair(holidays, day);
  if (pair.length === 0) return null;
  const now = Date.parse(today);

  return (
    <section
      aria-labelledby={headingId}
      data-testid="drinks-season"
      className="flex flex-col gap-3.5"
    >
      <h2
        id={headingId}
        className="m-0 font-display text-2xl font-semibold tracking-tight"
      >
        In season
      </h2>
      <div
        className={cn(
          "grid gap-8",
          pair.length === 2 && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
        )}
      >
        {pair.map((holiday, i) => {
          const date = addDays(day, holiday.days);
          const shown = i === 0 ? NOW_CARDS : NEXT_CARDS;
          const also = alsoLine(
            holiday.drinks.map((card) => card.name),
            holiday.count,
            shown,
          );
          return (
            <div
              key={holiday.slug}
              data-testid="drinks-holiday"
              data-slot={holiday.slot}
              className={cn(
                "flex min-w-0 flex-col gap-3",
                i > 0 && "lg:border-l lg:border-border lg:pl-8",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <Badge variant={i === 0 ? "default" : "secondary"}>
                    {SLOT_LABEL[holiday.slot]}
                  </Badge>
                  <h3 className="m-0 font-display text-lg leading-tight font-semibold">
                    <Link
                      href={`/holidays/${holiday.slug}`}
                      className="hover:text-primary"
                    >
                      {holiday.label}
                    </Link>
                  </h3>
                  <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
                    {countdownLabel(holiday.days)} ·{" "}
                    <time dateTime={dayKey(date)}>{formatDayShort(date)}</time>
                  </span>
                </div>
                <Link
                  href={`/holidays/${holiday.slug}?kind=drinks`}
                  className="inline-flex min-h-6 items-center text-sm text-primary underline-offset-4 hover:underline"
                >
                  All <span className="font-mono">{holiday.count}</span>
                  <span className="sr-only">
                    {" "}
                    {holiday.label} {holiday.count === 1 ? "drink" : "drinks"}
                  </span>
                </Link>
              </div>
              <ul
                className={cn(
                  "m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1 sm:grid sm:overflow-visible sm:pb-0",
                  i === 0 ? "sm:grid-cols-4" : "sm:grid-cols-2",
                )}
              >
                {holiday.drinks.slice(0, NOW_CARDS).map((card, at) => (
                  <li
                    key={card.slug}
                    className={cn(
                      "w-38 shrink-0 sm:w-auto",
                      at >= shown && "sm:hidden",
                    )}
                  >
                    <SeasonCard card={card} now={now} />
                  </li>
                ))}
              </ul>
              {also && (
                <p className="m-0 hidden text-xs text-muted-foreground sm:block">
                  {also}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
