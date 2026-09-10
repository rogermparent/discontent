"use client";

import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { remoteCommandAction } from "../../../../../controller/actions/sync";
import type { RemoteSummary } from "./types";

export function RemoteSelector({ remotes }: { remotes: RemoteSummary[] }) {
  const [remoteCommandState, remoteCommandActionWithState] = useActionState(
    remoteCommandAction,
    null,
  );
  return (
    <form action={remoteCommandActionWithState}>
      {remoteCommandState && (
        <div className="text-sm py-1 text-destructive whitespace-pre">
          {remoteCommandState}
        </div>
      )}
      <ul className="pl-1 my-3">
        {remotes.map(({ name, fetchUrl }) => {
          return (
            <li key={name}>
              <label className="p-1">
                <div>
                  <input name="remote" value={name} type="radio" /> {name}
                </div>
                <div className="text-sm ml-2 italic">{fetchUrl}</div>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-row flex-wrap gap-2">
        <SubmitButton size="sm" variant="outline" name="command" value="fetch">
          Fetch
        </SubmitButton>
        <SubmitButton size="sm" variant="outline" name="command" value="pull">
          Pull
        </SubmitButton>
        <SubmitButton size="sm" variant="outline" name="command" value="push">
          Push
        </SubmitButton>
      </div>
    </form>
  );
}
