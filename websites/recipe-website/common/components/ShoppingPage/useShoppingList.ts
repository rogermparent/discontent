"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyPending } from "../../util/shoppingTickQueue";
import {
  TickSync,
  type SyncStatus,
  type TickSyncSnapshot,
  type TickSyncStorage,
} from "../../util/shoppingTickSync";
import type { ShoppingItem, ShoppingSettings } from "../../util/shoppingTypes";

export type { SyncStatus };

/** A server action's failure, as the editor's shopping actions answer it. */
export interface ShoppingActionError {
  error: string;
  code: string;
}

export type ShoppingActionResult<T> = T | ShoppingActionError;

export function isActionError(value: unknown): value is ShoppingActionError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

export interface ShoppingListState {
  items: ShoppingItem[];
  settings: ShoppingSettings;
  inventory: string[];
  /** 42g: plan slug → name, for "What's on it" (the server reads them). */
  plans?: Record<string, string>;
}

/**
 * The editor's server actions (`controller/actions/shopping.ts`), passed in
 * as props as `MakePage`'s are, so nothing here imports the editor.
 */
export interface ShoppingPageActions {
  load(): Promise<ShoppingActionResult<ShoppingListState>>;
  add(input: unknown): Promise<
    ShoppingActionResult<{
      added: ShoppingItem[];
      items: ShoppingItem[];
      changed: boolean;
      warnings?: string[];
    }>
  >;
  update(patch: unknown): Promise<
    ShoppingActionResult<{
      items: ShoppingItem[];
      changed: boolean;
      removed?: string[];
      unmatched?: string[];
      unknown?: string[];
    }>
  >;
  saveSettings(
    patch: unknown,
  ): Promise<ShoppingActionResult<{ settings: ShoppingSettings }>>;
}

const STORAGE_KEY = "shopping-pending-ticks";
/** 38d: ticks held for "Done shopping", which must outlive the tab. */
const HELD_STORAGE_KEY = "shopping-held-ticks";

/**
 * A browser storage, where it works; nothing where it throws (a private
 * window, blocked storage: the ticks then live in memory).
 */
function browserTicks(area: () => Storage, key: string): TickSyncStorage {
  return {
    read: () => {
      try {
        return area().getItem(key);
      } catch {
        return null;
      }
    },
    write: (value) => {
      try {
        area().setItem(key, value);
      } catch {
        /* In memory only. */
      }
    },
    clear: () => {
      try {
        area().removeItem(key);
      } catch {
        /* As above. */
      }
    },
  };
}

const sessionTicks = browserTicks(() => window.sessionStorage, STORAGE_KEY);
const heldTicks = browserTicks(() => window.localStorage, HELD_STORAGE_KEY);

const NONE: string[] = [];
const NO_PLANS: Record<string, string> = {};

/**
 * 42g, Done shopping in the store: how long the ticked lines stay hidden,
 * with Undo, before their removal is sent (42-Dg4).
 */
export const CLEAR_UNDO_MS = 8000;

/** How many write answers have been applied (see `useShoppingList`). */
class WriteCounter {
  private count = 0;
  bump(): void {
    this.count += 1;
  }
  get value(): number {
    return this.count;
  }
}

export const UNREACHABLE =
  "Couldn't reach the editor — check the connection and try again.";

/**
 * The list's state on the page: the server's items with this page's pending
 * ticks over them. Ticks go through `TickSync` (D9: batched, `keepalive` on
 * the way out, retried, never lost); every other change is a server action,
 * applied when it answers. A read started before a later write's answer is
 * ignored when it lands, so a slow reload cannot undo a tick on screen.
 */
