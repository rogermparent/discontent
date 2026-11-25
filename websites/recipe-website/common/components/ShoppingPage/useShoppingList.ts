"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyPending } from "../../util/shoppingTickQueue";
import {
  TickSync,
  type SyncStatus,
  type TickSyncSnapshot,
  type TickSyncStorage,
} from "../../util/shoppingTickSync";
import type { ShoppingMerge } from "../../util/shoppingMerges";
import type { ShoppingLayer, ShoppingRule } from "../../util/shoppingLayers";
import type { ShoppingItem, ShoppingSettings } from "../../util/shoppingTypes";
import { MAIN_SHOPPING_LIST, listStorageKey } from "../../util/shoppingLists";

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
  /** 49a: the stored merge decisions (the page finds the proposals). */
  merges?: ShoppingMerge[];
  /** 50a: this list's layers and the leave-off rules (the page composes). */
  layers?: ShoppingLayer[];
  rules?: ShoppingRule[];
  /** 50d: which list this is (the main list without one). */
  list?: {
    id: string;
    name: string;
    main?: true;
    plan?: string;
    archived?: true;
  };
}

/** 50a: what a layer write answers. */
export interface ShoppingLayerAnswer {
  layers: ShoppingLayer[];
  changed: boolean;
}

/** 50a: what a leave-off rule write answers. */
export interface ShoppingRuleAnswer {
  rules: ShoppingRule[];
  changed: boolean;
}

/** 49a: what a merge write answers. */
export interface ShoppingMergeAnswer {
  merges: ShoppingMerge[];
  changed: boolean;
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
      /** 50a: layers deleted with their last items. */
      removedLayers?: string[];
    }>
  >;
  saveSettings(
    patch: unknown,
  ): Promise<ShoppingActionResult<{ settings: ShoppingSettings }>>;
  /**
   * 49a: Merge or Keep apart a proposal (`{id, status, name?, amount?}`).
   * Without it the page shows no proposals.
   */
  decideMerge?(
    input: unknown,
  ): Promise<ShoppingActionResult<ShoppingMergeAnswer>>;
  /** 49a: Split a merged row: delete its decision. */
  splitMerge?(id: string): Promise<ShoppingActionResult<ShoppingMergeAnswer>>;
  /**
   * 50a: this list's changes — add one, turn one off (undo) or on, remove
   * one. Without them the page shows no Changes panel.
   */
  addLayer?(input: unknown): Promise<ShoppingActionResult<ShoppingLayerAnswer>>;
  setLayer?(
    id: string,
    on: boolean,
  ): Promise<ShoppingActionResult<ShoppingLayerAnswer>>;
  removeLayer?(id: string): Promise<ShoppingActionResult<ShoppingLayerAnswer>>;
  /** 50a: leave a name off every list, or Restore it. */
  leaveOff?(input: unknown): Promise<ShoppingActionResult<ShoppingRuleAnswer>>;
  /**
   * 50c: Changes' Rules tier — switch a rule (`{kind, id, on}`), remove one
   * (`{kind: "rule", id} | {kind: "aisle", key}`), and "Always do this" on
   * one of this list's changes. Without them the tier lists, read only.
   */
  setRule?(input: unknown): Promise<ShoppingActionResult<ShoppingRulesAnswer>>;
  removeRule?(
    input: unknown,
  ): Promise<ShoppingActionResult<ShoppingRulesAnswer>>;
  promoteLayer?(id: string): Promise<ShoppingActionResult<ShoppingRulesAnswer>>;
}

