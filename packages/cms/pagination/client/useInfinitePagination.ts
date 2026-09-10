import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaginationPage } from "../types";

export interface UseInfinitePaginationOptions<TItem> {
  /**
   * The page the server already rendered. The list starts here and costs no
   * fetch to display, so the client list is continuous with the server HTML
   * rather than replacing it.
   */
  initialPage: PaginationPage<TItem>;
  /**
   * Fetch one page by its *stable page index*, not its URL number. The URL
   * offset is the adopter's to apply — it is the adopter that knows whether
   * this index is served at `/browse/3` or `/recipes/4`.
   */
  fetchPage: (pageIndex: number) => Promise<PaginationPage<TItem>>;
  /**
   * When false, `fetchNextPage` is inert and nothing is appended. Toggling it
   * off does not discard what was already appended — call `reset` for that.
   */
  enabled?: boolean;
}

export interface UseInfinitePaginationResult<TItem> {
  /** The seed page, then every appended page, newest to oldest. */
  pages: PaginationPage<TItem>[];
  /** Every item across every loaded page, in render order. */
  items: TItem[];
  /** The stable index of the page `fetchNextPage` would load, or null. */
  nextPageIndex: number | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  error: Error | null;
  fetchNextPage: () => void;
  /** Discard everything appended and return to the seed page alone. */
  reset: () => void;
}

/**
 * Walk a paginated index toward older content, appending as it goes.
 *
 * The whole walk is `olderPage`: `readHead` sets it to `headPage - 2`,
 * correctly skipping the page folded into the landing, and `readPage(n)` sets
 * it to `n - 1`. So following it from any seed — the landing fold or a
 * numbered deep link — visits every item exactly once and stops at the oldest
 * page. The hook adds no cursor logic of its own; that property is the index's.
 *
 * **Deliberately dependency-free.** The obvious implementation wraps
 * `useInfiniteQuery`, and `PaginationPage`'s own field comments name that API.
 * But `@discontent/cms` depends on no view layer beyond React today, and the
 * demo — the first adopter, and the one that has to prove the engine with the
 * fewest moving parts — has no react-query. Making the package's first
 * paginated client hook drag a query library behind it would push that
 * dependency onto every future adopter (portfolio, F5) to buy dedupe and retry
 * that an append-only walk does not need. The result shape still mirrors
 * react-query's (`pages`, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`)
 * so an adopter that already has it can swap this out mechanically.
 *
 * Placed under `pagination/client/` rather than `pagination/next/`, which is
 * server-only: `cachedReads` there reaches for LMDB. No `"use client"`
 * directive, matching `hooks/useCurrentTimezone` and its six adopters — the
 * consuming component owns the boundary.
 */
export function useInfinitePagination<TItem>({
  initialPage,
  fetchPage,
  enabled = true,
}: UseInfinitePaginationOptions<TItem>): UseInfinitePaginationResult<TItem> {
  const [appended, setAppended] = useState<PaginationPage<TItem>[]>([]);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /*
   * A client-side navigation between numbered pages remounts nothing, so the
   * seed can change underneath a list that has already appended to it. Keyed
   * on the seed's identity rather than the object, which a re-render replaces.
   *
   * Adjusted during render rather than in an effect — React's own pattern for
   * resetting state when a prop changes. An effect would let one frame paint
   * the new seed with the old seed's appended pages still below it.
   */
  const seedKey = `${initialPage.pageIndex}:${initialPage.version}`;
  const [renderedSeedKey, setRenderedSeedKey] = useState(seedKey);
  const seedChanged = renderedSeedKey !== seedKey;
  if (seedChanged) {
    setRenderedSeedKey(seedKey);
    setAppended([]);
    setError(null);
  }
  /* `appended` still holds the old seed's pages until the re-render lands. */
  const loaded = useMemo(
    () => (seedChanged ? [initialPage] : [initialPage, ...appended]),
    [seedChanged, initialPage, appended],
  );

  const nextPageIndex = loaded[loaded.length - 1].olderPage;
  const hasNextPage = nextPageIndex !== null;

  /*
   * A ref, not the state flag: two intersection callbacks can fire in one
   * frame, and both would read the same stale `false` before either render
   * lands. This closes that window without an extra render.
   */
  const inFlight = useRef(false);

  /*
   * Written in an effect, not during render: a render-phase ref write is what
   * `react-hooks/refs` forbids, and effects run before any interaction can
   * call `fetchNextPage`, so these are current by the time they are read.
   */
  const fetchPageRef = useRef(fetchPage);
  const seedKeyRef = useRef(seedKey);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
    seedKeyRef.current = seedKey;
  });

  const fetchNextPage = useCallback(() => {
    if (!enabled || nextPageIndex === null || inFlight.current) return;
    inFlight.current = true;
    setIsFetchingNextPage(true);
    setError(null);

    const requestedSeedKey = seedKeyRef.current;
    const requestedIndex = nextPageIndex;

    fetchPageRef
      .current(requestedIndex)
      .then((page) => {
        /* The seed moved mid-flight; this page belongs to a list that is gone. */
        if (seedKeyRef.current !== requestedSeedKey) return;
        setAppended((current) => {
          const last = current[current.length - 1];
          /*
           * Only ever move older. The no-duplicate property belongs to the
           * index, but enforcing it here too costs one comparison and turns a
           * stale or misrouted response into a stall rather than an infinite
           * loop that appends the same page forever.
           */
          const previousIndex = last ? last.pageIndex : initialPage.pageIndex;
          if (
            page.pageIndex === null ||
            (previousIndex !== null && page.pageIndex >= previousIndex)
          ) {
            return current;
          }
          return [...current, page];
        });
      })
      .catch((cause: unknown) => {
        if (seedKeyRef.current !== requestedSeedKey) return;
        /*
         * `hasNextPage` is untouched, so the trigger stays mounted and the
         * next scroll retries. A failed page must not look like the end of
         * the list.
         */
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        inFlight.current = false;
        setIsFetchingNextPage(false);
      });
  }, [enabled, nextPageIndex, initialPage.pageIndex]);

  const reset = useCallback(() => {
    setAppended([]);
    setError(null);
  }, []);

  const items = useMemo(() => loaded.flatMap((page) => page.items), [loaded]);

  return {
    pages: loaded,
    items,
    nextPageIndex,
    hasNextPage,
    isFetchingNextPage,
    error,
    fetchNextPage,
    reset,
  };
}

export default useInfinitePagination;
