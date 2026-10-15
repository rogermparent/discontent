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
  /* The "Paste text" tab (36c): the local model reads the text. */
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
  /* The "Extract with AI" box (36b): checked is `force`, else `auto`. */
  const mode = formData.get("llm") === "force" ? "force" : "auto";
  return await reduceRecipeImport(
    _previousState,
    typeof url === "string" ? url : null,
    mode,
  );
}
