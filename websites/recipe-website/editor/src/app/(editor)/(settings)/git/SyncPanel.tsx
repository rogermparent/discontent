"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import type { EditorRole } from "recipe-website-common/config/role";
import {
  remoteCommandAction,
  commitWorkingChanges,
} from "../../../../../controller/actions/sync";
import type { SyncStatus } from "./types";

function AheadBehind({ ahead, behind }: { ahead: number; behind: number }) {
  if (ahead === 0 && behind === 0) {
    return <span className="text-sm text-success">in sync</span>;
  }
  return (
    <span className="flex flex-row gap-2 text-sm font-mono">
      {ahead > 0 && <span className="text-info">↑{ahead}</span>}
      {behind > 0 && <span className="text-warning">↓{behind}</span>}
    </span>
  );
}

/**
 * `role` (epic 28, D2): a mirror never pushes — the workstation pulls its
 * commits and pushes its own back — so it gets Fetch and "Pull from
 * <workstation>" only, and Pull only when it has nothing of its own waiting
 * (a pull then is a fast-forward; a merge happens on the workstation, never
 * here). The server actions refuse the rest regardless (`requireWorkstation`).
 */
export function SyncPanel({
  status,
  role = "workstation",
  workstationName = "the workstation",
}: {
  status: SyncStatus;
  role?: EditorRole;
  workstationName?: string;
}) {
  const mirror = role === "mirror";
  const {
    branch,
    detached,
    upstream,
    ahead,
    behind,
    remotes,
    dirty,
    dirtyCount,
  } = status;

  const [commandState, commandAction] = useActionState(
    remoteCommandAction,
    null,
  );
  const [commitState, commitAction] = useActionState(
    commitWorkingChanges,
    null,
  );
  const [selectedRemote, setSelectedRemote] = useState("");
  // Default to the sole remote even after a re-render adds it (state, seeded
  // empty on first mount, would otherwise leave the single remote unselected).
  const effectiveRemote =
    selectedRemote || (remotes.length === 1 ? remotes[0].name : "");

  const diverged = ahead > 0 && behind > 0;
  const hasRemote = remotes.length > 0;
  const blocked = detached || dirty;

  let statusMessage: string;
  let tone: "neutral" | "warn" | "ok" = "neutral";
  if (detached) {
    statusMessage = "Detached HEAD — checkout a branch to sync.";
    tone = "warn";
  } else if (dirty) {
    statusMessage = `${dirtyCount} uncommitted change${dirtyCount === 1 ? "" : "s"}. Commit before syncing.`;
    tone = "warn";
  } else if (mirror && !upstream) {
    statusMessage = `No upstream — this mirror pulls from ${workstationName}; \`pnpm deploy:pi --setup\` sets it up.`;
    tone = "warn";
  } else if (mirror && diverged) {
    statusMessage = `Diverged — ${workstationName} merges both sides when it next syncs.`;
    tone = "warn";
  } else if (mirror && ahead > 0) {
    statusMessage = `${ahead} change${ahead === 1 ? "" : "s"} here waiting for ${workstationName} to sync.`;
  } else if (mirror && behind > 0) {
    statusMessage = `${behind} change${behind === 1 ? "" : "s"} from ${workstationName} to pull.`;
  } else if (!upstream) {
    statusMessage = hasRemote
      ? "No upstream configured. Choose a remote and set the upstream."
      : "No remote configured. Add one under Advanced to start syncing.";
    tone = "warn";
  } else if (diverged) {
    statusMessage = "Diverged — Sync will merge remote changes.";
    tone = "warn";
  } else if (behind > 0) {
    statusMessage = `${behind} change${behind === 1 ? "" : "s"} to pull.`;
  } else if (ahead > 0) {
    statusMessage = `${ahead} change${ahead === 1 ? "" : "s"} to push.`;
  } else {
    statusMessage = "Up to date with the remote.";
    tone = "ok";
  }

  const needsRemoteChoice = !mirror && !upstream && hasRemote;

  return (
    <section className="border border-border rounded-md p-4 my-3 bg-card/40">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2 font-mono text-sm">
          <span className="font-bold">{branch ?? "(detached)"}</span>
          <span className="text-muted-foreground">→</span>
          <span className={clsx(!upstream && "italic text-muted-foreground")}>
            {upstream ?? "no upstream"}
          </span>
        </div>
        <AheadBehind ahead={ahead} behind={behind} />
      </div>

      <p
        className={clsx(
          "text-sm my-2",
          tone === "warn" && "text-warning",
          tone === "ok" && "text-success",
        )}
      >
        {statusMessage}
      </p>

      {commandState && (
        <div className="text-sm py-1 text-destructive whitespace-pre-wrap">
          {commandState}
        </div>
      )}

      {dirty ? (
        <form action={commitAction} className="my-2">
          {commitState && (
            <div className="text-sm py-1 text-destructive whitespace-pre-wrap">
              {commitState}
            </div>
          )}
          <SubmitButton size="sm" variant="secondary">
            Commit working changes
          </SubmitButton>
        </form>
      ) : (
        <form action={commandAction}>
          {needsRemoteChoice && (
            <fieldset className="my-2">
              <legend className="text-sm font-bold">Remote</legend>
              {remotes.map(({ name, fetchUrl }) => (
                <label key={name} className="flex flex-col p-1">
                  <span>
                    <input
                      type="radio"
                      name="remote"
                      value={name}
                      checked={effectiveRemote === name}
                      onChange={() => setSelectedRemote(name)}
                    />{" "}
                    {name}
                  </span>
                  <span className="text-sm ml-5 italic text-muted-foreground">
                    {fetchUrl}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex flex-row flex-wrap gap-2">
            {mirror ? (
              <>
                <SubmitButton
                  name="command"
                  value="pull"
                  disabled={blocked || !upstream || ahead > 0}
                  pendingChildren="Pulling…"
                >
                  Pull from {workstationName}
                </SubmitButton>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  name="command"
                  value="fetch"
                  disabled={detached || !upstream}
                  pendingChildren="Fetching…"
                >
                  Fetch
                </SubmitButton>
              </>
            ) : upstream ? (
              <>
                <SubmitButton
                  name="command"
                  value="sync"
                  disabled={blocked}
                  pendingChildren="Syncing…"
                >
                  {diverged ? "Sync (will merge)" : "Sync"}
                </SubmitButton>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  name="command"
                  value="fetch"
                  disabled={detached}
                  pendingChildren="Fetching…"
                >
                  Fetch
                </SubmitButton>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  name="command"
                  value="pull"
                  disabled={blocked}
                  pendingChildren="Pulling…"
                >
                  Pull
                </SubmitButton>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  name="command"
                  value="push"
                  disabled={blocked}
                  pendingChildren="Pushing…"
                >
                  Push
                </SubmitButton>
              </>
            ) : (
              hasRemote && (
                <SubmitButton
                  name="command"
                  value="pushSetUpstream"
                  disabled={blocked || !effectiveRemote}
                  pendingChildren="Pushing…"
                >
                  Set upstream &amp; push
                </SubmitButton>
              )
            )}
          </div>
        </form>
      )}
    </section>
  );
}
