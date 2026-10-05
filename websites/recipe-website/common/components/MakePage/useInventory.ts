"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  applyOverlay,
  dedupeItems,
  EMPTY_OVERLAY,
  inventoryKey,
  overlayFor,
  parseOverlay,
  type InventoryOverlay,
} from "../../util/inventoryText";

/**
 * What this browser has on hand (25c/D10), as an overlay on a shared list:
 * the items it added and the shared items it hid. On the static export there
 * is no shared list, so the overlay's `added` *is* the inventory; 25d's
 * editor passes the content repository's list in as `shared`.
 *
 * The same `localStorage` + `useSyncExternalStore` shape as `useListMode`:
 * a custom event for this tab, the `storage` event for the others, and every
 * storage touch in a try/catch, since a private window can refuse it.
 */
const STORAGE_KEY = "make-inventory-v1";
const LAST_QUERY_KEY = "make-last-query";
const LOCAL_EVENT = "make-inventory-storage";

function subscribe(callback: () => void) {
  window.addEventListener(LOCAL_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LOCAL_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Storage refused: the change lives until the tab closes. */
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/* `""` rather than `null` once on the client, so the server's `null` can mean
 * "not read yet" and the page shows a skeleton instead of an empty state. */
const getOverlaySnapshot = () => read(STORAGE_KEY) ?? "";
const getLastQuerySnapshot = () => read(LAST_QUERY_KEY) ?? "";
const getServerSnapshot = (): string | null => null;

export interface Inventory {
  /** False until the browser's storage has been read. */
  ready: boolean;
  /** What this browser has: (shared − removed) ∪ added. */
  have: string[];
  overlay: InventoryOverlay;
  /** Replace the whole list; stored as the smallest overlay on `shared`. */
  setHave: (items: string[]) => void;
  add: (items: string[]) => void;
  remove: (item: string) => void;
  /** Forget this browser's changes — back to the shared list. */
  discard: () => void;
}

export function useInventory(shared: string[] = []): Inventory {
  const raw = useSyncExternalStore(
    subscribe,
    getOverlaySnapshot,
    getServerSnapshot,
  );
  const overlay = useMemo(
    () => (raw === null ? EMPTY_OVERLAY : parseOverlay(raw)),
    [raw],
  );
  const have = useMemo(() => applyOverlay(shared, overlay), [shared, overlay]);

  const setHave = useCallback(
    (items: string[]) => {
      const next = overlayFor(shared, dedupeItems(items));
      write(
        STORAGE_KEY,
        next.added.length || next.removed.length ? JSON.stringify(next) : null,
      );
    },
    [shared],
  );
  const add = useCallback(
    (items: string[]) => setHave([...have, ...items]),
    [have, setHave],
  );
  const remove = useCallback(
    (item: string) =>
      setHave(have.filter((kept) => inventoryKey(kept) !== inventoryKey(item))),
    [have, setHave],
  );
  const discard = useCallback(() => write(STORAGE_KEY, null), []);

  return { ready: raw !== null, have, overlay, setHave, add, remove, discard };
}

/**
 * The last scope query used on `/make`: `undefined` before storage is read,
 * `null` when none was ever set. Stored JSON-encoded so a deliberately
 * cleared scope (`""`, the whole corpus) is not mistaken for no choice.
 */
export function useLastMakeQuery(): [
  string | null | undefined,
  (query: string) => void,
] {
  const raw = useSyncExternalStore(
    subscribe,
    getLastQuerySnapshot,
    getServerSnapshot,
  );
  let last: string | null | undefined;
  if (raw === null) {
    last = undefined;
  } else {
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      last = typeof parsed === "string" ? parsed : null;
    } catch {
      last = null;
    }
  }
  const remember = useCallback((query: string) => {
    write(LAST_QUERY_KEY, JSON.stringify(query));
  }, []);
  return [last, remember];
}