/** 50c: what a rules-tier write answers: everything a rule can touch. */
export interface ShoppingRulesAnswer {
  rules: ShoppingRule[];
  merges: ShoppingMerge[];
  settings: ShoppingSettings;
  layers: ShoppingLayer[];
  changed: boolean;
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

/*
 * 50d (Dd3): each list's ticks under its own keys — the main list's are the
 * keys they always were, so an update loses no tick held for Done shopping.
 */
function sessionTicksFor(list: string): TickSyncStorage {
  return browserTicks(
    () => window.sessionStorage,
    listStorageKey(STORAGE_KEY, list),
  );
}

function heldTicksFor(list: string): TickSyncStorage {
  return browserTicks(
    () => window.localStorage,
    listStorageKey(HELD_STORAGE_KEY, list),
  );
}

const NONE: string[] = [];
const NO_PLANS: Record<string, string> = {};
const NO_MERGES: ShoppingMerge[] = [];
const NO_LAYERS: ShoppingLayer[] = [];
const NO_RULES: ShoppingRule[] = [];

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
  /* 50d: the list never changes under a mounted page (the page keys it). */
  const [listId] = useState(() => initial.list?.id ?? MAIN_SHOPPING_LIST);
  const heldKey = listStorageKey(HELD_STORAGE_KEY, listId);
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
  const [clearing, setClearing] = useState<
    { ids: string[]; sent: boolean } | undefined
  >();
  /* The ids still inside their Undo window (none once sent). */
  const clearingRef = useRef<string[] | undefined>(undefined);
  /* What to do once that clear has landed (forget the done aisles). */
  const clearedRef = useRef<(() => void) | undefined>(undefined);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [ticks] = useState(
    () =>
      new TickSync({
        patchUrl,
        fetch: (input, init) => fetch(input, init),
        storage: sessionTicksFor(listId),
        heldStorage: heldTicksFor(listId),
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
      const cleared = clearedRef.current;
      clearedRef.current = undefined;
      /* Off the page now; the next read confirms it. */
      const gone = new Set(ids);
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => !gone.has(item.id)),
      }));
      setClearing(undefined);
      ticks.forget(ids);
      /* Sent for good: the trip is over here too (42-Dg2). */
      cleared?.();
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
      if (event.key === heldKey || event.key === null) {
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
  }, [ticks, patchUrl, heldKey]);

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
    const hidden = new Set(clearing.ids);
    return ticked.filter((item) => !hidden.has(item.id));
  }, [state.items, sync.pending, clearing]);

  /* 50a: a removal that took a layer's last items took the layer too. */
  const setItems = (result: {
    items: ShoppingItem[];
    removedLayers?: string[];
  }) =>
    setState((current) => {
      const gone = new Set(result.removedLayers ?? []);
      return {
        ...current,
        items: result.items,
        ...(gone.size > 0 && current.layers
          ? {
              layers: current.layers.filter((layer) => !gone.has(layer.id)),
            }
          : {}),
      };
    });
  const unavailable = () =>
    Promise.resolve({ error: "Not available here", code: "usage" });
  const setLayers = (answer: ShoppingLayerAnswer) =>
    setState((current) => ({ ...current, layers: answer.layers }));
  const setRules = (answer: ShoppingRulesAnswer) =>
    setState((current) => ({
      ...current,
      rules: answer.rules,
      merges: answer.merges,
      settings: answer.settings,
      layers: answer.layers,
    }));

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
    /** 50d: the list this page is. */
    list: state.list,
    /** 50c: the list's id (`main` for the main list) — what card state is keyed by. */
    listId,
    /** 49a: the stored merge decisions. */
    merges: state.merges ?? NO_MERGES,
    /** 49a: this page can answer proposals (the editor passed the actions). */
    canMerge: Boolean(actions.decideMerge && actions.splitMerge),
    /** 50a: this list's layers and the leave-off rules. */
    layers: state.layers ?? NO_LAYERS,
    rules: state.rules ?? NO_RULES,
    /** 50a: this page can change its layers (the editor passed the actions). */
    canLayer: Boolean(
      actions.addLayer &&
      actions.setLayer &&
      actions.removeLayer &&
      actions.leaveOff,
    ),
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
     * first. Once the window closes the removal is `sent` and can no longer
     * be undone; the lines stay hidden until it lands (or come back, with
     * the error, if it fails). Done shopping is disabled meanwhile, so
     * there is one clear at a time.
     */
    clearing: clearing?.ids,
    /** The clear's Undo window has closed: it is being written. */
    clearSent: clearing?.sent ?? false,
    startClear: (ids: string[], onCleared?: () => void) => {
      clearTimeout(clearTimer.current);
      clearingRef.current = ids;
      clearedRef.current = onCleared;
      const entry = { ids, sent: false };
      setClearing(entry);
      clearTimer.current = setTimeout(() => {
        if (clearingRef.current !== ids) return;
        clearingRef.current = undefined;
        const cleared = clearedRef.current;
        clearedRef.current = undefined;
        const sent = { ids, sent: true };
        setClearing(sent);
        void removeIds(ids).then((result) => {
          setClearing((current) => (current === sent ? undefined : current));
          if (result) cleared?.();
        });
      }, CLEAR_UNDO_MS);
    },
    undoClear: () => {
      if (!clearingRef.current) return;
      clearTimeout(clearTimer.current);
      clearingRef.current = undefined;
      clearedRef.current = undefined;
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
    /**
     * 49a: Merge (with an edited name or amount) or Keep apart, one change.
     * A refusal (another device changed the list, say) reads the list
     * again, so a proposal that is gone leaves the page too.
     */
    decideMerge: async (
      input: (
        { id: string; keys?: undefined } | { keys: string[]; id?: undefined }
      ) & {
        status: "merged" | "apart";
        name?: string;
        amount?: string;
        /** 49b: the person's note, stored with the decision. */
        note?: string;
        /** 49b: the merged decision a model's accepted answer replaces. */
        replaces?: string;
      },
    ) => {
      const result = await run(
        () =>
          actions.decideMerge
            ? actions.decideMerge(input)
            : Promise.resolve({ error: "Not available here", code: "usage" }),
        (answer) =>
          setState((current) => ({ ...current, merges: answer.merges })),
      );
      if (!result) void reload();
      return result;
    },
    /** 50a: add a change to this list, one commit. */
    addLayer: (input: unknown) =>
      run(
        () => (actions.addLayer ? actions.addLayer(input) : unavailable()),
        setLayers,
      ),
    /** 50a: turn a change off (undo) or on, one commit. */
    setLayer: (id: string, on: boolean) =>
      run(
        () => (actions.setLayer ? actions.setLayer(id, on) : unavailable()),
        setLayers,
      ),
    /** 50a: remove a change, one commit. */
    removeLayer: (id: string) =>
      run(
        () => (actions.removeLayer ? actions.removeLayer(id) : unavailable()),
        setLayers,
      ),
    /** 50a: leave a name off every list, or Restore it, one commit. */
    leaveOff: (
      input: ({ name: string } | { key: string }) & {
        leaveOff: boolean;
        reason?: string;
      },
    ) =>
      run(
        () => (actions.leaveOff ? actions.leaveOff(input) : unavailable()),
        (answer) =>
          setState((current) => ({ ...current, rules: answer.rules })),
      ),
    /** 50c: the Rules tier can write (the editor passed the actions). */
    canRule: Boolean(
      actions.setRule && actions.removeRule && actions.promoteLayer,
    ),
    /** 50c: switch a rule for every list off or on, one commit. */
    setRule: (input: { kind: "rule" | "merge"; id: string; on: boolean }) =>
      run(
        () => (actions.setRule ? actions.setRule(input) : unavailable()),
        setRules,
      ),
    /** 50c: remove a rule for every list (or an aisle by name), one commit. */
    removeRule: (
      input: { kind: "rule"; id: string } | { kind: "aisle"; key: string },
    ) =>
      run(
        () => (actions.removeRule ? actions.removeRule(input) : unavailable()),
        setRules,
      ),
    /** 50c: "Always do this": a change of this list made rules, one commit. */
    promoteLayer: (id: string) =>
      run(
        () => (actions.promoteLayer ? actions.promoteLayer(id) : unavailable()),
        setRules,
      ),
    /** 49a: Split a merged row back into its names, one change. */
    splitMerge: (id: string) =>
      run(
        () =>
          actions.splitMerge
            ? actions.splitMerge(id)
            : Promise.resolve({ error: "Not available here", code: "usage" }),
        (result) =>
          setState((current) => ({ ...current, merges: result.merges })),
      ),
  };
}

export type ShoppingList = ReturnType<typeof useShoppingList>;
