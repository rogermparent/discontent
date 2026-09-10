"use client";

import CreateRecipeFields from "recipe-website-common/components/Form/Create";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import {
  createRecipe,
  overwriteRecipe,
} from "recipe-editor/controller/actions";
import { importRecipeAction } from "./actions";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { RecipeActionState } from "./common";

export default function NewOrImportRecipeForm({
  slug,
  initialState: initialImportState,
  allTags = [],
}: {
  slug?: string;
  initialState: RecipeActionState | null;
  allTags?: string[];
}) {
  const [importState, importDispatch] = useActionState(
    importRecipeAction,
    initialImportState,
  );

  const { recipe, message, url } = importState || {};

  const initialSubmissionState = { message: "", errors: {} } as RecipeFormState;
  const [submissionState, submissionDispatch] = useActionState(
    createRecipe,
    initialSubmissionState,
  );
  const [, overwriteDispatch] = useActionState(overwriteRecipe, null);

  return (
    <div>
      <form id="import-form" action={importDispatch}>
        {message ? (
          <div className="my-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <TextInput name="import" label="Import from URL" />
        <SubmitButton>Import</SubmitButton>
      </form>
      <RecipeFormShell
        key={submissionState.formData ? submissionState.message : url}
        action={submissionDispatch}
        slug={slug}
        recipe={submissionState.formData || recipe || undefined}
        className="m-2 w-full"
      >
        <h2 className="font-bold text-2xl mb-2">New Recipe</h2>
        <div className="flex flex-col flex-nowrap">
          <CreateRecipeFields
            state={submissionState}
            slug={slug}
            recipe={submissionState.formData || recipe || undefined}
            allTags={allTags}
          />
          <div id="missing-fields-error" aria-live="polite" aria-atomic="true">
            {submissionState.message && (
              <p className="mt-2 text-sm text-destructive">
                {submissionState.message}
              </p>
            )}
          </div>
          <div className="my-1 flex gap-2">
            <SubmitButton>Submit</SubmitButton>
            {submissionState.slugConflict && (
              <Button
                type="submit"
                variant="destructive"
                formAction={overwriteDispatch}
              >
                Overwrite
              </Button>
            )}
          </div>
        </div>
      </RecipeFormShell>
    </div>
  );
}
