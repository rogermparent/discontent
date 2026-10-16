"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  countdownLabel,
  parseDayKey,
  withinComingUpWindow,
} from "../../util/holidays";
import { useToday } from "./useToday";

/** How many holidays the section shows. */
export const COMING_UP_LIMIT = 4;

export interface ComingUpCard {
  slug: string;
  label: string;
  /** "32 recipes · 1 plan", already spelled out on the server. */
  counts: string;
  /** The picture, rendered on the server (an image or the monogram). */
  picture: ReactNode;
}

/**
 * The "Coming up" cards, ordered by the reader's calendar.
 *
 * The server hands over every holiday that leads somewhere, with its picture
 * already rendered; this picks the next `COMING_UP_LIMIT` within the
 * 180-day window (`withinComingUpWindow`) by today's date and prints each
 * countdown. `serverDay` is the server's own day, used to pick the first
 * order and selection — on the editor that is today; on the static export
 * it is the build's day. The countdown **text** waits for the browser's own
 * day (`useToday(null)`, as `TodayLine` does) rather than ever printing a
 * number computed from the build's day, which could read wrong by morning.
 */
export function ComingUpCards({
  cards,
  serverDay,
}: {
  cards: ComingUpCard[];
  serverDay: string;
}) {
  const browserToday = useToday(null);
  const today = browserToday ?? serverDay;
  const shown = withinComingUpWindow(cards, parseDayKey(today)).slice(
    0,
    COMING_UP_LIMIT,
  );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {shown.map((card) => (
        <li key={card.slug} data-testid="coming-up-card">
          <Link
            href={`/tags/${card.slug}`}
            className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-colors hover:border-primary/50"
          >
            <div className="aspect-[16/10] w-full overflow-hidden">
              {card.picture}
            </div>
            <div className="flex flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 pt-3 sm:px-4 sm:pt-3.5">
              <span className="font-display text-base font-semibold leading-tight sm:text-lg">
                {card.label}
              </span>
              {browserToday !== null && (
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-primary">
                  {countdownLabel(card.days)}
                </span>
              )}
            </div>
            <span className="px-3 pb-3 pt-1 font-mono text-xs tabular-nums text-muted-foreground sm:px-4 sm:pb-4">
              {card.counts}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default ComingUpCards;
