"use server";

import { auth } from "@/auth";
import { readSettings, writeSettings } from "@/settings";

export type SaveMakeStaplesResult = { ok: true } | { error: string };

/** More than any kitchen assumes; a longer list is a mistake, not a pantry. */
const MAX_STAPLES = 200;
const MAX_LENGTH = 200;

/**
 * The signed-in `/make`'s "Assume I always have" list (38a), kept in the
 * editor's settings so a new browser starts from it (`useSavedStaples`).
 * `null` clears it — the browser went back to the default list. Per
 * instance, like the rest of `settings.json`; no commit, nothing for the
 * export.
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
          typeof item !== "string" || !item.trim() || item.length > MAX_LENGTH,
      ))
  ) {
    return { error: "Invalid staples list" };
  }
  try {
    const settings = await readSettings();
    await writeSettings({
      ...settings,
      makeStaples:
        items === null ? undefined : items.map((item) => item.trim()),
    });
    return { ok: true };
  } catch {
    return { error: "Failed to save staples" };
  }
}

export default saveMakeStaples;
