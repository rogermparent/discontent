"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import { nextSeasonal, parseDayKey } from "../../util/holidays";
import { useToday } from "../Homepage/useToday";

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

/**
 * "For Halloween" (U3): the drinks of the next holiday that has any. Every
 * candidate is rendered on the server and the browser picks one, because a
 * choice made at build time goes stale on the static export. The dates are
 * `util/holidays`, the homepage's "Coming up" calendar; the policy is this
 * row's own (`nextSeasonal`): the soonest dated holiday with drinks, and
 * only when it is at most 60 days away (38a, D1) — otherwise no row at all.
 * A holiday with no rule is never "next". Today is the browser's
 * (`useToday(null)`): nothing on the server, so the static HTML never names
 * a holiday.
 */
export function SeasonalDrinks({ options }: { options: SeasonalOption[] }) {
  const headingId = useId();
  const today = useToday(null);
  if (today === null) return null;
  const next = nextSeasonal(options, parseDayKey(today));
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
