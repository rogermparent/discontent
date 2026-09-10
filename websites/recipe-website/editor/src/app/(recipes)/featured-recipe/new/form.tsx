"use client";

import CreateFeaturedRecipeFields from "recipe-website-common/components/Form/FeaturedRecipe/Create";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { FeaturedRecipeFormState } from "recipe-website-common/controller/featuredRecipeFormState";
import { createFeaturedRecipe } from "recipe-editor/controller/actions/featuredRecipes";

export default function NewFeaturedRecipeForm({
  preselectedRecipe,
  preselectedGroup,
}: {
  preselectedRecipe?: string;
  /** From `?group=` — the group page's Feature button (22g). */
  preselectedGroup?: string;
}) {
  const initialState = { message: "", errors: {} } as FeaturedRecipeFormState;
  const [state, dispatch] = useActionState(createFeaturedRecipe, initialState);

  return (
    <form id="featured-recipe-form" className="m-2 w-full" action={dispatch}>
      <h2 className="font-bold text-2xl mb-2">New Featured Recipe</h2>
      <div className="flex flex-col flex-nowrap">
        <CreateFeaturedRecipeFields
          state={state}
          featuredRecipe={{
            recipe: preselectedRecipe,
            group: preselectedGroup,
          }}
        />
        <div id="missing-fields-error" aria-live="polite" aria-atomic="true">
          {state.message && (
            <p className="mt-2 text-sm text-destructive">{state.message}</p>
          )}
        </div>
        <div className="my-1">
          <SubmitButton>Submit</SubmitButton>
        </div>
      </div>
    </form>
  );
}
