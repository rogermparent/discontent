"use client";

import CreateGroupFields from "recipe-website-common/components/Form/Group/Create";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import type { GroupFormState } from "recipe-website-common/controller/groupFormState";
import { updateGroup } from "recipe-editor/controller/actions/groups";
import type { Group } from "recipe-website-common/controller/types";

export default function EditGroupForm({
  group,
  slug,
}: {
  group: Group;
  slug: string;
}) {
  const initialState = { message: "", errors: {} } as GroupFormState;
  const [state, dispatch] = useActionState(
    updateGroup.bind(null, group.date, slug),
    initialState,
  );

  return (
    <form id="group-form" className="m-2 w-full" action={dispatch}>
      <h2 className="mb-2 text-2xl font-bold">Editing Group: {slug}</h2>
      <div className="flex flex-col flex-nowrap">
        <CreateGroupFields state={state} group={group} slug={slug} />
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
