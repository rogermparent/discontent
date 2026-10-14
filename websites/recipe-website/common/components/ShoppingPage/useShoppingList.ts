"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPending,
  FLUSH_DELAY_MS,
  parsePending,
  queueTicks,
  retryDelay,
  serializePending,
  settle,
  toPatch,
  type PendingTicks,
} from "../../util/shoppingTickQueue";
import type { ShoppingItem, ShoppingSettings } from "../../util/shoppingTypes";

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
  clear(
    scope?: "checked" | "all",
  ): Promise<
    ShoppingActionResult<{ items: ShoppingItem[]; removed: string[] }>
  >;
  saveSettings(
    patch: unknown,
  ): Promise<ShoppingActionResult<{ settings: ShoppingSettings }>>;
}

const STORAGE_KEY = "shopping-pending-ticks";

function readStored(): Map<string, boolean> {
  try {
    return parsePending(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return new Map();
  }
}

function store(pending: PendingTicks): void {
  try {
    if (pending.size === 0) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, serializePending(pending));
  } catch {
    /* A private window or blocked storage: the ticks live in memory only. */
  }
}

export type SyncStatus = "idle" | "pending" | "saving" | "retrying" | "error";

/**
 * The list's state on the page: the server's items with this page's ticks
 * over them, ticks batched into one `PATCH /api/shopping` after
 * `FLUSH_DELAY_MS` of quiet or when the page is hidden (`keepalive`, so it
 * survives the tab going away), retried with backoff on `busy` (503) or a
 * dropped connection, and never lost: pending ticks stay — in memory and in
 * `sessionStorage` — until the server has them. The page re-reads the list
 * when it becomes visible again. Every other change (add, remove, flags,
 * settings, clear) is a server action, applied when it answers.
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
  const [pending, setPendingState] = useState<PendingTicks>(new Map());
  const pendingRef = useRef<PendingTicks>(new Map());
  const inFlight = useRef<PendingTicks | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempts = useRef(0);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const [working, setWorking] = useState(false);

  const setPending = useCallback((next: PendingTicks) => {
    pendingRef.current = next;
    setPendingState(next);
    store(next);
  }, []);

  /* Ticks a hidden tab left unsent come back after hydration. */
  useEffect(() => {
    const stored = readStored();
    if (stored.size > 0) setPending(stored);
  }, [setPending]);

  const flushRef = useRef<(keepalive?: boolean) => Promise<void>>(
    async () => {},
  );

  const schedule = useCallback((delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), delay);
  }, []);

  const flush = useCallback(
    async (keepalive = false) => {
      clearTimeout(timer.current);
      timer.current = undefined;
      if (inFlight.current || pendingRef.current.size === 0) return;
      const batch = pendingRef.current;
      inFlight.current = batch;
      setStatus("saving");
      let saved = false;
      const retry = () => {
        setStatus("retrying");
        schedule(retryDelay(attempts.current));
        attempts.current += 1;
      };
      try {
        const response = await fetch(patchUrl, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(toPatch(batch)),
          keepalive,
        });
        const body = (await response.json().catch(() => null)) as {
          items?: ShoppingItem[];
          unknown?: string[];
          error?: { message?: string };
        } | null;
        if (response.ok && body?.items) {
          attempts.current = 0;
          setError(undefined);
          setState((current) => ({ ...current, items: body.items! }));
          setPending(settle(pendingRef.current, batch, body.unknown));
          setStatus(pendingRef.current.size > 0 ? "pending" : "idle");
          saved = true;
        } else if (response.status === 503 || response.status >= 500) {
          retry();
        } else {
          /* Refused (signed out, or a bad request): say so, keep the ticks. */
          setStatus("error");
          setError(
            body?.error?.message ??
              `Could not save ticks (${response.status} ${response.statusText})`,
          );
        }
      } catch {
        /* Offline in the store: keep the ticks and try again. */
        retry();
      } finally {
        inFlight.current = null;
      }
      /* Ticked while the batch was on its way: the next one. */
      if (saved && pendingRef.current.size > 0) schedule(FLUSH_DELAY_MS);
    },
    [patchUrl, schedule, setPending],
  );
  flushRef.current = flush;

  const tick = useCallback(
    (ids: readonly string[], checked: boolean) => {
      setPending(queueTicks(pendingRef.current, ids, checked));
      setStatus("pending");
      if (attempts.current === 0) schedule(FLUSH_DELAY_MS);
    },
    [schedule, setPending],
  );

  const reload = useCallback(async () => {
    const result = await actions.load();
    if (!isActionError(result)) setState(result);
  }, [actions]);

  /* Hidden: send what is pending now. Visible again: read the list fresh. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current(true);
      else void reload();
    };
    const onPageHide = () => void flushRef.current(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearTimeout(timer.current);
    };
  }, [reload]);

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
          setError(
            result.code === "busy"
              ? "Another change is being saved — try again in a moment."
              : result.error,
          );
          return undefined;
        }
        setError(undefined);
        apply(result);
        return result;
      } finally {
        setWorking(false);
      }
    },
    [],
  );

  const items = useMemo(
    () => applyPending(state.items, pending),
    [state.items, pending],
  );

  return {
    items,
    settings: state.settings,
    inventory: state.inventory,
    pendingCount: pending.size,
    status,
    error,
    working,
    tick,
    flush,
    reload,
    dismissError: () => setError(undefined),
    add: (input: unknown) =>
      run(
        () => actions.add(input),
        (result) =>
          setState((current) => ({ ...current, items: result.items })),
      ),
    update: (patch: unknown) =>
      run(
        () => actions.update(patch),
        (result) =>
          setState((current) => ({ ...current, items: result.items })),
      ),
    clear: (scope: "checked" | "all" = "checked") =>
      run(
        /* The ticks still pending first, so "clear checked" clears them too. */
        async () => {
          await flushRef.current();
          return actions.clear(scope);
        },
        (result) =>
          setState((current) => ({ ...current, items: result.items })),
      ),
    saveSettings: (patch: unknown) =>
      run(
        () => actions.saveSettings(patch),
        (result) =>
          setState((current) => ({ ...current, settings: result.settings })),
      ),
  };
}

export type ShoppingList = ReturnType<typeof useShoppingList>;
