"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  seasonRows,
  withoutSeasonFeatures,
} from "../../controller/homepageComingUp";
import { parseDayKey } from "../../util/holidays";
import { useToday } from "./useToday";

export interface FeaturedListRow {
  key: string;
  /** The holiday's slug, for a feature of a dated holiday term. */
  holiday?: string;
  /** The row, rendered on the server. */
  row: ReactNode;
}

/**
 * The featured list's client half (42f): the rows less the holidays that
 * have a "This season" row on the reader's day (`seasonRows`, the same
 * call `SeasonSection` makes), cut to `limit`. Nothing at all when nothing
 * is left — a featured list of only in-season holidays is already on the
 * page, as their rows.
 *
 * `serverDay` is the first render's day, as everywhere on the page.
 */
export function FeaturedList({
  rows,
  season,
  serverDay,
  limit,
}: {
  rows: FeaturedListRow[];
  season: Array<{ slug: string }>;
  serverDay: string;
  limit: number;
}) {
  const today = useToday(null) ?? serverDay;
  const shown = new Set(
    seasonRows(season, parseDayKey(today)).map((row) => row.slug),
  );
  const visible = withoutSeasonFeatures(rows, shown).slice(0, limit);
  if (visible.length === 0) return null;
  return (
    <section
      aria-labelledby="home-featured"
      className="flex flex-col gap-1 rounded-xl border border-border bg-card p-[1.125rem] text-card-foreground"
    >
      <div className="flex flex-row flex-wrap items-baseline justify-between gap-x-2">
        <h2
          id="home-featured"
          className="font-display text-lg font-semibold tracking-tight"
        >
          Featured
        </h2>
        <Link
          href="/featured-recipes"
          className="inline-flex min-h-6 items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Everything featured
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {visible.map((row) => (
          <li key={row.key}>{row.row}</li>
        ))}
      </ul>
    </section>
  );
}

export default FeaturedList;
