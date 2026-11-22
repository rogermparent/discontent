"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@discontent/component-library/lib/utils";
import { DEFAULT_STAPLES } from "../../util/makeable";
import { findShoppingProposals } from "../../util/shoppingConsolidate";
import { rowsHolding } from "../../util/shoppingPage";
import {
  buildShoppingView,
  formatShoppingText,
  subRecipeGroups,
  viewForStore,
} from "../../util/shoppingView";
import { PlanView } from "./PlanView";
import { ShopView } from "./ShopView";
import type { RowHandlers } from "./ShoppingRowView";
import { useShoppingMode, type ShoppingMode } from "./shopState";
import {
  useShoppingList,
  type ShoppingListState,
  type ShoppingPageActions,
} from "./useShoppingList";
import { useShoppingAsk, type ShoppingAskSurface } from "./useShoppingAsk";
import type { ShoppingTidySurface } from "./Tidy";

export type { ShoppingPageActions, ShoppingListState };
export type {
  ShoppingAskProgressProps,
  ShoppingAskSurface,
} from "./useShoppingAsk";
export type { ShoppingTidySurface } from "./Tidy";

const STORE_KEY = "shopping-store";

function readStoreChoice(): string {
  try {
    return window.localStorage.getItem(STORE_KEY) ?? "all";
  } catch {
    return "all";
  }
}

const storeListeners = new Set<() => void>();

