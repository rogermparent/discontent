"use client";

import type { ReactNode } from "react";
import { useHomeShown } from "./HomeShown";

/**
 * New this week's list (47h): the rows the day's answer keeps
 * (`homepageShown`: none a section above shows), in order — else, outside a
 * `HomeShownProvider`, the first `limit`. Each row is rendered on the
 * server; this only chooses. Keeps `data-testid="recipe-list"`, which
 * `checkNamesInOrder` reads the order from.
 */
export function FreshRows({
  rows,
  limit,
}: {
  rows: Array<{ slug: string; row: ReactNode }>;
  limit: number;
}) {
  const page = useHomeShown();
  const bySlug = new Map(rows.map((entry) => [entry.slug, entry.row]));
  const shown = page
    ? page.fresh.flatMap((slug) => (bySlug.has(slug) ? [bySlug.get(slug)] : []))
    : rows.slice(0, limit).map((entry) => entry.row);
  return (
    <ul
      data-testid="recipe-list"
      className="grid grid-cols-1 gap-x-6 sm:grid-cols-2"
    >
      {shown}
    </ul>
  );
}

export default FreshRows;
