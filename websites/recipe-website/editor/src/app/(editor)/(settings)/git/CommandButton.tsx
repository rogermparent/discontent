"use client";

import { useActionState, useState, type ReactNode } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import {
  commitWorkingChanges,
  remoteCommandAction,
} from "../../../../../controller/actions/sync";

type Variant = "default" | "outline" | "secondary" | "destructive";

/**
 * One git command as a button (48d): Check again, Sync, Pull to resolve,
 * Pull from the workstation. The action answers an error string or `null`;
 * the error shows under the button.
 */
export function CommandButton({
  command,
  remote,
  children,
  pending,
  variant = "default",
  size = "default",
  disabled,
}: {
  command: "fetch" | "pull" | "push" | "sync" | "pushSetUpstream";
  remote?: string;
  children: ReactNode;
  pending: ReactNode;
  variant?: Variant;
  size?: "default" | "sm";
  disabled?: boolean;
}) {
  const [error, action] = useActionState(remoteCommandAction, null);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      {remote && <input type="hidden" name="remote" value={remote} />}
      <SubmitButton
        name="command"
        value={command}
        variant={variant}
        size={size}
        disabled={disabled}
        pendingChildren={pending}
      >
        {children}
      </SubmitButton>
      {error && (
        <p
          role="alert"
          className="max-w-prose text-sm whitespace-pre-wrap text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}

/** Commit the working tree's changes (the sentence's "commit" action). */
export function CommitWorkingButton() {
  const [error, action] = useActionState(commitWorkingChanges, null);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <SubmitButton variant="secondary" pendingChildren="Committing…">
        Commit working changes
      </SubmitButton>
      {error && (
        <p
          role="alert"
          className="text-sm whitespace-pre-wrap text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * No upstream yet: choose a remote (when there are several) and push to it,
 * setting it as the upstream.
 */
export function SetUpstreamForm({
  remotes,
}: {
  remotes: { name: string; fetchUrl: string }[];
}) {
  const [error, action] = useActionState(remoteCommandAction, null);
  const [selected, setSelected] = useState("");
  const remote = selected || (remotes.length === 1 ? remotes[0].name : "");
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      {remotes.length > 1 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold">Remote</legend>
          {remotes.map(({ name, fetchUrl }) => (
            <label key={name} className="flex min-h-8 items-center gap-2">
              <input
                type="radio"
                name="remote"
                value={name}
                checked={remote === name}
                onChange={() => setSelected(name)}
                className="size-4 accent-primary"
              />
              <span className="font-mono text-sm">{name}</span>
              <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {fetchUrl}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        remote && <input type="hidden" name="remote" value={remote} />
      )}
      <SubmitButton
        name="command"
        value="pushSetUpstream"
        disabled={!remote}
        pendingChildren="Pushing…"
      >
        Set upstream &amp; push
      </SubmitButton>
      {error && (
        <p
          role="alert"
          className="text-sm whitespace-pre-wrap text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}
