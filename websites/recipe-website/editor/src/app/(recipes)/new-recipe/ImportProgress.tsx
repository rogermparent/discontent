"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  buildStepTree,
  describeWaiting,
  durationText,
  noteText,
} from "recipe-editor/controller/jobs/timeline";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import { StepList } from "@/jobs/StepList";
import { requestCancel, useJobPoll } from "@/jobs/useJobPoll";
import type { RecipeActionState } from "./common";

/** How often the panel reads the job (D7: every second). */
export const IMPORT_POLL_MS = 1_000;

/**
 * A job with no record (39a, 38-Tb5): the panel follows nothing — its id
 * answers 404 — and says so; the form hands it the end (`status`) once
 * `importResultAction` answers.
 */
export interface UnfollowedImport {
  /** Unset while the job runs. */
  status?: "done" | "failed";
}

function capitalized(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * The one sentence the live region says: it changes only when the phase
 * does — started, waiting (and where), running, and how it ended — never
 * per step, so a screen reader is told what matters without a stream.
 */
function announcement(
  meta: JobRecord | undefined,
  unfollowed?: UnfollowedImport,
): string {
  if (unfollowed) {
    return unfollowed.status === "done"
      ? "Import done: the form is filled."
      : unfollowed.status === "failed"
        ? "Import failed."
        : "Importing…";
  }
  if (!meta) return "Import started.";
  switch (meta.status) {
    case "queued":
    case "running":
      return meta.waiting
        ? `${capitalized(describeWaiting(meta.waiting))}.`
        : "Importing…";
    case "done": {
      const found = (meta.result as RecipeActionState | undefined)?.recipes
        ?.length;
      return found && found > 1
        ? `Import done: ${found} recipes found — pick the ones to import.`
        : "Import done: the form is filled.";
    }
    /* No message here: the form (or the panel) shows it, once. */
    case "failed":
      return "Import failed.";
    case "cancelled":
      return "Import cancelled.";
    case "interrupted":
      return "Import interrupted: its process ended.";
  }
}

/**
 * The form's import while it runs (37c, D7): the job's live step list —
 * what it is doing, for how long, the model's line counts — read from
 * `GET /api/jobs/<id>` every second; where it waits in the queue ("waiting
 * for the GPU — 2nd in line"); the GPU hook's and the placement check's
 * warnings; a Cancel button. When the job ends the form is handed its
 * result (`onSettled`) and renders it exactly as before — the fill, or the
 * 36e picker — and the panel folds to one line, its steps a click away.
 */
export default function ImportProgress({
  job,
  onSettled,
  unfollowed,
}: {
  job: string;
  /** Called once, when the job is seen to end. */
  onSettled?: (meta: JobRecord) => void;
  /**
   * The job has no record (38-Tb5): nothing is polled, and the panel stays
   * "running" until the form says how it ended — never "finished" on a 404.
   */
  unfollowed?: UnfollowedImport;
}) {
  const poll = useJobPoll(unfollowed ? undefined : job, IMPORT_POLL_MS);
  const { lines, error, refresh } = poll;
  const meta = unfollowed ? undefined : poll.meta;
  const live = unfollowed ? !unfollowed.status : poll.live;
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | undefined>();
  /* The finished job's steps are drawn only when asked for. */
  const [showSteps, setShowSteps] = useState(false);
  const settled = useRef<string | undefined>(undefined);

  /* The running step's clock ticks between reads. */
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [live]);

  const ended = !!meta && !live;
  useEffect(() => {
    if (!ended || !meta || settled.current === meta.id) return;
    settled.current = meta.id;
    onSettled?.(meta);
  }, [ended, meta, onSettled]);

  const tree = buildStepTree(lines);
  const started = meta?.startedAt ?? meta?.queuedAt;
  const elapsed =
    started === undefined ? undefined : (meta?.endedAt ?? now) - started;
  const status = unfollowed
    ? (unfollowed.status ?? "running")
    : (meta?.status ?? "running");
  /* With a result, the form shows its message and warnings; without one
   * (a thrown failure), they are the panel's to show. */
  const formHasIt = meta?.result !== undefined;
  const warnings = live
    ? tree.warnings.map(noteText)
    : formHasIt
      ? []
      : (meta?.error?.warnings ?? []);

  const cancel = async () => {
    setCancelling(true);
    setCancelError(await requestCancel(job));
    refresh();
  };

  const statusLine = live
    ? meta?.waiting
      ? capitalized(describeWaiting(meta.waiting))
      : "Importing…"
    : status === "done"
      ? "Import done"
      : status === "failed"
        ? "Import failed"
        : status === "cancelled"
          ? "Import cancelled"
          : "Import interrupted";

  return (
    <section
      className="my-2 rounded-md border p-3"
      data-testid="import-progress"
      data-status={status}
      aria-labelledby="import-progress-heading"
    >
      {/* Polite, and one sentence per phase: never a line per step. */}
      <p className="sr-only" aria-live="polite" data-testid="import-announce">
        {announcement(meta, unfollowed)}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id="import-progress-heading" className="font-semibold">
          {statusLine}
        </h3>
        {elapsed !== undefined && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {durationText(Math.max(0, elapsed))}
          </span>
        )}
        {meta?.label && (
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {meta.label}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {live && !unfollowed && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cancelling}
              onClick={cancel}
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}
          {!unfollowed && (
            <Link
              href={`/jobs/${job}`}
              className="text-sm underline underline-offset-2"
            >
              Job details
            </Link>
          )}
        </span>
      </div>
      {unfollowed && (
        <p
          className="mt-1 text-sm text-muted-foreground"
          data-testid="import-unfollowed"
        >
          {live
            ? "This import can't be followed step by step: the editor could not write its job record (check the jobs directory). The form fills when it ends."
            : "Its steps were not recorded: the editor could not write its job record."}
        </p>
      )}
      {!live && status === "failed" && !formHasIt && meta?.error && (
        <p
          className="mt-1 border-l-2 border-destructive pl-2 text-sm"
          role="alert"
        >
          {meta.error.message}
        </p>
      )}
      {!live && status === "interrupted" && meta?.error && (
        <p className="mt-1 border-l-2 border-destructive pl-2 text-sm">
          {meta.error.message}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-1 text-sm" data-testid="import-warnings">
          {warnings.map((warning, index) => (
            <li
              key={`${index}-${warning}`}
              className="border-l-2 border-destructive pl-2"
            >
              {warning}
            </li>
          ))}
        </ul>
      )}
      {(cancelError || error) && (
        <p className="mt-1 border-l-2 border-destructive pl-2 text-sm">
          {cancelError ?? `Lost touch with the job: ${error}`}
        </p>
      )}
      {live ? (
        <div className="mt-2">
          <StepList steps={tree.steps} now={now} />
        </div>
      ) : tree.flat.length > 0 ? (
        <details
          className="mt-1 text-sm"
          onToggle={(event) => setShowSteps(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-muted-foreground">
            {tree.flat.length} {tree.flat.length === 1 ? "step" : "steps"}
          </summary>
          {showSteps && (
            <div className="mt-1">
              <StepList steps={tree.steps} now={now} />
            </div>
          )}
        </details>
      ) : null}
    </section>
  );
}