function subscribeStoreChoice(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

function saveStoreChoice(store: string): void {
  try {
    window.localStorage.setItem(STORE_KEY, store);
  } catch {
    /* A per-viewer convenience only. */
  }
  for (const listener of storeListeners) listener();
}

/**
 * The store switch's choice, remembered per viewer: "all" on the server and
 * through hydration, then what this browser chose last.
 */
const noSubscription = () => () => {};

/**
 * False on the server and through hydration, true once React owns the page:
 * `data-ready` on the page root, which a test waits for so a click under
 * `next dev`'s slow hydration is not swallowed.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function useStoreChoice(): [string, (store: string) => void] {
  const store = useSyncExternalStore(
    subscribeStoreChoice,
    readStoreChoice,
    () => "all",
  );
  return [store, saveStoreChoice];
}

/**
 * The editor's shared shopping list (epic 35, 35d; 42g's two jobs). **Plan**
 * — at home, on a wide screen by default — is the list by store and aisle
 * beside its panels: add, what is on it by plan and recipe, sub-recipes,
 * the switches, what is probably on hand. **Shop** — in the store, on a
 * phone by default — is one store's list with an aisle rail, ticks struck
 * through in place until an aisle is done, and Done shopping in thumb
 * reach. Both are `buildShoppingView` over the server's items with this
 * page's pending ticks applied (D3, D9), regrouped for the page only
 * (42-D5).
 */
export function ShoppingPage({
  initial,
  actions,
  patchUrl,
  ask,
  tidy,
}: {
  initial: ShoppingListState;
  actions: ShoppingPageActions;
  /** Where batched ticks go: `/api/shopping` (a fetch can be `keepalive`). */
  patchUrl: string;
  /**
   * 49b: the model, where the editor has one — a note on a proposal or a
   * merged row, and "Look for more with the model". Absent: neither shows.
   */
  ask?: ShoppingAskSurface;
  /** 50b: "Tidy with the model" (Plan), where the editor has a model. */
  tidy?: ShoppingTidySurface;
}) {
  const list = useShoppingList({ initial, actions, patchUrl });
  const asker = useShoppingAsk(list.canMerge ? ask : undefined);
  const [store, setStore] = useStoreChoice();
  const [mode, saveMode] = useShoppingMode();
  const hydrated = useHydrated();
  /*
   * Switching mode swaps the whole layout, the switch with it: focus goes to
   * the new layout's pressed button rather than to the page's start.
   */
  const modeSwitched = useRef(false);
  const setMode = useCallback(
    (next: ShoppingMode) => {
      modeSwitched.current = true;
      saveMode(next);
    },
    [saveMode],
  );
  useEffect(() => {
    if (!modeSwitched.current) return;
    modeSwitched.current = false;
    document
      .querySelector<HTMLElement>(
        '[data-testid="shopping-mode"] [aria-pressed="true"]',
      )
      ?.focus();
  }, [mode]);

  /*
   * 50a: the list composed — merges, the leave-off rules and this list's
   * layers over the base rows — or, with "As written" on (Plan only), the
   * base rows alone. Shop always shows the composed list.
   */
  const [asWrittenChosen, setAsWritten] = useState(false);
  const asWritten = asWrittenChosen && mode === "plan";
  const fullView = useMemo(
    () =>
      asWritten
        ? buildShoppingView(
            list.items,
            list.settings,
            list.inventory,
            DEFAULT_STAPLES,
          )
        : buildShoppingView(
            list.items,
            list.settings,
            list.inventory,
            DEFAULT_STAPLES,
            list.merges,
            { layers: list.layers, rules: list.rules },
          ),
    [
      asWritten,
      list.items,
      list.settings,
      list.inventory,
      list.merges,
      list.layers,
      list.rules,
    ],
  );
  /* 49a: the open "same thing, different names" proposals (Da8). */
  const proposals = useMemo(
    () =>
      list.canMerge
        ? findShoppingProposals(list.items, list.settings, list.merges)
        : [],
    [list.canMerge, list.items, list.settings, list.merges],
  );
  const storesOn = list.settings.features.stores;
  const known = fullView.stores.some((each) => each.store?.id === store);
  const chosen = storesOn && known ? store : "all";
  const view = useMemo(
    () => (chosen !== "all" ? viewForStore(fullView, chosen) : fullView),
    [fullView, chosen],
  );
  const text = useMemo(() => formatShoppingText(view), [view]);
  /* Rows with a tick not yet saved (38d: the "Done shopping" count). */
  const held = useMemo(
    () => rowsHolding(fullView, list.pending),
    [fullView, list.pending],
  );
  /* 39-D3: lines whose held tick expired; none when they have left the list. */
  const expired = useMemo(
    () => rowsHolding(fullView, new Set(list.expiredTicks)),
    [fullView, list.expiredTicks],
  );
  /* 39c: the sub-recipes on the list, each with what "Remove these" takes. */
  const subRecipes = useMemo(() => subRecipeGroups(list.items), [list.items]);

  /*
   * 49a: Split re-keys the row (one `merge:` row becomes its names' rows),
   * so the button that was pressed is gone. Say what happened, and put focus
   * on the first of the rows it became.
   */
  const [splitNote, setSplitNote] = useState("");
  const split = async (id: string) => {
    const decision = list.merges.find((merge) => merge.id === id);
    const result = await list.splitMerge(id);
    if (!result || !decision) return;
    setSplitNote(
      `Split back into its own lines: ${decision.name ?? decision.keys.join(", ")}.`,
    );
    requestAnimationFrame(() => {
      for (const key of decision.keys) {
        const box = document.querySelector<HTMLInputElement>(
          `[data-testid="shopping-row"][data-key="${CSS.escape(`name:${key}`)}"] input[type="checkbox"]`,
        );
        if (box) {
          box.focus();
          return;
        }
      }
    });
  };

  const handlers: RowHandlers = {
    tick: list.tick,
    update: (patch) => void list.update(patch),
    saveSettings: (patch) => void list.saveSettings(patch),
    ...(list.canMerge ? { split: (id: string) => void split(id) } : {}),
    /* 49b: a merged row's "Ask the model about this", at home (Plan). */
    ...(asker.available && mode === "plan"
      ? { askAbout: (id: string) => asker.askAbout(id) }
      : {}),
  };

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4",
        mode === "plan" ? "max-w-6xl" : "max-w-2xl",
      )}
      data-testid="shopping-page"
      data-mode={mode}
      data-ready={hydrated ? "true" : undefined}
    >
      <p role="status" className="sr-only" data-testid="shopping-split-status">
        {splitNote}
      </p>
      {mode === "plan" ? (
        <PlanView
          list={list}
          fullView={fullView}
          view={view}
          text={text}
          held={held}
          expired={expired}
          subRecipes={subRecipes}
          proposals={proposals}
          asker={asker}
          {...(tidy ? { tidy } : {})}
          handlers={handlers}
          asWritten={asWritten}
          setAsWritten={setAsWritten}
          store={chosen}
          setStore={setStore}
          storesOn={storesOn}
          mode={mode}
          setMode={setMode}
        />
      ) : (
        <ShopView
          list={list}
          fullView={fullView}
          view={view}
          held={held}
          expired={expired}
          proposals={proposals.length}
          handlers={handlers}
          store={chosen}
          setStore={setStore}
          storesOn={storesOn}
          mode={mode}
          setMode={setMode}
        />
      )}
    </div>
  );
}

export default ShoppingPage;
