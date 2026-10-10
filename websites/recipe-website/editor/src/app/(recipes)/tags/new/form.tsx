"use client";

import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import TermFields from "recipe-website-common/components/Form/Term";
import type { TermParentOption } from "recipe-website-common/controller/tagVocabulary";
import type { TermFormState } from "recipe-website-common/controller/termFormState";
import { createTermFromForm } from "recipe-editor/controller/actions/tagTerms";

export default function NewTermForm({
  parentOptions,
}: {
  parentOptions: TermParentOption[];
}) {
  const initialState: TermFormState = { message: "", errors: {} };
  const [state, dispatch] = useActionState(createTermFromForm, initialState);

  return (
    <form id="term-form" className="m-2 w-full" action={dispatch}>
      <h2 className="mb-2 text-2xl font-bold">New Term</h2>
      <div className="flex flex-col flex-nowrap">
        {/*
          Remounted on each new state, so a refusal's echo (`state.formData`)
          becomes the fields' defaults rather than being reset away.
        */}
        <TermFields
          key={JSON.stringify(state)}
          state={state}
          parentOptions={parentOptions}
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
