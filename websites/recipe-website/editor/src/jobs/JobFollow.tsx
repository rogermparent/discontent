"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  buildStepTree,
  describeWaiting,
  durationText,
} from "recipe-editor/controller/jobs/timeline";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import { StepList } from "./StepList";
import { useJobPoll } from "./useJobPoll";

/** How often a followed job is read (as the form's panel: every second). */
export const FOLLOW_POLL_MS = 1_000;

/**
 * One job's live steps, for a surface that waits on a job it started (38b:
 * the roundup picker's chunks) — what it is doing and for how long, where
 * it waits in the queue, a "Job details" link — read through `useJobPoll`.
 * Once the job ends, `onEnded` is called once (with the record, or with
 * why it could not be read) and the steps fold to a line, a click away.
 * The surface shows the outcome itself; this shows only the work.
 */
export function JobFollow({
  job,
  title,
  testId = "job-follow",
  onEnded,
}: {
  job: string;
  /** What the job is doing, as a heading: "Listing the roundup". */
  title: string;
  testId?: string;
  onEnded?: (meta: JobRecord | undefined, error?: string) => void;
}) {
  const { meta, lines, live, error } = useJobPoll(job, FOLLOW_POLL_MS);
  const [now, setNow] = useState(() => Date.now());
  const [showSteps, setShowSteps] = useState(false);
  const told = useRef<string | undefined>(undefined);

  /* The running step's clock ticks between reads. */
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [live]);

  const ended = !live && (!!meta || !!error);
  useEffect(() => {
    if (!ended || told.current === job) return;
    told.current = job;
    onEnded?.(meta, error);
  }, [ended, job, meta, error, onEnded]);

  const tree = buildStepTree(lines);
  const started = meta?.startedAt ?? meta?.queuedAt;
  const elapsed =
    started === undefined ? undefined : (meta?.endedAt ?? now) - started;
  const waiting = live && meta?.waiting ? describeWaiting(meta.waiting) : "";

  return (
    <section
      className="rounded-md border p-2 text-sm"
      data-testid={testId}
      data-status={meta?.status ?? "running"}
      aria-label={title}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{title}</span>
        {elapsed !== undefined && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {durationText(Math.max(0, elapsed))}
          </span>
        )}
        {waiting && <span className="text-muted-foreground">{waiting}</span>}
        <Link
          href={`/jobs/${job}`}
          className="ml-auto underline underline-offset-2"
          target="_blank"
          rel="noopener"
        >
          Job details
        </Link>
      </div>
      {live ? (
        <div className="mt-1">
          <StepList steps={tree.steps} now={now} testId={`${testId}-steps`} />
        </div>
      ) : tree.flat.length > 0 ? (
        <details
          className="mt-1"
          onToggle={(event) => setShowSteps(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-muted-foreground">
            {tree.flat.length} {tree.flat.length === 1 ? "step" : "steps"}
          </summary>
          {showSteps && (
            <div className="mt-1">
              <StepList
                steps={tree.steps}
                now={now}
                testId={`${testId}-steps`}
              />
            </div>
          )}
        </details>
      ) : null}
    </section>
  );
}
