"use server";

import { auth } from "@/auth";
import { curationContextFor } from "../apiContext";
import { toErrorObject, type CurationErrorCode } from "../curation/errors";
import { readInventory } from "../curation/inventory";
import {
  addShoppingLayer,
  addToShopping,
  clearShopping,
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
import type {
  ShoppingItem,
  ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";

/**
 * The `/shopping` page's server actions (epic 35, 35d), each committed as
 * whoever is signed in. A failure answers `{error, code}` rather than
 * throwing, so the page can tell `busy` (retry shortly, D9) from the rest.
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
}

/** The list read fresh — when the page becomes visible again, say. */
export async function loadShoppingList(): Promise<
  ShoppingActionResult<ShoppingListState>
> {
  return signedIn(async (email) => {
    const ctx = curationContextFor(email);
    const [{ items, settings, merges, layers, rules }, { items: inventory }] =
      await Promise.all([readShopping(ctx), readInventory(ctx)]);
    const plans = await readShoppingPlanNames(ctx, items);
    return { items, settings, inventory, plans, merges, layers, rules };
  });
}

/** `{recipe, scale?} | {group, scale?} | {items}`. */
export async function addToShoppingList(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingAddResult>> {
  return signedIn((email) => addToShopping(curationContextFor(email), input));
}

/** The page's batched ticks and row menus (D9): one PATCH, one commit. */
export async function updateShoppingList(
  patch: unknown,
): Promise<ShoppingActionResult<ShoppingPatchResult>> {
  return signedIn((email) => patchShopping(curationContextFor(email), patch));
}

export async function clearShoppingList(
  scope: "checked" | "all" = "checked",
): Promise<ShoppingActionResult<ShoppingClearResult>> {
  return signedIn((email) =>
    clearShopping(curationContextFor(email), { scope }),
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
  input: unknown,
): Promise<ShoppingActionResult<ShoppingMergeResult>> {
  return signedIn((email) =>
    decideShoppingMerge(curationContextFor(email), input),
  );
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
  input: unknown,
): Promise<ShoppingActionResult<ShoppingLayerResult>> {
  return signedIn((email) =>
    addShoppingLayer(curationContextFor(email), input),
  );
}

/** 50a: turn a change off (undo) or on — one commit. */
export async function setShoppingListLayer(
  id: string,
  on: boolean,
): Promise<ShoppingActionResult<ShoppingLayerResult>> {
  return signedIn((email) =>
    setShoppingLayer(curationContextFor(email), { id, on }),
  );
}

/** 50a: remove a change — one commit. */
export async function removeShoppingListLayer(
  id: string,
): Promise<ShoppingActionResult<ShoppingLayerResult>> {
  return signedIn((email) =>
    removeShoppingLayer(curationContextFor(email), { id }),
  );
}

/** 50a: leave a name off every list, or Restore it — one commit. */
export async function setShoppingListLeaveOff(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingRuleResult>> {
  return signedIn((email) =>
    setShoppingLeaveOff(curationContextFor(email), input),
  );
}

/** 50c: switch a rule for every list (a rule's, or a merge decision's) — one commit. */
export async function setShoppingListRule(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingRulesResult>> {
  return signedIn((email) =>
    setShoppingRuleOn(curationContextFor(email), input),
  );
}

/** 50c: remove a rule for every list, or an aisle by name — one commit. */
export async function removeShoppingListRule(
  input: unknown,
): Promise<ShoppingActionResult<ShoppingRulesResult>> {
  return signedIn((email) =>
    removeShoppingRule(curationContextFor(email), input),
  );
}

/** 50c: "Always do this" — a change made rules for every list, one commit. */
export async function promoteShoppingListLayer(
  id: string,
): Promise<ShoppingActionResult<ShoppingRulesResult>> {
  return signedIn((email) =>
    promoteShoppingLayer(curationContextFor(email), { id }),
  );
}
