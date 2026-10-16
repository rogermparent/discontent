"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { PageHeading } from "recipe-website-common/components/PageLayout";
import {
  buildStepTree,
  describeWaiting,
  durationText,
  noteText,
  resultRows,
} from "recipe-editor/controller/jobs/timeline";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import { StepTimeline } from "@/jobs/StepTimeline";
import { requestCancel, useJobPoll } from "@/jobs/useJobPoll";
import { JobStatusBadge, formatWhen } from "../JobStatusBadge";

/** How often the page reads a live job (D7: every 2 s). */
const JOB_POLL_MS = 2_000;

/** The form kinds `/new-recipe?job=` reopens. */
const FORM_KINDS = new Set(["form-url", "form-text", "form-photo"]);

/** What a result says, whatever its kind: names, slugs, counts. */
function ResultSummary({ meta }: { meta: JobRecord }) {
  const result = meta.result as
    | (Record<string, unknown> & {
        recipes?: unknown;
        warnings?: string[];
      })
    | undefined;
  if (!result || typeof result !== "object") return null;
  const rows = resultRows(result);
  const name =
    (result.recipe as { name?: string } | undefined)?.name ??
    (result.draft as { name?: string } | undefined)?.name;
  const slug = typeof result.slug === "string" ? result.slug : undefined;
  const message =
    typeof result.message === "string" ? result.message : undefined;
  return (
    <div className="space-y-1 text-sm" data-testid="job-result">
      {slug && (
        <p>
          Wrote{" "}
          <Link
            href={`/recipe/${slug}`}
            className="underline underline-offset-2"
          >
            {slug}
          </Link>
          {result.dryRun === true ? " (a dry run: nothing written)" : ""}
        </p>
      )}
      {!slug && name && <p>Read “{name}”.</p>}
      {message && <p>{message}</p>}
      {rows && rows.length > 0 && (
        <ul className="list-disc pl-5">
          {rows.map((row, index) => (
            <li key={`${row.n ?? index}`}>
              {row.name}
              {row.status ? ` — ${row.status}` : ""}
              {row.slug &&
              (row.status === "imported" || row.status === "existing") ? (
                <>
                  {" "}
                  <Link
                    href={`/recipe/${row.slug}`}
                    className="underline underline-offset-2"
                  >
                    {row.slug}
                  </Link>
                </>
              ) : null}
              {row.error?.message ? <span> ({row.error.message})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One job, live (37c): the header (status, times, process), Cancel while it
 * runs and Retry once it ended, the warnings, what it answered, the step
 * timeline and the raw JSONL. Reads `GET /api/jobs/<id>` every 2 s while
 * the job is live.
 */
export function JobDetail({
  id,
  kind,
  label,
}: {
  id: string;
  kind: string;
  label: string;
}) {
  const router = useRouter();
  const { meta, lines, live, error, refresh } = useJobPoll(id, JOB_POLL_MS);
  /* Safe on the server: nothing timed is drawn before the first read. */
  const [now, setNow] = useState(() => Date.now());
  const [acting, setActing] = useState<"cancel" | "retry" | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  /* A refused retry's live job (`job_live`): the one to follow instead. */
  const [liveRetry, setLiveRetry] = useState<string | undefined>();

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);

  const tree = buildStepTree(lines);
  const start = meta?.startedAt ?? meta?.queuedAt ?? tree.root?.startedAt;
  const duration =
    start === undefined ? undefined : (meta?.endedAt ?? now) - start;
  const warnings = [
    ...(meta?.error?.warnings ?? []),
    ...(((meta?.result as { warnings?: unknown } | undefined)?.warnings ??
      []) as string[]),
  ];
  const noteWarnings = tree.warnings.map(noteText);

  const cancel = async () => {
    setActing("cancel");
    setActionError(await requestCancel(id));
    setActing(undefined);
    refresh();
  };

  const retry = async () => {
    setActing("retry");
    setActionError(undefined);
    setLiveRetry(undefined);
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(id)}/retry`,
        {
          method: "POST",
        },
      );
      const body = (await response.json()) as
        | { job: string }
        | { error: { code?: string; message: string; job?: string } };
      if (!response.ok || "error" in body) {
        if (
          "error" in body &&
          body.error.code === "job_live" &&
          body.error.job
        ) {
          setLiveRetry(body.error.job);
        } else {
          setActionError(
            "error" in body ? body.error.message : `${response.status}`,
          );
        }
        setActing(undefined);
        return;
      }
      router.push(`/jobs/${body.job}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
      setActing(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-sm">
          <Link href="/jobs" className="underline underline-offset-2">
            ← All jobs
          </Link>
        </p>
        <PageHeading>{label}</PageHeading>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <JobStatusBadge status={meta?.status ?? "running"} />
          <span className="font-mono text-xs">{kind}</span>
          <span className="font-mono text-xs text-muted-foreground">{id}</span>
          {duration !== undefined && (
            <span className="font-mono text-xs tabular-nums">
              {durationText(Math.max(0, duration))}
            </span>
          )}
        </div>
        {meta && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm text-muted-foreground">
            <dt>Started</dt>
            <dd suppressHydrationWarning>
              {formatWhen(meta.startedAt ?? meta.queuedAt)}
            </dd>
            {meta.endedAt !== undefined && (
              <>
                <dt>Ended</dt>
                <dd suppressHydrationWarning>{formatWhen(meta.endedAt)}</dd>
              </>
            )}
            <dt>Process</dt>
            <dd>
              pid {meta.pid} on {meta.host}, {meta.tier}
            </dd>
            {meta.retryOf && (
              <>
                <dt>Runs again</dt>
                <dd>
                  <Link
                    href={`/jobs/${meta.retryOf}`}
                    className="underline underline-offset-2"
                  >
                    {meta.retryOf}
                  </Link>
                </dd>
              </>
            )}
          </dl>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {live && meta?.cancellable === false ? (
            <p className="text-sm" data-testid="job-not-cancellable">
              Past the point a cancel can stop it — it runs to its end.
            </p>
          ) : live ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={acting !== undefined}
              onClick={cancel}
            >
              {acting === "cancel" ? "Cancelling…" : "Cancel"}
            </Button>
          ) : meta ? (
            <Button
              type="button"
              size="sm"
              disabled={acting !== undefined}
              onClick={retry}
            >
              {acting === "retry" ? "Starting…" : "Retry"}
            </Button>
          ) : null}
          {!live && meta?.result !== undefined && FORM_KINDS.has(kind) && (
            <Link
              href={`/new-recipe?job=${id}`}
              className="text-sm underline underline-offset-2"
            >
              Open in the form
            </Link>
          )}
        </div>
        {liveRetry && (
          <p
            className="mt-2 text-sm"
            role="status"
            data-testid="job-live-retry"
          >
            {liveRetry === id ? (
              "This job is still running: it can run again once it has ended."
            ) : (
              <>
                Already running again as{" "}
                <Link
                  href={`/jobs/${liveRetry}`}
                  className="underline underline-offset-2"
                >
                  {liveRetry}
                </Link>
                .
              </>
            )}
          </p>
        )}
        {actionError && (
          <p
            className="mt-2 border-l-2 border-destructive pl-2 text-sm"
            role="alert"
          >
            {actionError}
          </p>
        )}
        {error && (
          <p className="mt-2 border-l-2 border-destructive pl-2 text-sm">
            Could not read the job: {error}
          </p>
        )}
        {live && meta?.waiting && (
          <p className="mt-2 text-sm">
            {describeWaiting(meta.waiting)[0].toUpperCase() +
              describeWaiting(meta.waiting).slice(1)}
          </p>
        )}
      </div>

      {meta?.error && meta.status !== "done" && (
        <section aria-labelledby="job-error-heading">
          <h2 id="job-error-heading" className="mb-1 text-lg font-semibold">
            {meta.status === "cancelled" ? "Cancelled" : "Error"}
          </h2>
          <p className="text-sm">
            <span className="font-mono text-xs">{meta.error.code}</span>{" "}
            {meta.error.message}
          </p>
        </section>
      )}

      {(warnings.length > 0 || noteWarnings.length > 0) && (
        <section aria-labelledby="job-warnings-heading">
          <h2 id="job-warnings-heading" className="mb-1 text-lg font-semibold">
            Warnings
          </h2>
          <ul className="list-disc pl-5 text-sm" data-testid="job-warnings">
            {[...new Set([...warnings, ...noteWarnings])].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {meta?.result !== undefined && (
        <section aria-labelledby="job-result-heading">
          <h2 id="job-result-heading" className="mb-1 text-lg font-semibold">
            Result
          </h2>
          <ResultSummary meta={meta} />
        </section>
      )}

      <section aria-labelledby="job-steps-heading">
        <h2 id="job-steps-heading" className="mb-2 text-lg font-semibold">
          Steps
        </h2>
        {start !== undefined && meta ? (
          <StepTimeline
            steps={tree.steps}
            start={start}
            {...(meta?.endedAt !== undefined ? { end: meta.endedAt } : {})}
            now={now}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Reading…</p>
        )}
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer">
          Raw log ({lines.length} {lines.length === 1 ? "line" : "lines"})
        </summary>
        <pre
          className="mt-2 max-h-[32rem] overflow-auto rounded-md bg-muted p-2 font-mono text-xs"
          data-testid="job-raw-log"
          tabIndex={0}
        >
          {lines.map((line) => JSON.stringify(line)).join("\n")}
        </pre>
      </details>
    </div>
  );
}