export function useShoppingList({
  initial,
  actions,
  patchUrl,
}: {
  initial: ShoppingListState;
  actions: ShoppingPageActions;
  patchUrl: string;
}) {
  const [state, setState] = useState<ShoppingListState>(initial);
  const [sync, setSync] = useState<TickSyncSnapshot>({
    pending: new Map(),
    status: "idle",
  });
  const [actionError, setActionError] = useState<string | undefined>();
  /* A tick refusal the person dismissed stays dismissed until a new one. */
  const [dismissedSync, setDismissedSync] = useState<string | undefined>();
  const [working, setWorking] = useState(false);
  /*
   * Bumped by every applied write answer; a read started before one is
   * stale. A counter object, not a ref: `TickSync`'s `onItems`, made once
   * below, bumps it, and the compiler's ref rule refuses a ref handed to a
   * function at render (eslint-plugin-react-hooks 7, seen in 42g).
   */
  const [writes] = useState(() => new WriteCounter());
  /*
   * 42g: lines Done shopping is clearing — hidden now, removed when the Undo
   * window closes (or at once when the page is hidden or left).
   */
  const [clearing, setClearing] = useState<string[] | undefined>();
  const clearingRef = useRef<string[] | undefined>(undefined);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [ticks] = useState(
    () =>
      new TickSync({
        patchUrl,
        fetch: (input, init) => fetch(input, init),
        storage: sessionTicks,
        heldStorage: heldTicks,
        hold: initial.settings.features.holdTicks,
        onItems: (items) => {
          writes.bump();
          setState((current) => ({ ...current, items }));
        },
        onChange: setSync,
      }),
  );

  /* The `holdTicks` switch, as the settings now say (38d). */
  const hold = state.settings.features.holdTicks;
  useEffect(() => {
    ticks.setHold(hold);
  }, [ticks, hold]);
  const reload = useCallback(async () => {
    const started = writes.value;
    try {
      const result = await actions.load();
      if (isActionError(result) || writes.value !== started) return;
      setState(result);
    } catch {
      /* Offline: keep showing what we have; the next visit reads again. */
    }
  }, [actions, writes]);
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  /*
   * Mounted: pick up stored ticks. Hidden (phone locked, tab switched):
   * send what is pending now. Visible again: read the list fresh. Unmounted
   * (a client-side navigation away): send what is pending now.
   */
  useEffect(() => {
    ticks.attach();
    /*
     * A clear still in its Undo window when the page goes away is sent now,
     * as a `keepalive` PATCH (a server action would not outlive the page).
     */
    const sendClearNow = () => {
      const ids = clearingRef.current;
      if (!ids) return;
      clearingRef.current = undefined;
      clearTimeout(clearTimer.current);
      /* Off the page now; the next read confirms it. */
      const gone = new Set(ids);
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => !gone.has(item.id)),
      }));
      setClearing(undefined);
      ticks.forget(ids);
      try {
        void fetch(patchUrl, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ remove: ids }),
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        /* Gone with the page; the lines stay ticked on the list. */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        ticks.flushNow();
        sendClearNow();
      } else void reloadRef.current();
    };
    const onPageHide = () => {
      ticks.flushNow();
      sendClearNow();
    };
    /* Another tab changed the held ticks (38d): show them here too. */
    const onStorage = (event: StorageEvent) => {
      if (event.key === HELD_STORAGE_KEY || event.key === null) {
        ticks.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("storage", onStorage);
      ticks.detach();
      sendClearNow();
    };
  }, [ticks, patchUrl]);

  /** Run a server action that answers with the list's items or settings. */
  const run = useCallback(
    async <T>(
      call: () => Promise<ShoppingActionResult<T>>,
      apply: (result: T) => void,
    ): Promise<T | undefined> => {
      setWorking(true);
      try {
        const result = await call();
        if (isActionError(result)) {
          setActionError(
            result.code === "busy"
              ? "Another change is being saved — try again in a moment."
              : result.error,
          );
          return undefined;
        }
        setActionError(undefined);
        writes.bump();
        apply(result);
        return result;
      } catch {
        setActionError(UNREACHABLE);
        return undefined;
      } finally {
        setWorking(false);
      }
    },
    [writes],
  );

  const items = useMemo(() => {
    const ticked = applyPending(state.items, sync.pending);
    if (!clearing) return ticked;
    const hidden = new Set(clearing);
    return ticked.filter((item) => !hidden.has(item.id));
  }, [state.items, sync.pending, clearing]);

  const setItems = (result: { items: ShoppingItem[] }) =>
    setState((current) => ({ ...current, items: result.items }));

  /** Remove exactly these ids, one change; ticks waiting for them go too. */
  const removeIds = async (ids: string[]) => {
    const result = await run(() => actions.update({ remove: ids }), setItems);
    if (result) ticks.forget(ids);
    return result;
  };

  return {
    items,
    settings: state.settings,
    inventory: state.inventory,
    plans: state.plans ?? NO_PLANS,
    pendingCount: sync.pending.size,
    status: sync.status,
    error:
      actionError ?? (sync.error !== dismissedSync ? sync.error : undefined),
    working,
    /** Item id → the tick not yet saved (held, or waiting to be sent). */
    pending: sync.pending,
    /** Ticks wait for "Done shopping" (the `holdTicks` switch, 38d). */
    holding: hold,
    /** 39-D3: ids whose held ticks were dropped as over a week old. */
    expiredTicks: sync.expired ?? NONE,
    dismissExpired: () => ticks.dismissExpired(),
    tick: (ids: readonly string[], checked: boolean) =>
      ticks.tick(ids, checked),
    flush: () => ticks.flush(),
    /** "Done shopping": every held tick, saved as one change. */
    done: async () => {
      setDismissedSync(undefined);
      return (await ticks.done()).ok;
    },
    reload,
    dismissError: () => {
      setActionError(undefined);
      setDismissedSync(sync.error);
    },
    add: (input: unknown) => run(() => actions.add(input), setItems),
    update: (patch: unknown) => run(() => actions.update(patch), setItems),
    /**
     * Clear exactly the ids the person saw ticked (pending ticks included) —
     * not "whatever the server has ticked", which could take an item just
     * unticked here, or one ticked on another device unseen.
     */
    clearChecked: removeIds,
    /**
     * 42g, Done shopping in the store (42-Dg4): hide these ticked lines at
     * once and remove them after `CLEAR_UNDO_MS` unless `undoClear` comes
     * first. One clear at a time: a second sends the first now.
     */
    clearing,
    startClear: (ids: string[], onCleared?: () => void) => {
      const earlier = clearingRef.current;
      clearTimeout(clearTimer.current);
      if (earlier) void removeIds(earlier);
      clearingRef.current = ids;
      setClearing(ids);
      clearTimer.current = setTimeout(() => {
        if (clearingRef.current !== ids) return;
        clearingRef.current = undefined;
        void removeIds(ids).then((result) => {
          setClearing((current) => (current === ids ? undefined : current));
          if (result) onCleared?.();
        });
      }, CLEAR_UNDO_MS);
    },
    undoClear: () => {
      clearTimeout(clearTimer.current);
      clearingRef.current = undefined;
      setClearing(undefined);
    },
    /**
     * 39c: undo a sub-recipe's expansion — every line whose `for` names it,
     * one change. Ticks waiting for those lines go with them.
     */
    removeSubRecipe: async (slug: string, ids: string[]) => {
      const result = await run(
        () => actions.update({ removeSource: { for: slug } }),
        setItems,
      );
      if (result) ticks.forget([...ids, ...(result.removed ?? [])]);
      return result;
    },
    /**
     * 42g: take a plan's, a recipe's or the typed lines off — one change,
     * `removeSource` or ids as `removalPatch` chose.
     */
    removeOrigin: async (patch: unknown, ids: string[]) => {
      const result = await run(() => actions.update(patch), setItems);
      if (result) ticks.forget([...ids, ...(result.removed ?? [])]);
      return result;
    },
    saveSettings: (patch: unknown) =>
      run(
        () => actions.saveSettings(patch),
        (result) =>
          setState((current) => ({ ...current, settings: result.settings })),
      ),
  };
}

export type ShoppingList = ReturnType<typeof useShoppingList>;
