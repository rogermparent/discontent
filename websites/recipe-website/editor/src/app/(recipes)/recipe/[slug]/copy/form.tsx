"use client";

import UpdateRecipeFields from "recipe-website-common/components/Form/Update";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Recipe } from "recipe-website-common/controller/types";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import { createRecipe } from "recipe-editor/controller/actions";
import type { TagPickerData } from "recipe-website-common/components/Form/Tags/tagPicker";

export default function CopyRecipeForm({
  recipe,
  allTags = [],
  tagPicker,
}: {
  recipe: Recipe;
  allTags?: string[];
  tagPicker?: TagPickerData;
}) {
  const initialState = { message: "", errors: {} } as RecipeFormState;
  const [state, dispatch] = useActionState(createRecipe, initialState);
  const { name: _name, date: _date, ...cleanedRecipe } = recipe;
  return (
    <RecipeFormShell
      action={dispatch}
      recipe={cleanedRecipe}
      tagPicker={tagPicker}
      className="w-full h-full flex flex-col grow"
    >
      <UpdateRecipeFields
        recipe={cleanedRecipe}
        state={state}
        allTags={allTags}
      />
      <div id="missing-fields-error" aria-live="polite" aria-atomic="true">
        {state.message && (
          <p className="mt-2 text-sm text-destructive">{state.message}</p>
        )}
      </div>
      <div className="my-1">
        <SubmitButton>Submit</SubmitButton>
      </div>
    </RecipeFormShell>
  );
}
