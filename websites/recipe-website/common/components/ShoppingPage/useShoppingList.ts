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
      unmatched?: string[];
      unknown?: string[];
    }>
  >;
  saveSettings(
    patch: unknown,
  ): Promise<ShoppingActionResult<{ settings: ShoppingSettings }>>;
}

const STORAGE_KEY = "shopping-pending-ticks";

/** `sessionStorage`, where it works; nothing where it throws. */
const sessionTicks: TickSyncStorage = {
  read: () => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* A private window or blocked storage: the ticks live in memory. */
    }
  },
  clear: () => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* As above. */
    }
  },
};

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
  /* Bumped by every applied write answer; a read started before one is stale. */
  const writes = useRef(0);

  const [ticks] = useState(
    () =>
      new TickSync({
        patchUrl,
        fetch: (input, init) => fetch(input, init),
        storage: sessionTicks,
        onItems: (items) => {
          writes.current += 1;
          setState((current) => ({ ...current, items }));
        },
        onChange: setSync,
      }),
  );

  const reload = useCallback(async () => {
    const started = writes.current;
    try {
      const result = await actions.load();
      if (isActionError(result) || writes.current !== started) return;
      setState(result);
    } catch {
      /* Offline: keep showing what we have; the next visit reads again. */
    }
  }, [actions]);
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
    const onVisibility = () => {
      if (document.visibilityState === "hidden") ticks.flushNow();
      else void reloadRef.current();
    };
    const onPageHide = () => ticks.flushNow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      ticks.detach();
    };
  }, [ticks]);

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
        writes.current += 1;
        apply(result);
        return result;
      } catch {
        setActionError(UNREACHABLE);
        return undefined;
      } finally {
        setWorking(false);
      }
    },
    [],
  );

  const items = useMemo(
    () => applyPending(state.items, sync.pending),
    [state.items, sync.pending],
  );

  const setItems = (result: { items: ShoppingItem[] }) =>
    setState((current) => ({ ...current, items: result.items }));

  return {
    items,
    settings: state.settings,
    inventory: state.inventory,
    pendingCount: sync.pending.size,
    status: sync.status,
    error:
      actionError ?? (sync.error !== dismissedSync ? sync.error : undefined),
    working,
    tick: (ids: readonly string[], checked: boolean) =>
      ticks.tick(ids, checked),
    flush: () => ticks.flush(),
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
    clearChecked: async (ids: string[]) => {
      const result = await run(() => actions.update({ remove: ids }), setItems);
      if (result) ticks.forget(ids);
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
