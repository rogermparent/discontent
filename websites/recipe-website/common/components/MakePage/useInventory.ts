"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { assumedStaples, DEFAULT_STAPLES } from "../../util/makeable";
import {
  applyOverlay,
  dedupeItems,
  EMPTY_OVERLAY,
  inventoryKey,
  isLegacyOverlay,
  migrateOverlay,
  overlayFor,
  parseOverlay,
  storedList,
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
const SETTINGS_KEY = "make-settings-v1";
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
const getSettingsSnapshot = () => read(SETTINGS_KEY) ?? "";
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

/**
 * Where a pre-U6 overlay's shared list comes from, for its one-time
 * migration (`migrateOverlay`):
 *
 * - `{ shared }` — the signed-in editor's `/make`: the saved inventory the
 *   overlay was made over, read through the owner's session;
 * - `"browser"` — the export, which never had a shared list: `added` was
 *   the whole list already;
 * - `"defer"` — anywhere else in the editor (a guest, or a page that can't
 *   read the saved list, like the homepage tile): the value is left for the
 *   owner's next signed-in `/make`, and meanwhile reads as `added`.
 */
export type LegacyInventorySource = { shared: string[] } | "browser" | "defer";

/**
 * Which app this bundle is: the editor's `next.config.mjs` sets
 * `NEXT_PUBLIC_RECIPE_APP=editor` at build time; the export leaves it unset.
 */
const IN_EDITOR = process.env.NEXT_PUBLIC_RECIPE_APP === "editor";

/**
 * This browser's list (U6) — the one reader every page shares: `/make`,
 * the homepage's Make tile, `/drinks`' panel.
 *
 * It also migrates a pre-U6 overlay, once, wherever it is first read: on the
 * export as `added`; in the editor only where `legacy` brings the saved list
 * (the signed-in `/make`), deferring everywhere else. `ready` stays false
 * until that is settled, so no page judges a half-read list.
 */
export function useInventory(
  shared: string[] = [],
  legacy?: { shared: string[] },
): Inventory {
  const raw = useSyncExternalStore(
    subscribe,
    getOverlaySnapshot,
    getServerSnapshot,
  );
  const source: LegacyInventorySource =
    legacy ?? (IN_EDITOR ? "defer" : "browser");
  const legacyShared = typeof source === "object" ? source.shared : undefined;
  const defer = source === "defer";
  const migrating = raw !== null && !defer && isLegacyOverlay(raw);
  useEffect(() => {
    if (!migrating) return;
    const stored = read(STORAGE_KEY);
    if (!isLegacyOverlay(stored)) return;
    /* The write fires the store's event: `raw` turns versioned, and done. */
    const items = migrateOverlay(stored, legacyShared);
    write(STORAGE_KEY, items.length > 0 ? storedList(items) : null);
  }, [migrating, legacyShared]);

  const overlay = useMemo(
    () => (raw === null ? EMPTY_OVERLAY : parseOverlay(raw)),
    [raw],
  );
  const have = useMemo(() => applyOverlay(shared, overlay), [shared, overlay]);

  const setHave = useCallback(
    (items: string[]) => {
      const next = overlayFor(shared, dedupeItems(items));
      /* No shared list (U6, every caller now): the whole list, versioned. */
      const value =
        shared.length === 0 ? storedList(next.added) : JSON.stringify(next);
      write(
        STORAGE_KEY,
        next.added.length || next.removed.length ? value : null,
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

  return {
    ready: raw !== null && !migrating,
    have,
    overlay,
    setHave,
    add,
    remove,
    discard,
  };
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

/**
 * `/make`'s judgement settings, per browser like the list itself: whether a
 * close match counts as had (32j, on by default), what this kitchen always
 * has (32j, `DEFAULT_STAPLES` until edited), and whether pantry staples are
 * assumed too (U5, on by default). Each is stored only once changed, so a
 * better default reaches everyone who never touched it.
 *
 * `staples` is the **whole** assumed list — the always-on items plus, while
 * the switch is on, `PANTRY_STAPLES` — so any page that hands it to
 * `analyzeMakeable` (the homepage's Make tile, `/drinks`' panel) follows the
 * switch without knowing it exists.
 */
export interface MakeSettings {
  countClose: boolean;
  /** Everything assumed on hand: `alwaysHave` ∪ pantry staples when on. */
  staples: string[];
  /** The editable "Assume I always have" list (32j). */
  alwaysHave: string[];
  /** True while `alwaysHave` is the default list. */
  defaultStaples: boolean;
  /** "Assume pantry staples" (U5): on unless this browser turned it off. */
  pantryStaples: boolean;
  setCountClose: (value: boolean) => void;
  setPantryStaples: (value: boolean) => void;
  setStaples: (items: string[]) => void;
  resetStaples: () => void;
}

interface StoredSettings {
  countClose?: boolean;
  /** Stored only as `false`: on is the default. */
  pantryStaples?: boolean;
  staples?: string[];
}

function parseSettings(raw: string): StoredSettings {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const { countClose, pantryStaples, staples } = parsed as Record<
      string,
      unknown
    >;
    const out: StoredSettings = {};
    if (typeof countClose === "boolean") out.countClose = countClose;
    if (typeof pantryStaples === "boolean") out.pantryStaples = pantryStaples;
    if (Array.isArray(staples)) {
      out.staples = staples.filter(
        (item): item is string => typeof item === "string",
      );
    }
    return out;
  } catch {
    return {};
  }
}

export function useMakeSettings(): MakeSettings {
  const raw = useSyncExternalStore(
    subscribe,
    getSettingsSnapshot,
    getServerSnapshot,
  );
  const stored = useMemo(() => parseSettings(raw ?? ""), [raw]);
  const save = useCallback(
    (next: StoredSettings) => {
      const merged: StoredSettings = { ...stored, ...next };
      const kept: StoredSettings = {};
      if (merged.countClose !== undefined) kept.countClose = merged.countClose;
      if (merged.pantryStaples !== undefined) {
        kept.pantryStaples = merged.pantryStaples;
      }
      if (merged.staples !== undefined) kept.staples = merged.staples;
      write(
        SETTINGS_KEY,
        Object.keys(kept).length > 0 ? JSON.stringify(kept) : null,
      );
    },
    [stored],
  );
  const setCountClose = useCallback(
    (value: boolean) => save({ countClose: value ? undefined : false }),
    [save],
  );
  const setPantryStaples = useCallback(
    (value: boolean) => save({ pantryStaples: value ? undefined : false }),
    [save],
  );
  const setStaples = useCallback(
    (items: string[]) => save({ staples: dedupeItems(items) }),
    [save],
  );
  const resetStaples = useCallback(() => save({ staples: undefined }), [save]);
  const alwaysHave = stored.staples ?? DEFAULT_STAPLES;
  const pantryStaples = stored.pantryStaples ?? true;
  /* One array per stored value, so a memo keyed on `staples` holds. */
  const staples = useMemo(
    () => assumedStaples(alwaysHave, pantryStaples),
    [alwaysHave, pantryStaples],
  );
  return {
    countClose: stored.countClose ?? true,
    staples,
    alwaysHave,
    defaultStaples: stored.staples === undefined,
    pantryStaples,
    setCountClose,
    setPantryStaples,
    setStaples,
    resetStaples,
  };
}
