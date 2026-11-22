"use server";

import { auth } from "@/auth";
import { curationContextFor } from "../apiContext";
import { toErrorObject, type CurationErrorCode } from "../curation/errors";
import { readInventory } from "../curation/inventory";
import {
  addShoppingLayer,
  addToShopping,
  clearShopping,
  createShoppingList,
  editShoppingList,
  readShoppingLists,
  decideShoppingMerge,
  patchShopping,
  promoteShoppingLayer,
  readShopping,
  readShoppingPlanNames,
  removeShoppingLayer,
  removeShoppingRule,
  setShoppingLayer,
  setShoppingLeaveOff,
  setShoppingRuleOn,
  splitShoppingMerge,
  updateShoppingSettings,
  type ShoppingAddResult,
  type ShoppingClearResult,
  type ShoppingLayerResult,
  type ShoppingListRef,
  type ShoppingListResult,
  type ShoppingMergeResult,
  type ShoppingPatchResult,
  type ShoppingRuleResult,
  type ShoppingRulesResult,
  type ShoppingSettingsResult,
} from "../curation/shopping";
import type {
  ShoppingLayer,
  ShoppingRule,
} from "recipe-website-common/util/shoppingLayers";
import type { ShoppingMerge } from "recipe-website-common/util/shoppingMerges";
import type { ShoppingListSummary } from "recipe-website-common/util/shoppingLists";
import type {
  ShoppingItem,
  ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";

/**
 * The `/shopping` page's server actions (epic 35, 35d), each committed as
 * whoever is signed in. A failure answers `{error, code}` rather than
 * throwing, so the page can tell `busy` (retry shortly, D9) from the rest.
 *
 * 50d (Dd2): every action about one list takes the list first — `main`, or
 * a saved list's id — so `/shopping` binds its list once
 * (`action.bind(null, list)`) and the recipe and plan pages name the one
 * the reader picked. The rules, merges and settings are every list's.
 */
export type ShoppingActionResult<T> =
  T | { error: string; code: CurationErrorCode };

async function signedIn<T>(
  run: (email: string) => Promise<T>,
): Promise<ShoppingActionResult<T>> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { error: "Authentication required", code: "unauthenticated" };
  }
  try {
    return await run(email);
  } catch (error) {
    const { message, code } = toErrorObject(error).error;
    return { error: message, code };
  }
}

/** 50d: the signed-in editor's context, on one list. */
function on(email: string, list: unknown) {
  const ctx = curationContextFor(email);
  return typeof list === "string" && list
    ? { ...ctx, shoppingList: list }
    : ctx;
}

/** What the page builds its view from (D3: the view is computed in the browser). */
export interface ShoppingListState {
  items: ShoppingItem[];
  settings: ShoppingSettings;
  /** The shared on-hand list, for the "probably on hand" fold. */
  inventory: string[];
  /** 42g: plan slug → name, for the plans the lines came through. */
  plans?: Record<string, string>;
  /** 49a: the merge decisions; the browser finds the proposals itself. */
  merges?: ShoppingMerge[];
  /** 50a: this list's layers and the leave-off rules; the browser composes. */
  layers?: ShoppingLayer[];
  rules?: ShoppingRule[];
  /** 50d: which list this is. */
  list?: ShoppingListRef;
}

/** The list read fresh — when the page becomes visible again, say. */
export async function loadShoppingList(
  list: string,
): Promise<ShoppingActionResult<ShoppingListState>> {
  return signedIn(async (email) => {
    const ctx = on(email, list);
    const [
      { items, settings, merges, layers, rules, list: which },
      { items: inventory },
    ] = await Promise.all([readShopping(ctx), readInventory(ctx)]);
    const plans = await readShoppingPlanNames(ctx, items);
    return {
      items,
      settings,
      inventory,
      plans,
      merges,
      layers,
      rules,
      list: which,
    };
  });
}

/** `{recipe, scale?} | {group, scale?} | {items}`, onto `list`. */
export async function addToShoppingList(
  list: string,
  input: unknown,
): Promise<ShoppingActionResult<ShoppingAddResult>> {
  return signedIn((email) => addToShopping(on(email, list), input));
}

