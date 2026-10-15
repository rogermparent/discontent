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
import { TextAreaInput } from "@discontent/component-library/components/Form/inputs/TextArea";
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
  /* The "Paste text" tab (36c): controlled, so a failed import keeps it. */
  const [textMode, setTextMode] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pastedSource, setPastedSource] = useState("");
  /* The URL too (36c review): it survives a switch to Paste text and back. */
  const [importUrl, setImportUrl] = useState("");
  /* Switching mode dismisses the last import's message (36c review). */
  const [dismissed, setDismissed] = useState<RecipeActionState | null>(null);
  const switchMode = (toText: boolean) => {
    setTextMode(toText);
    setDismissed(importState);
  };

  const { recipe, url, key, llm, warnings } = importState || {};
  const message =
    importState && importState !== dismissed ? importState.message : undefined;
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
        {/* 36c (D8): import from a URL, or from pasted text the local model
            reads — plain radio buttons, unavailable without a model. */}
        <fieldset className="my-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <legend className="sr-only">Import from</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="importMode"
              value="url"
              checked={textMode === false}
              onChange={() => switchMode(false)}
            />
            URL
          </label>
          <label
            className="flex items-center gap-2"
            title={llmModel ? undefined : "No local model configured"}
          >
            <input
              type="radio"
              name="importMode"
              value="text"
              disabled={!llmModel}
              checked={textMode}
              onChange={() => switchMode(true)}
            />
            Paste text
            <span className="text-muted-foreground">
              {llmModel
                ? `— ${llmModel} reads a pasted recipe (a video description, an email)`
                : "— No local model configured"}
            </span>
          </label>
        </fieldset>
        {textMode ? (
          <>
            <TextAreaInput
              name="importText"
              id="import-text"
              label="Recipe text"
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
            />
            <TextInput
              name="importSource"
              id="import-source"
              label="Pasted from (URL, optional)"
              value={pastedSource}
              onChange={(event) => setPastedSource(event.target.value)}
            />
          </>
        ) : (
          <>
            <TextInput
              name="import"
              label="Import from URL"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
            />
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
          </>
        )}
        <SubmitButton disabled={busy}>Import</SubmitButton>
        {busy ? (
          <span className="ml-2 text-sm text-muted-foreground">
            Waiting for the roundup import to finish…
          </span>
        ) : importPending && llmModel ? (
          <span role="status" className="ml-2 text-sm text-muted-foreground">
            {textMode
              ? `Reading the text with ${llmModel}… (the first use loads the model, ~10 s)`
              : forceLlm
                ? `Reading the page with ${llmModel}… (the first use loads the model, ~10 s)`
                : `Importing… a page with no recipe data is read by ${llmModel}, which can take a minute`}
          </span>
        ) : null}
      </form>
      <RecipeFormShell
        key={submissionState.formData ? submissionState.message : (key ?? url)}
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
