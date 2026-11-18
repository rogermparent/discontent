"use client";

import { useActionState } from "react";
import clsx from "clsx";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import type { EditorRole } from "recipe-website-common/config/role";
import { remoteCommandAction } from "../../../../../controller/actions/sync";
import type { SyncStatus } from "./types";

/**
 * The ahead/behind badge. With no upstream both counts are 0 by default,
 * not by comparison, so it says nothing (47h): a green "in sync" beside
 * "no upstream" read as synced.
 */
function AheadBehind({
  ahead,
  behind,
  upstream,
}: {
  ahead: number;
  behind: number;
  upstream?: string | null;
}) {
  if (!upstream) return null;
  if (ahead === 0 && behind === 0) {
    return <span className="text-sm text-success">in sync</span>;
  }
  return (
    <span className="flex flex-row gap-2 font-mono text-sm">
      {ahead > 0 && <span className="text-info">↑{ahead}</span>}
      {behind > 0 && <span className="text-warning">↓{behind}</span>}
    </span>
  );
}

/**
 * Pull, push and fetch by hand (48d: under Advanced — "for when you know
 * why"). The page's status sentence says what state the branch is in, and
 * Sync lives in Upkeep's sync row; this is the branch → upstream line and
 * the three raw commands.
 *
 * `role` (epic 28, D2): a mirror never pushes — the workstation pulls its
 * commits and pushes its own back — so it gets Fetch only here (its Pull
 * from the workstation is in its sync row). The server actions refuse the
 * rest regardless (`requireWorkstation`).
 */
export function SyncPanel({
  status,
  role = "workstation",
}: {
  status: SyncStatus;
  role?: EditorRole;
}) {
  const mirror = role === "mirror";
  const { branch, detached, upstream, ahead, behind, dirty } = status;
  const [commandState, commandAction] = useActionState(
    remoteCommandAction,
    null,
  );
  const blocked = detached || dirty;

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2 font-mono text-sm">
          <span className="font-bold">{branch ?? "(detached)"}</span>
          <span className="text-muted-foreground">→</span>
          <span className={clsx(!upstream && "text-muted-foreground italic")}>
            {upstream ?? "no upstream"}
          </span>
        </div>
        <AheadBehind ahead={ahead} behind={behind} upstream={upstream} />
      </div>

      {commandState && (
        <div className="py-1 text-sm whitespace-pre-wrap text-destructive">
          {commandState}
        </div>
      )}

      <form action={commandAction} className="flex flex-row flex-wrap gap-2">
        <SubmitButton
          size="sm"
          variant="outline"
          name="command"
          value="fetch"
          disabled={detached || (mirror && !upstream)}
          pendingChildren="Fetching…"
        >
          Fetch
        </SubmitButton>
        {!mirror && upstream && (
          <>
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
        )}
      </form>
    </div>
  );
}
