"use client";

import CreateGroupFields from "recipe-website-common/components/Form/Group/Create";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import type { GroupFormState } from "recipe-website-common/controller/groupFormState";
import type { GroupPrefill } from "recipe-website-common/controller/groupPrefill";
import { createGroup } from "recipe-editor/controller/actions/groups";
import type { TagPickerData } from "recipe-website-common/components/Form/Tags/tagPicker";

export default function NewGroupForm({
  prefill,
  tagPicker,
}: {
  prefill?: GroupPrefill;
  tagPicker?: TagPickerData;
}) {
  const initialState = { message: "", errors: {} } as GroupFormState;
  const [state, dispatch] = useActionState(createGroup, initialState);

  return (
    <form id="group-form" className="m-2 w-full" action={dispatch}>
      <h2 className="mb-2 text-2xl font-bold">New Group</h2>
      <div className="flex flex-col flex-nowrap">
        <CreateGroupFields
          state={state}
          tagPicker={tagPicker}
          /*
           * The link's values become the form's defaults (`groupPrefill`):
           * `?recipe=` the first row, the homepage's menu link a name, tags
           * and a row per course. The row is there either way — a group form
           * with no rows has no obvious affordance — so this only fills it in.
           */
          group={prefill ? { ...prefill } : undefined}
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
