"use client";

import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { When } from "@/curator/time";
import {
  resolveConflict,
  commitMerge,
  abortMerge,
} from "../../../../../controller/actions/sync";
import type { ConflictChoice } from "../../../../../controller/sync/conflicts";
import type { MergeState } from "./types";

function SideCard({
  title,
  side,
}: {
  title: string;
  side: ConflictChoice["ours"];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3">
      <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold">
        {title}
        {side.at && (
          <span className="text-xs font-normal text-muted-foreground">
            <When epoch={Date.parse(side.at)} />
          </span>
        )}
      </h4>
      {side.changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">The whole file changed.</p>
      ) : (
        <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {side.changes.map((change) => (
            <div key={change.field} className="contents">
              <dt className="text-muted-foreground">{change.label}</dt>
              <dd className="[overflow-wrap:anywhere]">{change.words}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * One conflicted record as a choice (48d, B): what each side changed, and
 * keep both (when the record merges by field, Dd4), only this editor's, or
 * only the other side's. A field both changed differently asks which to
 * keep before "Keep both" can go.
 */
function ConflictChoiceCard({
  choice,
  peer,
}: {
  choice: ConflictChoice;
  peer: string;
}) {
  const [state, action] = useActionState(resolveConflict, null);
  const headingId = `conflict-${choice.path.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <li>
      <form
        action={action}
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      >
        <input type="hidden" name="path" value={choice.path} />
        <div className="flex flex-col gap-0.5">
          <h3
            id={headingId}
            className="font-display text-lg font-semibold tracking-tight"
          >
            {choice.name ?? choice.label}
          </h3>
          <p className="font-mono text-xs text-muted-foreground">
            {choice.label}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SideCard title="On this editor" side={choice.ours} />
          <SideCard title={`On ${peer}`} side={choice.theirs} />
        </div>
        {choice.mergeable && choice.clashes.length === 0 && (
          <p className="text-sm">
            They changed different things, so both can stay.
          </p>
        )}
        {choice.clashes.map((clash) => (
          <fieldset
            key={clash.field}
            className="flex flex-col gap-1.5 rounded-lg border p-3"
          >
            <legend className="px-1 text-sm font-semibold">
              Both changed {clash.label.toLowerCase()}: keep which?
            </legend>
            <label className="flex min-h-8 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`pick:${clash.field}`}
                value="ours"
                required
                className="size-4 accent-primary"
              />
              <span className="[overflow-wrap:anywhere]">{clash.ours}</span>
              <span className="text-muted-foreground">this editor</span>
            </label>
            <label className="flex min-h-8 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`pick:${clash.field}`}
                value="theirs"
                required
                className="size-4 accent-primary"
              />
              <span className="[overflow-wrap:anywhere]">{clash.theirs}</span>
              <span className="text-muted-foreground">{peer}</span>
            </label>
          </fieldset>
        ))}
        {state && (
          <p
            role="alert"
            className="text-sm whitespace-pre-wrap text-destructive"
          >
            {state}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {choice.mergeable && (
            <SubmitButton name="choice" value="both" pendingChildren="Keeping…">
              Keep both changes
            </SubmitButton>
          )}
          <SubmitButton
            variant="outline"
            name="choice"
            value="ours"
            formNoValidate
            pendingChildren="Keeping…"
          >
            Keep only this editor&apos;s
          </SubmitButton>
          <SubmitButton
            variant="outline"
            name="choice"
            value="theirs"
            formNoValidate
            pendingChildren="Keeping…"
          >
            Keep only {peer}&apos;s
          </SubmitButton>
        </div>
      </form>
    </li>
  );
}

export function ConflictResolver({
  merge,
  choices,
  peer,
}: {
  merge: MergeState;
  choices: ConflictChoice[];
  peer: string;
}) {
  const [commitState, commitAction] = useActionState(commitMerge, null);
  const [abortState, abortAction] = useActionState(abortMerge, null);

  const { resolvedCount } = merge;
  const unresolved = choices.length;

  return (
    <section
      aria-labelledby="conflict-heading"
      className="flex flex-col gap-3 rounded-xl border border-warning/60 bg-warning/10 p-4"
      data-testid="conflict-resolver"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="conflict-heading"
          className="font-display text-lg font-semibold"
        >
          Resolve merge conflicts
        </h2>
        <p className="text-sm">
          A pull stopped where both sides changed the same record. Choose what
          to keep for each, then complete the merge: one commit, which the next
          sync takes across.
          {resolvedCount > 0 && ` ${resolvedCount} already chosen.`}
        </p>
      </div>

      {unresolved > 0 ? (
        <ul className="flex flex-col gap-3">
          {choices.map((choice) => (
            <ConflictChoiceCard key={choice.path} choice={choice} peer={peer} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-success">
          Every record has a choice — complete the merge to finish.
        </p>
      )}

      {(commitState || abortState) && (
        <div className="py-1 text-sm whitespace-pre-wrap text-destructive">
          {commitState ?? abortState}
        </div>
      )}

      <div className="flex flex-row flex-wrap gap-2">
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
