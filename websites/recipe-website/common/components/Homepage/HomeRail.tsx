"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useHomeDay } from "./HomeDay";

export interface FeaturedListRow {
  key: string;
  /** The holiday's slug, for a feature of a dated holiday term. */
  holiday?: string;
  /** A recipe's or a plan's slug, for the page's once-only rule (47h). */
  recipe?: string;
  group?: string;
  /** Its target is gone (22g): it takes its slot and renders nothing. */
  dangling?: boolean;
  /** The row, rendered on the server; `null` for a dangling one. */
  row: ReactNode;
}

/**
 * The column beside New in the collection (48e, canvas B; 42f's right
 * rail): "On the plan" — the newest plan, unless it is a holiday's plan
 * already shown under its holiday above — then "Featured", a short list less
 * what the page already shows (`homepageDay`: a holiday with a row above, a
 * past holiday, a plan shown above, a recipe shown above), cut to `limit`.
 *
 * A client island because what it shows depends on the reader's day. With
 * neither a plan nor a feature to show, it renders nothing at all, rather
 * than an empty box.
 */
export function HomeRail({
  plan,
  rows,
  limit,
  className,
}: {
  /** The plan panel, rendered on the server; `null` with no plans. */
  plan: ReactNode;
  rows: FeaturedListRow[];
  limit: number;
  className?: string;
}) {
  const page = useHomeDay();
  let visible: FeaturedListRow[];
  if (page) {
    const byKey = new Map(rows.map((row) => [row.key, row]));
    visible = page.day.featured.flatMap((key) => {
      const row = byKey.get(key);
      return row ? [row] : [];
    });
  } else {
    visible = rows.slice(0, limit).filter((row) => !row.dangling);
  }
  if (page?.day.planShown) plan = null;
  if (!plan && visible.length === 0) return null;
  return (
    <div className={className}>
      {plan}
      {visible.length > 0 && (
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
      )}
    </div>
  );
}

export default HomeRail;
