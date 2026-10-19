"use client";

import UpdateRecipeFields from "recipe-website-common/components/Form/Update";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import {
  RecipeFormFrame,
  RecipeFormRail,
} from "recipe-website-common/components/Form/RecipeFormFrame";
import { useActionState, useMemo } from "react";
import { withSlugConflict } from "recipe-website-common/components/Form/sections";
import { recipeToFormValues } from "recipe-website-common/components/Form/formContext";
import { Recipe } from "recipe-website-common/controller/types";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import { StaticImageProps } from "@discontent/next-static-image/src";
import {
  updateRecipe,
  overwriteUpdateRecipe,
} from "../../../../../../controller/actions";

/**
 * `/recipe/<slug>/edit` in edit form B (43e1): the same rail and sections as
 * a new recipe, without Start from — Save and Cancel in the rail (a sticky
 * bar on a phone), with the count of fields changed since the page loaded.
 */
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
  const baseline = useMemo(
    () => recipeToFormValues(recipe, slug),
    [recipe, slug],
  );

  return (
    <RecipeFormFrame
      eyebrow={
        <>
          Editing recipe<span className="sr-only">:</span>
        </>
      }
      title={recipe.name}
    >
      <RecipeFormShell
        key={state.formData ? state.message : undefined}
        action={dispatch}
        recipe={effectiveRecipe}
        slug={effectiveSlug}
        className="flex w-full flex-col gap-7"
      >
        <UpdateRecipeFields
          recipe={effectiveRecipe}
          slug={effectiveSlug}
          state={withSlugConflict(state)}
          defaultImage={defaultImage}
          allTags={allTags}
        />
        {/* Last: on a phone its save bar ends the form, sticky above the tab bar. */}
        <RecipeFormRail
          mode="edit"
          eyebrow="Editing"
          picture={defaultImage ? "saved" : "none"}
          errors={withSlugConflict(state).errors}
          saveLabel="Save"
          cancelHref={`/recipe/${slug}`}
          message={state.message || undefined}
          overwrite={state.slugConflict ? overwriteDispatch : undefined}
          baseline={baseline}
        />
      </RecipeFormShell>
    </RecipeFormFrame>
  );
}
