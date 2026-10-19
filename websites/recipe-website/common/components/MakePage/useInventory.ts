"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { assumedStaples, DEFAULT_STAPLES } from "../../util/makeable";
import {
  dedupeItems,
  inventoryKey,
  isLegacyOverlay,
  migrateOverlay,
  parseOverlay,
  storedList,
} from "../../util/inventoryText";
import { canonicalItems } from "../../util/matchers";

/**
 * What this browser has on hand (25c/D10, U6): its whole list, in both apps,
 * stored as `storedList` (`inventoryText.ts`). A pre-U6 value — an overlay on
 * the editor's shared list — is migrated once (see `useInventory`).
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

/** False when storage refused the write (a private window, the quota). */
function store(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function write(key: string, value: string | null) {
  store(key, value);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/**
 * A list storage refused to keep (the quota), over the stored value it
 * failed to replace. The snapshot answers it while storage still holds that
 * value, so a migration finishes rather than leaving the page on its
 * skeleton, and a change lives until the tab closes.
 */
let refused: { over: string; value: string } | null = null;

function writeList(value: string | null) {
  const over = read(STORAGE_KEY) ?? "";
  refused = store(STORAGE_KEY, value) ? null : { over, value: value ?? "" };
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/* `""` rather than `null` once on the client, so the server's `null` can mean
 * "not read yet" and the page shows a skeleton instead of an empty state. */
const getOverlaySnapshot = () => {
  const stored = read(STORAGE_KEY) ?? "";
  return refused && refused.over === stored ? refused.value : stored;
};
const getLastQuerySnapshot = () => read(LAST_QUERY_KEY) ?? "";
const getSettingsSnapshot = () => read(SETTINGS_KEY) ?? "";
const getServerSnapshot = (): string | null => null;

const NOTHING: string[] = [];

export interface Inventory {
  /** False until the browser's storage has been read (and migrated). */
  ready: boolean;
  /** This browser's whole list. */
  have: string[];
  /** Replace the whole list. */
  setHave: (items: string[]) => void;
  add: (items: string[]) => void;
  remove: (item: string) => void;
}

/**
 * Where a pre-U6 overlay's shared list comes from, for its one-time
 * migration (`migrateOverlay`):
 *
 * - `{ shared }` — the signed-in editor's `/make`: the saved inventory the
 *   overlay was made over, read through the owner's session;
 * - `"browser"` — the export, which never had a shared list: `added` was
 *   the whole list already;
 * - `"defer"` — anywhere else in the editor (a guest, a page that can't read
 *   the saved list, like the homepage tile, or a `/make` whose saved file
 *   doesn't exist yet): the value is left for the owner's next signed-in
 *   `/make`, and meanwhile reads as `added` — and is written back in its
 *   pre-U6 shape, so that migration still merges the saved list in.
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
 *
 * A list storage refuses to keep (the quota, mid-migration or on a change)
 * is held in memory while the stored value stays as it was (`refused`).
 */
export function useInventory(legacy?: { shared: string[] }): Inventory {
  const raw = useSyncExternalStore(
    subscribe,
    getOverlaySnapshot,
    getServerSnapshot,
  );
  const source: LegacyInventorySource =
    legacy ?? (IN_EDITOR ? "defer" : "browser");
  const legacyShared = typeof source === "object" ? source.shared : undefined;
  const defer = source === "defer";
  const legacyStored = raw !== null && isLegacyOverlay(raw);
  const migrating = legacyStored && !defer;
  useEffect(() => {
    if (!migrating || raw === null) return;
    /* The write fires the store's event: `raw` turns versioned, and done. */
    const items = migrateOverlay(raw, legacyShared);
    writeList(items.length > 0 ? storedList(items) : null);
  }, [migrating, raw, legacyShared]);

  /* Canonical on read too (42m2 review): a "beans" stored before matchers
   * reads as `any bean`, as the seat's judge already treats it. */
  const have = useMemo(
    () =>
      raw ? dedupeItems(canonicalItems(parseOverlay(raw).added)) : NOTHING,
    [raw],
  );

  const setHave = useCallback(
    (items: string[]) => {
      /* A matcher is kept as its canonical text (42m2): "beans" → `any bean`. */
      const list = dedupeItems(canonicalItems(items));
      /*
       * While a migration waits (`"defer"`), keep the pre-U6 shape — `added`
       * the list as shown, `removed` as it was, no version — never `null`:
       * an empty overlay still means "the saved list" to that migration.
       */
      const value =
        defer && legacyStored
          ? JSON.stringify({
              added: list,
              removed: parseOverlay(raw).removed,
            })
          : list.length > 0
            ? storedList(list)
            : null;
      writeList(value);
    },
    [defer, legacyStored, raw],
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

  return {
    ready: raw !== null && !migrating,
    have,
    setHave,
    add,
    remove,
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
 * has (32j, `DEFAULT_STAPLES` until edited), whether pantry staples are
 * assumed too (U5, on by default), and whether beans stand in for each
 * other as their own tier (42m, on by default). Each is stored only once
 * changed, so a
 * better default reaches everyone who never touched it.
 *
 * `staples` is the **whole** assumed list — the always-on items plus, while
 * the switch is on, `PANTRY_STAPLES` — so any page that hands it to
 * `analyzeMakeable` (the homepage's Make tile, `/drinks`' panel) follows the
 * switch without knowing it exists.
 */
export interface MakeSettings {
  /** False until the browser's storage has been read (38a: the sync waits). */
  ready: boolean;
  countClose: boolean;
  /** Everything assumed on hand: `alwaysHave` ∪ pantry staples when on. */
  staples: string[];
  /** The editable "Assume I always have" list (32j). */
  alwaysHave: string[];
  /** True while `alwaysHave` is the default list. */
  defaultStaples: boolean;
  /** "Assume pantry staples" (U5): on unless this browser turned it off. */
  pantryStaples: boolean;
  /**
   * "Let beans stand in for each other" (42m): the "With a bean swap" tier,
   * on unless this browser turned it off. `/make` only — it adds a tier,
   * so the pages that show counts alone never read it.
   */
  beanSwaps: boolean;
  /**
   * "Count from" (41h): which list every count judges — this browser's
   * (the default, and U6's rule for a browser that never chose), the second
   * list the page has (the signed-in editor's saved list, or the house
   * snapshot an export shares), or both.
   */
  source: CountFrom;
  /** The cards (41h): photo cards (the default) or compact spec cards. */
  view: CardView;
  setCountClose: (value: boolean) => void;
  setPantryStaples: (value: boolean) => void;
  setBeanSwaps: (value: boolean) => void;
  setStaples: (items: string[]) => void;
  resetStaples: () => void;
  setSource: (value: CountFrom) => void;
  setView: (value: CardView) => void;
  /** 38a: why the signed-in editor couldn't save the list, when it couldn't. */
  staplesNotice?: string;
}

export type CountFrom = "browser" | "saved" | "both";
export type CardView = "photos" | "specs";

const COUNT_FROM: CountFrom[] = ["browser", "saved", "both"];
const CARD_VIEWS: CardView[] = ["photos", "specs"];

export interface StoredSettings {
  countClose?: boolean;
  /** Stored only as `false`: on is the default. */
  pantryStaples?: boolean;
  /** Stored only as `false`: on is the default (42m). */
  beanSwaps?: boolean;
  staples?: string[];
  /** Stored only when not `"browser"` (41h). */
  source?: CountFrom;
  /** Stored only when not `"photos"` (41h). */
  view?: CardView;
}

/**
 * `make-settings-v1` as stored: anything unknown or mistyped is dropped, so a
 * value written before a field existed — every one before 41h has no
 * `source` — reads as that field's default.
 */
export function parseSettings(raw: string): StoredSettings {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const { countClose, pantryStaples, beanSwaps, staples, source, view } =
      parsed as Record<string, unknown>;
    const out: StoredSettings = {};
    if (typeof countClose === "boolean") out.countClose = countClose;
    if (typeof pantryStaples === "boolean") out.pantryStaples = pantryStaples;
    if (typeof beanSwaps === "boolean") out.beanSwaps = beanSwaps;
    if (Array.isArray(staples)) {
      out.staples = staples.filter(
        (item): item is string => typeof item === "string",
      );
    }
    if (COUNT_FROM.includes(source as CountFrom)) {
      out.source = source as CountFrom;
    }
    if (CARD_VIEWS.includes(view as CardView)) out.view = view as CardView;
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
  /* Over what storage holds now, not this render's `stored`: a setter
   * kept in a closure (an Undo) must not undo what changed since. */
  const save = useCallback((next: StoredSettings) => {
    const merged: StoredSettings = {
      ...parseSettings(read(SETTINGS_KEY) ?? ""),
      ...next,
    };
    const kept: StoredSettings = {};
    if (merged.countClose !== undefined) kept.countClose = merged.countClose;
    if (merged.pantryStaples !== undefined) {
      kept.pantryStaples = merged.pantryStaples;
    }
    if (merged.beanSwaps !== undefined) kept.beanSwaps = merged.beanSwaps;
    if (merged.staples !== undefined) kept.staples = merged.staples;
    if (merged.source !== undefined) kept.source = merged.source;
    if (merged.view !== undefined) kept.view = merged.view;
    write(
      SETTINGS_KEY,
      Object.keys(kept).length > 0 ? JSON.stringify(kept) : null,
    );
  }, []);
  const setCountClose = useCallback(
    (value: boolean) => save({ countClose: value ? undefined : false }),
    [save],
  );
  const setPantryStaples = useCallback(
    (value: boolean) => save({ pantryStaples: value ? undefined : false }),
    [save],
  );
  const setBeanSwaps = useCallback(
    (value: boolean) => save({ beanSwaps: value ? undefined : false }),
    [save],
  );
  const setStaples = useCallback(
    (items: string[]) => save({ staples: dedupeItems(items) }),
    [save],
  );
  const resetStaples = useCallback(() => save({ staples: undefined }), [save]);
  const setSource = useCallback(
    (value: CountFrom) =>
      save({ source: value === "browser" ? undefined : value }),
    [save],
  );
  const setView = useCallback(
    (value: CardView) => save({ view: value === "photos" ? undefined : value }),
    [save],
  );
  const alwaysHave = stored.staples ?? DEFAULT_STAPLES;
  const pantryStaples = stored.pantryStaples ?? true;
  /* One array per stored value, so a memo keyed on `staples` holds. */
  const staples = useMemo(
    () => assumedStaples(alwaysHave, pantryStaples),
    [alwaysHave, pantryStaples],
  );
  return {
    ready: raw !== null,
    countClose: stored.countClose ?? true,
    staples,
    alwaysHave,
    defaultStaples: stored.staples === undefined,
    pantryStaples,
    beanSwaps: stored.beanSwaps ?? true,
    source: stored.source ?? "browser",
    view: stored.view ?? "photos",
    setCountClose,
    setPantryStaples,
    setBeanSwaps,
    setStaples,
    resetStaples,
    setSource,
    setView,
  };
}
