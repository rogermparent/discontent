"use client";

import CreateRecipeFields from "recipe-website-common/components/Form/Create";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import { useActionState, useState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import {
  createRecipe,
  overwriteRecipe,
} from "recipe-editor/controller/actions";
import { importRecipeAction } from "./actions";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import type { RecipeActionState } from "./common";

export default function NewOrImportRecipeForm({
  slug,
  initialState: initialImportState,
  allTags = [],
  busy = false,
  llmModel,
}: {
  slug?: string;
  initialState: RecipeActionState | null;
  allTags?: string[];
  /** A roundup import is running (35r): Import and Submit wait for it. */
  busy?: boolean;
  /** The local model's name, or nothing when none is configured (36b). */
  llmModel?: string;
}) {
  const [importState, importDispatch, importPending] = useActionState(
    importRecipeAction,
    initialImportState,
  );
  const [forceLlm, setForceLlm] = useState(false);

  const { recipe, message, url, llm, warnings } = importState || {};
  /* The model's lines are in the form: its notice replaces the SEO one. */
  const llmLines = !!llm?.found && !llm.discarded;

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
        {recipe?.partial && !llmLines ? (
          /* The SEO fallback (26a/D3): name, description, image and source
           * only — the ingredients and steps are the user's to fill in. */
          <div
            role="status"
            className="my-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground"
          >
            No recipe data on this page — filled from its title, description and
            image.
          </div>
        ) : null}
        {warnings?.length ? (
          /* The local model (36b): what it read and how much of it was on
           * the page — or why its reading was dropped. */
          <div
            role="status"
            data-testid="llm-notice"
            className="my-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground"
          >
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        <TextInput name="import" label="Import from URL" />
        <label
          className="my-1 flex items-center gap-2 text-sm"
          title={llmModel ? undefined : "No local model configured"}
        >
          <input
            type="checkbox"
            name="llm"
            value="force"
            disabled={!llmModel}
            checked={forceLlm && !!llmModel}
            onChange={(event) => setForceLlm(event.target.checked)}
          />
          Extract with AI (local model)
          <span className="text-muted-foreground">
            {llmModel
              ? `— ${llmModel} reads the page even when it has recipe data`
              : "— No local model configured"}
          </span>
        </label>
        <SubmitButton disabled={busy}>Import</SubmitButton>
        {busy ? (
          <span className="ml-2 text-sm text-muted-foreground">
            Waiting for the roundup import to finish…
          </span>
        ) : importPending && llmModel ? (
          <span role="status" className="ml-2 text-sm text-muted-foreground">
            {forceLlm
              ? `Reading the page with ${llmModel}… (the first use loads the model, ~10 s)`
              : `Importing… a page with no recipe data is read by ${llmModel}, which can take a minute`}
          </span>
        ) : null}
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
            <SubmitButton disabled={busy}>Submit</SubmitButton>
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