/** The page's batched ticks and row menus (D9): one PATCH, one commit. */
export async function updateShoppingList(
  list: string,
  patch: unknown,
): Promise<ShoppingActionResult<ShoppingPatchResult>> {
  return signedIn((email) => patchShopping(on(email, list), patch));
}

export async function clearShoppingList(
  list: string,
  scope: "checked" | "all" = "checked",
): Promise<ShoppingActionResult<ShoppingClearResult>> {
  return signedIn((email) => clearShopping(on(email, list), { scope }));
}

/** 50d: the lists, the main list first; `all` with the deleted ones. */
export async function loadShoppingLists(
  all = false,
): Promise<ShoppingActionResult<{ lists: ShoppingListSummary[] }>> {
  return signedIn(async (email) => ({
    lists: await readShoppingLists(curationContextFor(email), {
      all: all === true,
    }),
  }));
}

/** 50d: a new list, `{name}` or `{plan, name?}` — one commit. */
export async function createSavedShoppingList(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingListResult>> {
  return signedIn((email) =>
    createShoppingList(curationContextFor(email), input),
  );
}

/** 50d: rename a list, delete it (`archived: true`) or restore it. */
export async function editSavedShoppingList(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingListResult>> {
  return signedIn((email) =>
    editShoppingList(curationContextFor(email), input),
  );
}

export async function updateShoppingListSettings(
  patch: unknown,
): Promise<ShoppingActionResult<ShoppingSettingsResult>> {
  return signedIn((email) =>
    updateShoppingSettings(curationContextFor(email), patch),
  );
}

/** 49a: Merge, Edit then Merge, or Keep apart — one commit. */
export async function decideShoppingListMerge(
  list: string,
  input: unknown,
): Promise<ShoppingActionResult<ShoppingMergeResult>> {
  return signedIn((email) => decideShoppingMerge(on(email, list), input));
}

/** 49a: Split a merged row (delete its decision) — one commit. */
export async function splitShoppingListMerge(
  id: string,
): Promise<ShoppingActionResult<ShoppingMergeResult>> {
  return signedIn((email) =>
    splitShoppingMerge(curationContextFor(email), { id }),
  );
}

/** 50a: a change for this list (a layer of ops) — one commit. */
export async function addShoppingListLayer(
  list: string,
  input: unknown,
): Promise<ShoppingActionResult<ShoppingLayerResult>> {
  return signedIn((email) => addShoppingLayer(on(email, list), input));
}

/** 50a: turn a change off (undo) or on — one commit. */
export async function setShoppingListLayer(
  list: string,
  id: string,
  isOn: boolean,
): Promise<ShoppingActionResult<ShoppingLayerResult>> {
  return signedIn((email) =>
    setShoppingLayer(on(email, list), { id, on: isOn }),
  );
}

/** 50a: remove a change — one commit. */
export async function removeShoppingListLayer(
  list: string,
  id: string,
): Promise<ShoppingActionResult<ShoppingLayerResult>> {
  return signedIn((email) => removeShoppingLayer(on(email, list), { id }));
}

/** 50a: leave a name off every list, or Restore it — one commit. */
export async function setShoppingListLeaveOff(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingRuleResult>> {
  return signedIn((email) =>
    setShoppingLeaveOff(curationContextFor(email), input),
  );
}

/**
 * 50c: switch a rule for every list (a rule's, or a merge decision's) — one
 * commit. `list` only picks whose layers the answer carries back.
 */
export async function setShoppingListRule(
  list: string,
  input: unknown,
): Promise<ShoppingActionResult<ShoppingRulesResult>> {
  return signedIn((email) => setShoppingRuleOn(on(email, list), input));
}

/** 50c: remove a rule for every list, or an aisle by name — one commit. */
export async function removeShoppingListRule(
  list: string,
  input: unknown,
): Promise<ShoppingActionResult<ShoppingRulesResult>> {
  return signedIn((email) => removeShoppingRule(on(email, list), input));
}

/**
 * 50c: "Always do this" — a change of `list` made rules for every list, one
 * commit (the change leaves that list in the same commit).
 */
export async function promoteShoppingListLayer(
  list: string,
  id: string,
): Promise<ShoppingActionResult<ShoppingRulesResult>> {
  return signedIn((email) => promoteShoppingLayer(on(email, list), { id }));
}
