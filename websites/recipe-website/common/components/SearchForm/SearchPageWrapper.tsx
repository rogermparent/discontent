"use client";

import { useSearchURLSync } from "./useSearchURLSync";
import { SearchInput } from "./SearchInput";
import { SearchResultsPage } from "./SearchResults";

/**
 * `/search` — the dwell surface of the same search language the ⌘K palette
 * speaks. Compose order is deliberate: instrument → ticker → (chips when the
 * query is more than bare words) → (recents when idle) → facet rail → results →
 * reveal control.
 */
export function SearchPageWrapper() {
  useSearchURLSync(true); // Enable URL sync for page mode

  return (
    <>
      {/* The one surface that offers completions — see `SearchInput`'s prop. */}
      <SearchInput className="mt-2" autocomplete />
      <SearchResultsPage />
    </>
  );
}
