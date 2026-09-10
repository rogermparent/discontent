"use client";

import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import {
  resolveConflict,
  commitMerge,
  abortMerge,
} from "../../../../../controller/actions/sync";
import type { MergeState } from "./types";

function ConflictRow({ path, label }: { path: string; label: string }) {
  const [state, action] = useActionState(resolveConflict, null);
  return (
    <li className="border-b border-border py-2">
      <div className="font-mono text-sm">{label}</div>
      {state && (
        <div className="text-sm py-1 text-destructive whitespace-pre-wrap">
          {state}
        </div>
      )}
      <div className="flex flex-row flex-wrap gap-2 mt-1">
        <form action={action}>
          <input type="hidden" name="path" value={path} />
          <SubmitButton
            size="sm"
            variant="outline"
            name="choice"
            value="ours"
            pendingChildren="…"
          >
            Keep Mine
          </SubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="path" value={path} />
          <SubmitButton
            size="sm"
            variant="outline"
            name="choice"
            value="theirs"
            pendingChildren="…"
          >
            Take Theirs
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

export function ConflictResolver({ merge }: { merge: MergeState }) {
  const [commitState, commitAction] = useActionState(commitMerge, null);
  const [abortState, abortAction] = useActionState(abortMerge, null);

  const { conflicted, resolvedCount } = merge;
  const unresolved = conflicted.length;

  return (
    <section className="border border-warning/60 rounded-md p-4 my-3 bg-warning/10">
      <h2 className="text-lg font-bold text-warning">
        Resolve merge conflicts
      </h2>
      <p className="text-sm my-1 text-warning/90">
        A pull produced conflicts. Choose which version to keep for each file,
        then complete the merge.
        {resolvedCount > 0 && ` ${resolvedCount} already resolved.`}
      </p>

      {unresolved > 0 ? (
        <ul className="border-t border-border my-2">
          {conflicted.map(({ path, label }) => (
            <ConflictRow key={path} path={path} label={label} />
          ))}
        </ul>
      ) : (
        <p className="text-sm my-2 text-success">
          All conflicts resolved — complete the merge to finish.
        </p>
      )}

      {(commitState || abortState) && (
        <div className="text-sm py-1 text-destructive whitespace-pre-wrap">
          {commitState ?? abortState}
        </div>
      )}

      <div className="flex flex-row flex-wrap gap-2 mt-2">
        <form action={commitAction}>
          <SubmitButton disabled={unresolved > 0} pendingChildren="Completing…">
            Complete Merge
          </SubmitButton>
        </form>
        <form action={abortAction}>
          <SubmitButton variant="destructive" pendingChildren="Aborting…">
            Abort Merge
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
