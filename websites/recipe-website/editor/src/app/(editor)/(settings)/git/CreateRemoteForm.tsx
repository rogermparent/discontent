"use client";

import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { useActionState } from "react";
import { createRemote } from "../../../../../controller/actions";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";

const CREATE_REMOTE_BUTTON_TEXT = "Add";
const REMOTE_NAME_LABEL = "Remote Name";
const REMOTE_URL_LABEL = "Remote URL";

export function CreateRemoteForm() {
  const [createRemoteState, createRemoteWithState] = useActionState(
    createRemote,
    undefined,
  );
  return (
    <form action={createRemoteWithState}>
      {createRemoteState && (
        <div className="text-sm py-1 text-destructive whitespace-pre">
          {createRemoteState}
        </div>
      )}
      <TextInput label={REMOTE_NAME_LABEL} name="remoteName" />
      <TextInput label={REMOTE_URL_LABEL} name="remoteUrl" />
      <div className="flex flex-row flex-nowrap my-1 gap-1">
        <SubmitButton>{CREATE_REMOTE_BUTTON_TEXT}</SubmitButton>
      </div>
    </form>
  );
}
