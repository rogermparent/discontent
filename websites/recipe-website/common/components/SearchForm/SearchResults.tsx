"use client";

import { useMemo, useState } from "react";
import { ListFilter } from "lucide-react";
import { useSearch } from "./SearchContext";
import { EmptyState } from "../EmptyState";
import { SearchSkeleton } from "./SearchSkeleton";
import { GroupRail } from "./GroupRail";
import { GroupResults } from "./GroupResults";
import { RecentSearches } from "./RecentSearches";
import { QueryChips } from "./QueryChips";
import { SearchTicker } from "./SearchTicker";
import { NarrowColumn } from "./NarrowColumn";
import {
  KindBands,
  NoResults,
  ResultGrid,
  SeasonBands,
  TermCard,
  type CardContext,
} from "./SearchBands";
import { SEARCH_MARKS } from "./SearchCard";
import { useFacetModel } from "./useFacetModel";
import { kindBands, queryWords, seasonBands, subjectOf } from "./searchView";
import { countFilterTerms } from "./queryLanguage";
import { countFacets, queryKind } from "../../util/facets";
import { localDay } from "../../util/holidays";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@discontent/component-library/components/ui/sheet";
import { RecipeSort, RecipeSortControl, useSortedRecipes } from "../RecipeSort";

/**
 * `/search` below the field (43s, canvas B "Sorted by what it is"): the
 * ticker and sort, the query's chips, the idle browse rails, then two
 * columns — **Narrow** on the left (a sheet on a phone) and the answer on
 * the right:
 *
 * - a `tag:` query opens on its term (`TermCard`), then bands by date when
 *   its results fall into holidays or collections (`SeasonBands`);
 * - results of both kinds, with no Kind chosen, band into Drinks and Food
 *   (`KindBands`);
 * - anything else is one grid, revealed sixty at a time.
 *
 * Every layout is a partition of `displayedRecipes` in its order (sorted by
 * the Sort control), so what the engine ranks and the filter keeps is
 * exactly what it was (42s's parity contract).
 */
export function SearchResultsPage() {
  const {
    query,
    parsedQuery,
    displayedRecipes,
    allRecipes,
    isSearching,
    status,
    error,
    retry,
    recordSearch,
  } = useSearch();
  const model = useFacetModel();
  const filterCount = countFilterTerms(parsedQuery.filter);
  const [sort, setSort] = useState<RecipeSort>("relevance");
  const sortedRecipes = useSortedRecipes(displayedRecipes, sort);
  const [narrowOpen, setNarrowOpen] = useState(false);

  const counts = useMemo(
    () => countFacets(model, sortedRecipes ?? []),
    [model, sortedRecipes],
  );
  const corpus = useMemo(
    () => countFacets(model, allRecipes),
    [model, allRecipes],
  );
  const subject = useMemo(() => subjectOf(model, query), [model, query]);
  const words = useMemo(() => queryWords(parsedQuery.text), [parsedQuery]);

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
  const card: CardContext = {
    model,
    // The *free text*, never the raw query: `tag:dessert` must not go on to
    // <mark> the word "dessert" inside names and descriptions.
    highlightQuery: parsedQuery.text,
    words,
    // Opening a result is a commit: the query clearly worked, so it earns
    // its place in RECENT (typing alone never does).
    onOpen: () => recordSearch(query),
  };
  // Changing the query or the sort starts the reveal over.
  const revealKey = `${query}|${sort}`;
  const hasResults = !!sortedRecipes && sortedRecipes.length > 0;

  let body;
  if (isSearching) {
    body = <SearchSkeleton />;
  } else if (!sortedRecipes || sortedRecipes.length === 0) {
    body = hasFilter ? (
      <NoResults
        model={model}
        text={parsedQuery.text}
        query={query}
        corpusSize={allRecipes.length}
      />
    ) : null;
  } else {
    const seasons = subject
      ? seasonBands(model, sortedRecipes, subject, localDay(new Date()))
      : undefined;
    const kinds =
      !seasons && queryKind(model, query) === undefined
        ? kindBands(model, sortedRecipes)
        : undefined;
    body = seasons ? (
      <SeasonBands
        bands={seasons.bands}
        rest={seasons.rest}
        card={card}
        revealKey={revealKey}
      />
    ) : kinds ? (
      <KindBands bands={kinds} card={card} />
    ) : (
      <ResultGrid key={revealKey} recipes={sortedRecipes} card={card} />
    );
  }

  const narrow = hasResults ? (
    <NarrowColumn model={model} counts={counts} recipes={sortedRecipes} />
  ) : null;

  return (
    <div className={SEARCH_MARKS}>
      <div className="my-2 flex flex-row flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchTicker
            count={total}
            query={query}
            filterCount={filterCount}
            isSearching={isSearching}
            kinds={
              hasResults && !isSearching && counts.kinds.drinks > 0
                ? counts.kinds
                : undefined
            }
          />
        </div>
        {narrow && (
          <Sheet open={narrowOpen} onOpenChange={setNarrowOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 lg:hidden"
              >
                <ListFilter aria-hidden />
                Narrow
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[85vh] overflow-y-auto rounded-t-xl p-4 pt-5"
            >
              <SheetTitle className="sr-only">Narrow these results</SheetTitle>
              {narrow}
            </SheetContent>
          </Sheet>
        )}
        <RecipeSortControl value={sort} onChange={setSort} />
      </div>
      {/* One chip per typed term — nothing at all for a plain search. */}
      <QueryChips />
      {/* Idle: recents and the group rail are the browse affordance; groups
          lead, being destinations rather than filters. */}
      {!hasFilter && <RecentSearches />}
      {!hasFilter && <GroupRail />}
      <div className="mt-3 lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {narrow && (
          <aside
            aria-label="Narrow these results"
            className="hidden pr-1 lg:block"
          >
            {narrow}
          </aside>
        )}
        <div
          className={
            narrow
              ? "flex min-w-0 flex-col gap-6"
              : "flex min-w-0 flex-col gap-6 lg:col-span-2"
          }
        >
          {/* Matching groups sit above the results; the ticker counts recipes. */}
          <GroupResults />
          {subject && hasResults && !isSearching && (
            <TermCard
              model={model}
              slug={subject}
              counts={counts}
              corpus={corpus}
            />
          )}
          {body}
        </div>
      </div>
    </div>
  );
}
