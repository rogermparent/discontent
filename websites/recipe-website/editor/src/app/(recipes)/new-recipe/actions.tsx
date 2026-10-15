"use server";

import {
  RecipeActionState,
  reduceRecipeImport,
  reduceTextImport,
} from "./common";

export async function importRecipeAction(
  _previousState: RecipeActionState | null,
  formData: FormData,
): Promise<RecipeActionState> {
  /* Pasted text (36c; since 36d the "No link? Paste the recipe text
   * instead" fallback): the local model reads the text. */
  if (formData.get("importMode") === "text") {
    const text = formData.get("importText");
    const source = formData.get("importSource");
    return await reduceTextImport(
      _previousState,
      typeof text === "string" ? text : null,
      typeof source === "string" ? source : null,
    );
  }
  const url = formData.get("import");
  /* The "Re-read with AI even if the page has recipe data" box (36b,
   * reworded in 36d; not shown for a video): checked is `force`, else
   * `auto`. */
  const mode = formData.get("llm") === "force" ? "force" : "auto";
  return await reduceRecipeImport(
    _previousState,
    typeof url === "string" ? url : null,
    mode,
  );
}
