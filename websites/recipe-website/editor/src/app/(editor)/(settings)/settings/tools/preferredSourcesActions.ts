"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { writePreferredSources } from "recipe-editor/controller/agent/preferredSources";

export interface PreferredSourcesResult {
  ok: boolean;
  message: string;
  /** What was saved, on success. */
  sources?: string[];
}

/**
 * Save the preferred recipe sites (51g, b03): the checked list replaces the
 * saved one. A failed check answers its message and writes nothing.
 */
export async function savePreferredSourcesAction(
  sources: string[],
): Promise<PreferredSourcesResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, message: "Authentication required" };
  }
  try {
    const saved = await writePreferredSources(sources);
    revalidatePath("/settings/tools");
    return {
      ok: true,
      sources: saved,
      message: saved.length
        ? `Saved: ${saved.length} preferred ${saved.length === 1 ? "site" : "sites"}.`
        : "Saved: no preferred sites, the open web only.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save.",
    };
  }
}
