import { useCallback, useEffect, useRef, useState } from "react";

export interface UseIntersectionTriggerOptions {
  /** When false, the observer is not attached at all. */
  enabled?: boolean;
  /**
   * How far below the viewport the sentinel counts as visible. Generous by
   * default so the next page is in flight before the reader reaches the end.
   */
  rootMargin?: string;
  /**
   * Re-attach the observer whenever this value changes. **Pass the number of
   * loaded pages.**
   *
   * `IntersectionObserver` reports *transitions*. A sentinel that was visible
   * before an append and is still visible after it never fires a second time,
   * so on a list short enough that the end stays on screen the walk stalls
   * after exactly one page — which is precisely what the demo's 14-note
   * fixture does. Re-attaching calls `observe()` again, and `observe()` always
   * delivers an initial entry for the current state, visible or not.
   *
   * Keyed on a value the adopter controls rather than on the hook's own
   * fetching flag: the flag only works if React renders the intermediate
   * state, and a fast local response can batch that render away. A page count
   * changes exactly once per append, whatever React does with it.
   */
  resetKey?: unknown;
}

/**
 * Call `onIntersect` whenever a sentinel element scrolls into view.
 *
 * Separate from `useInfinitePagination` on purpose: the walk is testable
 * without a DOM, and an adopter that wants a button instead of a scroll
 * trigger — or that gates auto-loading on `prefers-reduced-motion` — just
 * doesn't use this half.
 *
 * @returns a ref callback to put on the sentinel element.
 */
export function useIntersectionTrigger(
  onIntersect: () => void,
  {
    enabled = true,
    rootMargin = "400px",
    resetKey,
  }: UseIntersectionTriggerOptions = {},
) {
  const [element, setElement] = useState<Element | null>(null);

  /*
   * The callback is almost always a fresh closure each render. Holding it in a
   * ref keeps the observer out of the dependency list, so it is not torn down
   * and rebuilt on every render — which would re-fire against an
   * already-visible sentinel and make `resetKey` meaningless.
   *
   * Assigned in an effect, not during render: `react-hooks/refs` forbids the
   * latter. Declared before the observer effect so it has already run by the
   * time the observer can fire.
   */
  const onIntersectRef = useRef(onIntersect);
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  });

  useEffect(() => {
    if (!element || !enabled) return;
    /* Absent in jsdom and in any older browser; the fallback is the visible
     * "Load more" control the adopter renders anyway. */
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onIntersectRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, enabled, rootMargin, resetKey]);

  return useCallback((node: Element | null) => setElement(node), []);
}

export default useIntersectionTrigger;
