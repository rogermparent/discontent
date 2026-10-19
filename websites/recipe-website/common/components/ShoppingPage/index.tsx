"use client";

import { useMemo, useSyncExternalStore } from "react";
import { cn } from "@discontent/component-library/lib/utils";
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
import { useShoppingMode } from "./shopState";
import {
  useShoppingList,
  type ShoppingListState,
  type ShoppingPageActions,
} from "./useShoppingList";

export type { ShoppingPageActions, ShoppingListState };

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
}: {
  initial: ShoppingListState;
  actions: ShoppingPageActions;
  /** Where batched ticks go: `/api/shopping` (a fetch can be `keepalive`). */
  patchUrl: string;
}) {
  const list = useShoppingList({ initial, actions, patchUrl });
  const [store, setStore] = useStoreChoice();
  const [mode, setMode] = useShoppingMode();
  const hydrated = useHydrated();

  const fullView = useMemo(
    () => buildShoppingView(list.items, list.settings, list.inventory),
    [list.items, list.settings, list.inventory],
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

  const handlers: RowHandlers = {
    tick: list.tick,
    update: (patch) => void list.update(patch),
    saveSettings: (patch) => void list.saveSettings(patch),
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
      {mode === "plan" ? (
        <PlanView
          list={list}
          fullView={fullView}
          view={view}
          text={text}
          held={held}
          expired={expired}
          subRecipes={subRecipes}
          handlers={handlers}
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
