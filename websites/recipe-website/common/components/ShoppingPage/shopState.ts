"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DONE_AISLES_KEY,
  readDoneAisles,
  type DoneAisles,
} from "../../util/shoppingPage";

/*
 * 42g's per-browser state, each a per-viewer convenience kept in
 * localStorage (and in memory where storage throws): which job the page is
 * doing — planning at home or shopping in the store — and which aisles this
 * trip has marked done. Read through `useSyncExternalStore`, so the server
 * and the first client render agree and a change in another tab shows here.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === MODE_KEY ||
      event.key === DONE_AISLES_KEY
    ) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia(WIDE);
    media.addEventListener("change", listener);
  } catch {
    media = undefined;
  }
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Storage, or memory where this browser refuses it (a private window). */
const memory = new Map<string, string | null>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null): void {
  memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* In memory only. */
  }
  notify();
}

// --- the mode ---------------------------------------------------------------

export type ShoppingMode = "plan" | "shop";

const MODE_KEY = "shopping-mode";
/** Wide enough for the list beside its panels: `lg`. */
const WIDE = "(min-width: 1024px)";

/**
 * What this browser chose last; with no choice yet, the viewport's job —
 * planning on a wide screen, shopping on a phone (42-Dg1).
 */
function readMode(): ShoppingMode {
  const stored = read(MODE_KEY);
  if (stored === "plan" || stored === "shop") return stored;
  try {
    return window.matchMedia(WIDE).matches ? "plan" : "shop";
  } catch {
    return "shop";
  }
}

/**
 * The page's mode. The server renders "shop" (no viewport there): the phone,
 * where the page is used in a hurry, never flashes; a wide screen switches
 * to "plan" as it hydrates.
 */
export function useShoppingMode(): [
  ShoppingMode,
  (mode: ShoppingMode) => void,
] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "shop" as const);
  const setMode = useCallback(
    (next: ShoppingMode) => write(MODE_KEY, next),
    [],
  );
  return [mode, setMode];
}

// --- the aisles marked done ------------------------------------------------------

const NO_DONE: DoneAisles = {};
let doneCache: { raw: string | null; value: DoneAisles } | undefined;

/** The stored map, parsed once per change (a stable snapshot). */
function readDone(): DoneAisles {
  const raw = read(DONE_AISLES_KEY);
  if (doneCache && doneCache.raw === raw) return doneCache.value;
  doneCache = { raw, value: readDoneAisles(raw, Date.now()) };
  return doneCache.value;
}

/** The aisles marked done, and a setter given what is stored now. */
export function useDoneAisles(): [
  DoneAisles,
  (change: (current: DoneAisles) => DoneAisles) => void,
] {
  const done = useSyncExternalStore(subscribe, readDone, () => NO_DONE);
  const setDone = useCallback((change: (current: DoneAisles) => DoneAisles) => {
    const next = change(readDone());
    write(
      DONE_AISLES_KEY,
      Object.keys(next).length > 0 ? JSON.stringify(next) : null,
    );
  }, []);
  return [done, setDone];
}
