"use server";

import { RecipeActionState, reduceRecipeImport } from "./common";

export async function importRecipeAction(
  _previousState: RecipeActionState | null,
  formData: FormData,
): Promise<RecipeActionState> {
  const url = formData.get("import");
  /* The "Extract with AI" box (36b): checked is `force`, else `auto`. */
  const mode = formData.get("llm") === "force" ? "force" : "auto";
  return await reduceRecipeImport(
    _previousState,
    typeof url === "string" ? url : null,
    mode,
  );
}
