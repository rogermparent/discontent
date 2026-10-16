"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { updateSettings } from "@/settings";
import {
  MAX_STAPLE_LENGTH,
  MAX_STAPLES,
} from "recipe-website-common/components/MakePage/stapleLimits";

export type SaveMakeStaplesResult = { ok: true } | { error: string };

/**
 * The signed-in `/make`'s "Assume I always have" list (38a), kept in the
 * editor's settings so a new browser starts from it (`useSavedStaples`).
 * `null` clears it — the browser went back to the default list. Per
 * instance, like the rest of `settings.json`; no commit, nothing for the
 * export. The read-modify-write holds the settings lock (`updateSettings`),
 * so a concurrent writer's keys survive; an unchanged list writes nothing.
 * `/make` is revalidated so a later visit isn't seeded from a stale payload
 * (a Reset undone by the old list).
 */
export async function saveMakeStaples(
  items: string[] | null,
): Promise<SaveMakeStaplesResult> {
  const session = await auth();
  if (!session?.user?.email) return { error: "Authentication required" };
  if (
    items !== null &&
    (!Array.isArray(items) ||
      items.length > MAX_STAPLES ||
      items.some(
        (item) =>
          typeof item !== "string" ||
          !item.trim() ||
          item.length > MAX_STAPLE_LENGTH,
      ))
  ) {
    return { error: "Invalid staples list" };
  }
  const makeStaples =
    items === null ? undefined : items.map((item) => item.trim());
  try {
    await updateSettings((settings) =>
      sameList(settings.makeStaples, makeStaples)
        ? undefined
        : { ...settings, makeStaples },
    );
    revalidatePath("/make");
    return { ok: true };
  } catch {
    return { error: "Failed to save staples" };
  }
}

function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export default saveMakeStaples;
