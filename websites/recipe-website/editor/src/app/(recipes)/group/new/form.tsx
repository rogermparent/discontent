"use client";

import CreateGroupFields from "recipe-website-common/components/Form/Group/Create";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import type { GroupFormState } from "recipe-website-common/controller/groupFormState";
import { createGroup } from "recipe-editor/controller/actions/groups";

export default function NewGroupForm({
  preselectedRecipe,
}: {
  preselectedRecipe?: string;
}) {
  const initialState = { message: "", errors: {} } as GroupFormState;
  const [state, dispatch] = useActionState(createGroup, initialState);

  return (
    <form id="group-form" className="m-2 w-full" action={dispatch}>
      <h2 className="mb-2 text-2xl font-bold">New Group</h2>
      <div className="flex flex-col flex-nowrap">
        <CreateGroupFields
          state={state}
          /*
           * `?recipe=` becomes the first row's default. The row is there
           * either way — a group form with no rows has no obvious affordance —
           * so this only fills it in.
           */
          group={
            preselectedRecipe
              ? { items: [{ recipe: preselectedRecipe }] }
              : undefined
          }
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
