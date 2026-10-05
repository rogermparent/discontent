"use server";

import { auth } from "@/auth";
import { curationContextFor } from "../apiContext";
import { toErrorObject } from "../curation/errors";
import { patchInventory } from "../curation/inventory";

export type SaveInventoryResult = { items: string[] } | { error: string };

/**
 * "Save to shared list" on the signed-in `/make` (25d): this browser's
 * changes, sent as the `{add, remove}` diff they are, committed as one
 * "Update inventory: …" commit authored by whoever is signed in.
 *
 * A diff rather than the whole list, so a save from a browser that loaded the
 * page before someone else (or the agent) added Gnista doesn't take it away.
 */
export async function saveInventoryChanges(diff: {
  add: string[];
  remove: string[];
}): Promise<SaveInventoryResult> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: "Authentication required" };
  try {
    const { items } = await patchInventory(curationContextFor(email), diff);
    return { items };
  } catch (error) {
    return { error: toErrorObject(error).error.message };
  }
}

export default saveInventoryChanges;
