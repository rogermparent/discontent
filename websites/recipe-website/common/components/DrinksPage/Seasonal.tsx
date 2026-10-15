"use client";

import Link from "next/link";
import { type ReactNode, useId, useSyncExternalStore } from "react";
import { orderByNextOccurrence } from "../../util/holidays";

export interface SeasonalOption {
  slug: string;
  label: string;
  /** Every drink under the holiday. */
  count: number;
  /** Where "All N … drinks" goes. */
  href: string;
  /** The server-rendered cards. */
  cards: ReactNode;
}

/* Today, as the browser sees it: a string, so the snapshot compares equal
 * between renders, and `null` on the server — the static export cannot know
 * the date it will be read on. */
const noSubscription = () => () => {};
const todaySnapshot = () => new Date().toDateString();
const serverSnapshot = () => null;

/**
 * "For Halloween" (U3): the drinks of the next holiday that has any. Every
 * candidate is rendered on the server and the browser picks one, because a
 * choice made at build time goes stale on the static export. A holiday
 * `util/holidays` has no date for is never "next".
 */
export function SeasonalDrinks({ options }: { options: SeasonalOption[] }) {
  const headingId = useId();
  const today = useSyncExternalStore(
    noSubscription,
    todaySnapshot,
    serverSnapshot,
  );
  if (today === null) return null;
  const next = orderByNextOccurrence(
    options,
    (option) => option.slug,
    new Date(today),
  ).find((entry) => entry.date)?.item;
  if (!next) return null;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="drinks-seasonal"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="font-display text-2xl font-semibold">
          For {next.label}
        </h2>
        <Link
          href={next.href}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          All <span className="font-mono">{next.count}</span> {next.label}{" "}
          {next.count === 1 ? "drink" : "drinks"}
        </Link>
      </div>
      {next.cards}
    </section>
  );
}
