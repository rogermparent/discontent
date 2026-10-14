"use server";

import { auth } from "@/auth";
import { curationContextFor } from "../apiContext";
import { toErrorObject, type CurationErrorCode } from "../curation/errors";
import { readInventory } from "../curation/inventory";
import {
  addToShopping,
  clearShopping,
  patchShopping,
  readShopping,
  updateShoppingSettings,
  type ShoppingAddResult,
  type ShoppingClearResult,
  type ShoppingPatchResult,
  type ShoppingSettingsResult,
} from "../curation/shopping";
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
  | T
  | { error: string; code: CurationErrorCode };

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
}

/** The list read fresh — when the page becomes visible again, say. */
export async function loadShoppingList(): Promise<
  ShoppingActionResult<ShoppingListState>
> {
  return signedIn(async (email) => {
    const ctx = curationContextFor(email);
    const [{ items, settings }, { items: inventory }] = await Promise.all([
      readShopping(ctx),
      readInventory(ctx),
    ]);
    return { items, settings, inventory };
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
