"use client";

import UpdateRecipeFields from "recipe-website-common/components/Form/Update";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { Recipe } from "recipe-website-common/controller/types";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import { StaticImageProps } from "@discontent/next-static-image/src";
import {
  updateRecipe,
  overwriteUpdateRecipe,
} from "../../../../../../controller/actions";

export default function EditRecipeForm({
  recipe,
  slug,
  defaultImage,
  allTags = [],
}: {
  slug: string;
  recipe: Recipe;
  defaultImage?: StaticImageProps | undefined;
  allTags?: string[];
}) {
  const { date } = recipe;
  const initialState = { message: "", errors: {} } as RecipeFormState;
  const updateThisRecipe = updateRecipe.bind(null, date, slug);
  const [state, dispatch] = useActionState(updateThisRecipe, initialState);
  const overwriteThisRecipe = overwriteUpdateRecipe.bind(null, date, slug);
  const [, overwriteDispatch] = useActionState(overwriteThisRecipe, null);
  const effectiveRecipe = state.formData
    ? { ...recipe, ...state.formData }
    : recipe;
  const effectiveSlug = state.formData?.slug || slug;

  return (
    <RecipeFormShell
      key={state.formData ? state.message : undefined}
      action={dispatch}
      recipe={effectiveRecipe}
      slug={effectiveSlug}
      className="w-full h-full flex flex-col grow"
    >
      <UpdateRecipeFields
        recipe={effectiveRecipe}
        slug={effectiveSlug}
        state={state}
        defaultImage={defaultImage}
        allTags={allTags}
      />
      <div id="missing-fields-error" aria-live="polite" aria-atomic="true">
        {state.message && (
          <p className="mt-2 text-sm text-destructive">{state.message}</p>
        )}
      </div>
      <div className="flex flex-row flex-nowrap my-1 gap-2">
        <SubmitButton>Submit</SubmitButton>
        {state.slugConflict && (
          <Button
            type="submit"
            variant="destructive"
            formAction={overwriteDispatch}
          >
            Overwrite
          </Button>
        )}
      </div>
    </RecipeFormShell>
  );
}
