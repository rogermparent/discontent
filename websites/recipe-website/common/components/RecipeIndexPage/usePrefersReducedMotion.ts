"use client";

import { useCallback, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the reader has asked for reduced motion.
 *
 * Used here to decide whether the list may grow *on its own*. Auto-appending is
 * motion the reader did not ask for and cannot anticipate — it moves the
 * scrollbar under them and never lets the page end. With reduce set, the
 * sentinel is not attached at all and the "Load more recipes" button is the
 * only way forward, which is the same control the keyboard path uses.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    const list = window.matchMedia(QUERY);
    list.addEventListener("change", callback);
    return () => list.removeEventListener("change", callback);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    /* The server cannot know; assume motion is fine and correct on hydration,
     * which matches how the rest of the site treats media queries. */
    () => false,
  );
}

export default usePrefersReducedMotion;
