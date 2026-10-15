"use server";

import { runSpec } from "recipe-editor/controller/jobs/kinds";
import type { RecipeActionState } from "./common";

/**
 * The form's import, as a job (epic 37): the same reducers as before
 * (`controller/formImport.ts`), with a step log, and the state carries its
 * `job` id. Still synchronous — 37c makes it enqueue and poll.
 */
export async function importRecipeAction(
  _previousState: RecipeActionState | null,
  formData: FormData,
): Promise<RecipeActionState> {
  /* Pasted text (36c; since 36d the "No link? Paste the recipe text
   * instead" fallback): the local model reads the text. */
  if (formData.get("importMode") === "text") {
    const text = formData.get("importText");
    const source = formData.get("importSource");
    if (typeof text !== "string" || !text.trim()) {
      return { message: "No text provided" };
    }
    return await runSpec({
      kind: "form-text",
      text,
      ...(typeof source === "string" && source ? { source } : {}),
    });
  }
  const url = formData.get("import");
  /* The "Re-read with AI even if the page has recipe data" box (36b,
   * reworded in 36d; not shown for a video): checked is `force`, else
   * `auto`. */
  const mode = formData.get("llm") === "force" ? "force" : "auto";
  if (typeof url !== "string" || !url) {
    return { message: "No URL provided" };
  }
  return await runSpec({ kind: "form-url", url, llm: mode });
}
