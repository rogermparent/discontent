"use client";

/**
 * The station-ticket read-out under the search field: a mono-uppercase line
 * that always reports the state of the result set.
 *
 *   idle    →  ALL 300 RECIPES
 *   active  →  42 RESULTS · "creme tag:dessert" · 2 FILTERS
 *   pending →  SEARCHING…
 *
 * It reports the **total** match count, never the number of cards currently
 * revealed, so the progressive-reveal cap can't misrepresent the result set.
 * `aria-live="polite"` makes the same information available to a screen reader,
 * which matters more now that there is no Submit button to announce a change.
 */
export function SearchTicker({
  count,
  query,
  filterCount,
  isSearching,
}: {
  /** Total matches, or `undefined` while the corpus is still loading. */
  count: number | undefined;
  query: string;
  /** Typed terms in the query's filter — `tag:`, `time:<30`, and the rest. */
  filterCount: number;
  isSearching: boolean;
}) {
  const parts: string[] = [];

  if (isSearching) {
    parts.push("Searching…");
  } else if (count === undefined) {
    parts.push("Loading recipes…");
  } else if (!query) {
    parts.push(`All ${count} ${count === 1 ? "recipe" : "recipes"}`);
  } else {
    parts.push(`${count} ${count === 1 ? "result" : "results"}`);
  }

  if (query) parts.push(`“${query}”`);
  if (filterCount > 0) {
    parts.push(`${filterCount} ${filterCount === 1 ? "filter" : "filters"}`);
  }

  return (
    <p
      aria-live="polite"
      data-testid="search-ticker"
      className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground"
    >
      {parts.join(" · ")}
    </p>
  );
}
