"use client";

import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import type { StaticImageProps } from "@discontent/next-static-image/src";
import TermFields, {
  type TermFieldsInitial,
} from "recipe-website-common/components/Form/Term";
import type { TermParentOption } from "recipe-website-common/controller/tagVocabulary";
import type { TermFormState } from "recipe-website-common/controller/termFormState";
import { saveTermFromForm } from "recipe-editor/controller/actions/tagTerms";

export default function EditTermForm({
  slug,
  hasRecord,
  initial,
  parentOptions,
  pinnedSuggestions,
  defaultImage,
}: {
  slug: string;
  /** Whether a record exists yet; only the heading and the note depend on it. */
  hasRecord: boolean;
  initial: TermFieldsInitial;
  parentOptions: TermParentOption[];
  pinnedSuggestions: string[];
  defaultImage?: StaticImageProps;
}) {
  const initialState: TermFormState = { message: "", errors: {} };
  const [state, dispatch] = useActionState(
    saveTermFromForm.bind(null, slug),
    initialState,
  );

  return (
    <form id="term-form" className="m-2 w-full" action={dispatch}>
      <h2 className="mb-2 text-2xl font-bold">Editing Term: {slug}</h2>
      {!hasRecord && (
        <p className="mb-2 text-sm text-muted-foreground">
          This term has no record yet — it exists only as a tag on its recipes
          and groups. Saving creates one, so it can carry a description, a
          picture, a parent and a pinned front.
        </p>
      )}
      <div className="flex flex-col flex-nowrap">
        {/*
          Remounted on each new state, so a refusal's echo (`state.formData`)
          becomes the fields' defaults rather than being reset away.
        */}
        <TermFields
          key={JSON.stringify(state)}
          state={state}
          initial={initial}
          slug={slug}
          parentOptions={parentOptions}
          pinnedSuggestions={pinnedSuggestions}
          defaultImage={defaultImage}
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
