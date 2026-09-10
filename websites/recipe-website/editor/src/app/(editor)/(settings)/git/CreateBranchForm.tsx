"use client";

import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { useActionState } from "react";
import { createBranch } from "../../../../../controller/actions";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";

const CREATE_BRANCH_BUTTON_TEXT = "Create";
const BRANCH_SELECTOR_LABEL = "Branch Name";

export function CreateBranchForm() {
  const [createBranchState, createBranchWithState] = useActionState(
    createBranch,
    undefined,
  );
  return (
    <form action={createBranchWithState}>
      {createBranchState && (
        <div className="text-sm py-1 text-destructive whitespace-pre">
          {createBranchState}
        </div>
      )}
      <TextInput label={BRANCH_SELECTOR_LABEL} name="branchName" />
      <div className="flex flex-row flex-nowrap my-1 gap-1">
        <SubmitButton>{CREATE_BRANCH_BUTTON_TEXT}</SubmitButton>
      </div>
    </form>
  );
}
