"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How the recipe index presents itself: numbered pages, or one list that grows
 * as the reader scrolls.
 */
export type ListMode = "pages" | "infinite";

/**
 * `pages` is the default, and that is load-bearing rather than timid.
 *
 * It is what the server renders, what a crawler indexes, and what a reader
 * without JavaScript gets — so defaulting to it means the opt-in costs nothing
 * to anyone who never touches the control. It also keeps the numbered URLs the
 * primary way to address the index, which is what makes a deep link mean
 * something. Infinite is remembered once chosen; revisit promoting it once
 * there is something to judge.
 */
export const DEFAULT_LIST_MODE: ListMode = "pages";

const STORAGE_KEY = "recipe-list-mode";

/*
 * The same `localStorage` + `useSyncExternalStore` shape `SearchContext` uses
 * for its own preferences, down to the `storage` listener that carries a
 * change between tabs. A second mechanism for the same job would be one more
 * thing to keep in step.
 */
const LOCAL_EVENT = "recipe-list-mode-storage";

function subscribe(callback: () => void) {
  window.addEventListener(LOCAL_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LOCAL_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/*
 * `null` on the server: there is no preference to read, so the first paint is
 * the default — the same markup a reader with JS off keeps.
 */
const getServerSnapshot = (): string | null => null;

/**
 * The reader's remembered list mode, and a setter that persists it.
 *
 * Returns `DEFAULT_LIST_MODE` until hydration has read storage, so a reader who
 * chose infinite sees numbered pages for one frame. That is the honest
 * trade for keeping the seed page server-rendered; the alternative — blocking
 * the list on a client read — costs everyone a blank frame to spare one
 * reader a brief one.
 */
export function useListMode(): [ListMode, (mode: ListMode) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const mode: ListMode = stored === "infinite" ? "infinite" : DEFAULT_LIST_MODE;

  const setMode = useCallback((next: ListMode) => {
    if (next === DEFAULT_LIST_MODE) {
      /* Don't persist the default — an absent key and "pages" mean the same
       * thing, and clearing it lets a future default change reach readers who
       * never expressed a preference. */
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
    window.dispatchEvent(new Event(LOCAL_EVENT));
  }, []);

  return [mode, setMode];
}

export default useListMode;
