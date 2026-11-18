"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { forgetNoteSelector } from "recipe-editor/controller/notes/noteSelectors";

/**
 * Forget a site's learned notes selector (47j): the next import from that
 * site reads a card plugin's notes, or learns a new selector.
 */
export async function forgetNoteSelectorAction(
  formData: FormData,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.email) return;
  const site = formData.get("site");
  if (typeof site !== "string" || !site.trim()) return;
  await forgetNoteSelector(site.trim());
  revalidatePath("/settings/tools");
}
