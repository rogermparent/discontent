"use client";

import type { ReactNode } from "react";
import { useSearchURLSync } from "./useSearchURLSync";
import { SearchInput } from "./SearchInput";
import { SearchResultsPage } from "./SearchResults";

/**
 * `/search` — the dwell surface of the same search language the ⌘K palette
 * speaks. Compose order is deliberate: instrument → ticker → (chips when the
 * query is more than bare words) → (recents and groups when idle) → the
 * Narrow column beside the answer (43s: a term card, bands, or one grid).
 *
 * `field` (43q) lets the editor set its Ask toggle beside the field — the
 * export never passes it, so its `/search` has the field alone.
 */
export function SearchPageWrapper({
  field,
}: {
  field?: (input: ReactNode) => ReactNode;
} = {}) {
  useSearchURLSync(true); // Enable URL sync for page mode

  /* The one surface that offers completions — see `SearchInput`'s prop. */
  const input = <SearchInput autocomplete page />;
  return (
    <>
      <div className="mt-2">{field ? field(input) : input}</div>
      <SearchResultsPage />
    </>
  );
}
