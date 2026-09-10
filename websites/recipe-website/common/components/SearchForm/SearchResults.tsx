"use client";

import { useState } from "react";
import { useSearch } from "./SearchContext";
import SearchList from "../SearchList";
import { RecipeCardLink } from "../List/shared";
import { EmptyState } from "../EmptyState";
import { SearchSkeleton } from "./SearchSkeleton";
import { TagFilterRail } from "./TagFilterRail";
import { GroupRail } from "./GroupRail";
import { GroupResults } from "./GroupResults";
import { RecentSearches } from "./RecentSearches";
import { QueryChips } from "./QueryChips";
import { SearchTicker } from "./SearchTicker";
import { countFilterTerms } from "./queryLanguage";
import { Button } from "@discontent/component-library/components/ui/button";
import { RecipeSort, RecipeSortControl, useSortedRecipes } from "../RecipeSort";

/** Cards rendered before the reveal control appears, and per "Show more" press. */
const REVEAL_STEP = 60;

export function SearchResultsPage() {
  const {
    query,
    parsedQuery,
    displayedRecipes,
    isSearching,
    status,
    error,
    retry,
    submitSearch,
    recordSearch,
  } = useSearch();
  const filterCount = countFilterTerms(parsedQuery.filter);
  const [sort, setSort] = useState<RecipeSort>("relevance");
  const sortedRecipes = useSortedRecipes(displayedRecipes, sort);

  // Progressive reveal. The whole corpus is already in memory (the client
  // downloaded it via /search/all) and images lazy-load, so this is a DOM-node
  // and scroll-length cap, not a data cap — which is why it's local state and
  // not a URL page number that would fight the URL sync's replaceState.
  const [visibleCount, setVisibleCount] = useState(REVEAL_STEP);

  // Reset the cap when the inputs that define the result set change. Derived
  // during render off a "last inputs" key rather than in an effect, because
  // eslint-plugin-react-hooks@7's `set-state-in-effect` rule forbids setState in
  // effect bodies (same pattern as the palette's selection snap). The query is
  // the whole of the filter state now, so it and the sort are the whole key.
  const inputsKey = `${query}|${sort}`;
  const [lastInputsKey, setLastInputsKey] = useState(inputsKey);
  if (inputsKey !== lastInputsKey) {
    setLastInputsKey(inputsKey);
    setVisibleCount(REVEAL_STEP);
  }

  if (status === "error") {
    return (
      <EmptyState
        title="Search is unavailable"
        message={error?.message || "Something went wrong loading recipes."}
        action={
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  }

  const hasFilter = !!query;
  const total = sortedRecipes?.length;
  const visibleRecipes = sortedRecipes?.slice(0, visibleCount);
  const remaining = total === undefined ? 0 : total - visibleCount;

  let body;
  if (isSearching) {
    body = <SearchSkeleton />;
  } else if (!sortedRecipes || sortedRecipes.length === 0) {
    body = hasFilter ? (
      <EmptyState
        title="No matches"
        message="Nothing matched. Try a different term or loosen the filters."
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => submitSearch("")}
          >
            Clear search
          </Button>
        }
      />
    ) : null;
  } else {
    body = (
      <>
        <SearchList
          recipeResults={visibleRecipes}
          // The *free text*, never the raw query: `tag:dessert` must not go on
          // to <mark> the word "dessert" inside names and descriptions.
          highlightQuery={parsedQuery.text}
          renderItemWrapper={(recipe, content) => (
            <RecipeCardLink
              href={`/recipe/${recipe.slug}`}
              // Opening a result is a commit: the query clearly worked, so it
              // earns its place in RECENT (typing alone never does).
              onClick={() => recordSearch(query)}
            >
              {content}
            </RecipeCardLink>
          )}
        />
        {remaining > 0 && (
          <div className="my-6 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setVisibleCount(
                  (count) => count + Math.min(REVEAL_STEP, remaining),
                )
              }
            >
              Show {Math.min(REVEAL_STEP, remaining)} more
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="my-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <SearchTicker
          count={total}
          query={query}
          filterCount={filterCount}
          isSearching={isSearching}
        />
        <RecipeSortControl value={sort} onChange={setSort} />
      </div>
      {/* One chip per typed term — renders nothing at all for a plain search,
          which is why the default view's baselines don't move. */}
      <QueryChips />
      {/* Idle: recents + the group and tag rails are the browse affordance.
          Groups lead: there are a handful of them against dozens of tags, and
          each one is a destination rather than a filter. */}
      {!hasFilter && <RecentSearches />}
      {!hasFilter && <GroupRail />}
      <TagFilterRail />
      {/* Matching groups sit above the grid; the ticker still counts recipes. */}
      <GroupResults />
      {body}
    </>
  );
}
