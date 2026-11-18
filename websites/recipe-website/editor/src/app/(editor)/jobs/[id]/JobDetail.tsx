"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  buildStepTree,
  noteText,
  resultRows,
} from "recipe-editor/controller/jobs/timeline";
import {
  jobStory,
  secondsWords,
  timeSplit,
  whyWaiting,
  type SplitKey,
  type StorySentence,
} from "recipe-editor/controller/jobs/story";
import { kindTitle } from "recipe-editor/controller/jobs/attention";
import {
  KEPT_READING_KINDS,
  NOT_RETRIED_KINDS,
} from "recipe-editor/controller/jobs/listing";
import { jobOutcome } from "recipe-editor/controller/jobs/outcome";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import { costText } from "recipe-editor/controller/agent/conversation";
import { CuratorMarkdown } from "@/curator/CuratorMarkdown";
import { When } from "@/curator/time";
import { StepTimeline } from "@/jobs/StepTimeline";
import { requestCancel, useJobPoll } from "@/jobs/useJobPoll";
import { JobStatusBadge } from "../JobStatusBadge";

/** How often the page reads a live job (D7: every 2 s). */
const JOB_POLL_MS = 2_000;

/** The form kinds `/new-recipe?job=` reopens. */
const FORM_KINDS = new Set(["form-url", "form-text", "form-photo"]);

/** A finished fill's recipe (45b): its result names the slug. */
function fillSlug(result: unknown): string | undefined {
  const slug =
    result && typeof result === "object"
      ? (result as { slug?: unknown }).slug
      : undefined;
  return typeof slug === "string" && slug ? slug : undefined;
}

/** A curator run's model, from its result (`AgentJobResult.model`). */
function resultModel(result: unknown): string | undefined {
  const model =
    result && typeof result === "object"
      ? (result as { model?: unknown }).model
      : undefined;
  return typeof model === "string" && model ? model : undefined;
}

/** Why Retry is not offered, per kind (39b review, L6; 44c for a run). */
function notRetriedWords(kind: string, id: string) {
  switch (kind) {
    case "reindex":
      return "A rebuild is not retried: rebuild again from the Git page.";
    case "git-sync":
      return "A sync is not retried: use Sync now on the Git page.";
    case "agent":
      return (
        <>
          A curator run is not retried: its tools may already have written.{" "}
          <Link
            href={`/curator?run=${encodeURIComponent(id)}`}
            className="underline underline-offset-2"
          >
            Open it on the Curator page
          </Link>{" "}
          to follow up, or ask again.
        </>
      );
    default:
      return "This job is not retried.";
  }
}

/**
 * A curator run's answer (47h): the model's last words, as the Curator page
 * shows them — Markdown, no raw HTML — and how the run stopped.
 */
function AgentResult({ id, result }: { id: string; result: unknown }) {
  const text =
    result && typeof result === "object"
      ? (result as { text?: unknown }).text
      : undefined;
  return (
    <div className="space-y-2 text-sm" data-testid="job-result">
      {typeof text === "string" && text.trim() ? (
        <CuratorMarkdown>{text}</CuratorMarkdown>
      ) : (
        <p className="text-muted-foreground">
          The run ended without an answer.
        </p>
      )}
      <p>
        <Link
          href={`/curator?run=${encodeURIComponent(id)}`}
          className="underline underline-offset-2"
        >
          The whole run on the Curator page
        </Link>
      </p>
    </div>
  );
}

/** What a result says, whatever its kind: names, slugs, counts. */
function ResultSummary({ meta }: { meta: JobRecord }) {
  if (meta.kind === "agent") {
    return <AgentResult id={meta.id} result={meta.result} />;
  }
  const result = meta.result as
    | (Record<string, unknown> & {
        recipes?: unknown;
        warnings?: string[];
      })
    | undefined;
  if (!result || typeof result !== "object") return null;
  /* 47h: a page read that read nothing says so, and what it did see. */
  const outcome = jobOutcome(meta);
  const rows = resultRows(result);
  const name =
    (result.recipe as { name?: string } | undefined)?.name ??
    (result.draft as { name?: string } | undefined)?.name;
  const slug = typeof result.slug === "string" ? result.slug : undefined;
  const message =
    typeof result.message === "string" ? result.message : undefined;
  const pageTitle =
    outcome && result.meta && typeof result.meta === "object"
      ? (result.meta as { title?: unknown }).title
      : undefined;
  return (
    <div className="space-y-1 text-sm" data-testid="job-result">
      {outcome && (
        <p data-testid="job-outcome-note">
          {outcome.note}
          {typeof pageTitle === "string" && pageTitle.trim()
            ? ` The page's title: “${pageTitle.trim()}”.`
            : ""}
        </p>
      )}
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

/** A label to show as the page's title: a curator run's ask, unwrapped. */
function titleOf(label: string): string {
  const ask = /^(?:ask|follow-up): "(.*)"$/s.exec(label);
  return ask ? ask[1] : label;
}

/** The split's colours: tokens only, a wait hatched (B). */
const SPLIT_CLASS: Record<SplitKey, string> = {
  model: "bg-primary",
  wait: "bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_6px)] opacity-70",
  fetch: "bg-info",
  tools: "bg-primary/40",
  save: "bg-success",
  other: "bg-muted-foreground/25",
};

/** "Where the minute went" (B): the split bar, its legend, one sentence. */
function WhereTimeWent({
  lines,
  start,
  end,
  now,
}: {
  lines: Parameters<typeof timeSplit>[0];
  start: number;
  end?: number;
  now: number;
}) {
  const split = timeSplit(
    lines,
    { start, ...(end !== undefined ? { end } : {}) },
    now,
  );
  if (split.parts.length === 0) return null;
  return (
    <section
      aria-labelledby="job-split-heading"
      data-testid="job-split"
      className="flex flex-col gap-2.5 rounded-xl border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="job-split-heading"
          className="font-display text-lg font-semibold"
        >
          Where the {split.totalMs >= 90_000 ? "time" : "minute"} went
        </h2>
        <span className="font-mono text-lg tabular-nums">
          {secondsWords(split.totalMs)}
        </span>
      </div>
      <div aria-hidden className="flex h-5 overflow-hidden rounded-md bg-muted">
        {split.parts.map((part) => (
          <i
            key={part.key}
            className={cn("block h-full", SPLIT_CLASS[part.key])}
            style={{ width: `${(part.share * 100).toFixed(1)}%` }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {split.parts.map((part) => (
          <div
            key={part.key}
            data-part={part.key}
            className="flex min-w-0 flex-col-reverse"
          >
            <dt className="text-[13px] leading-[18px] text-muted-foreground">
              {part.label}
            </dt>
            <dd className="font-mono text-lg tabular-nums">
              {secondsWords(part.ms)}
            </dd>
          </div>
        ))}
      </dl>
      {split.note && (
        <p className="text-sm text-muted-foreground">{split.note}</p>
      )}
    </section>
  );
}

const DOT: Record<StorySentence["tone"], string> = {
  model: "border-primary bg-card",
  tool: "border-primary/45 bg-primary/45",
  step: "border-primary/45 bg-card",
  wait: "border-dashed border-muted-foreground bg-card",
  fail: "border-destructive bg-destructive",
  end: "border-success bg-success",
};

/** "What it did" (B): the story on a time rail. */
function Rail({ story }: { story: StorySentence[] }) {
  if (story.length === 0) {
    return <p className="text-sm text-muted-foreground">No steps yet.</p>;
  }
  return (
    <ol className="flex flex-col" data-testid="job-timeline">
      {story.map((line, index) => (
        <li
          key={`${line.step}-${index}`}
          data-step={line.step}
          data-status={line.status}
          className="relative grid grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] gap-x-3 pb-4 before:absolute before:top-[18px] before:bottom-0 before:left-[calc(3.25rem+0.75rem+0.5rem-1px)] before:w-0.5 before:bg-border last:before:hidden sm:grid-cols-[4rem_1.25rem_minmax(0,1fr)_auto] sm:before:left-[calc(4rem+0.75rem+0.5rem-1px)]"
        >
          <span className="text-right font-mono text-xs leading-5 tabular-nums text-muted-foreground">
            {secondsWords(line.atMs)}
          </span>
          <span
            aria-hidden
            className={cn(
              "relative z-10 mt-1 ml-1 size-3 rounded-full border-2",
              DOT[line.tone],
              line.status === "running" && "motion-safe:animate-pulse",
            )}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <b className="text-[15px] leading-5 font-semibold [overflow-wrap:anywhere]">
              {line.title}
              {line.status === "running" ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  — now
                </span>
              ) : null}
            </b>
            {line.detail && (
              <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {line.detail}
              </span>
            )}
            {line.waitShare !== undefined && (
              <i
                aria-hidden
                className="mt-1 block h-2 rounded-full bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_6px)] opacity-60"
                style={{ width: `${Math.max(4, line.waitShare * 100)}%` }}
              />
            )}
            {line.aside && (
              <span className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-[13px] leading-[18px]">
                {line.aside}
              </span>
            )}
          </span>
          <span className="hidden text-right font-mono text-xs leading-5 tabular-nums text-muted-foreground sm:block">
            {line.ms !== undefined && line.ms >= 1 && line.step !== "job"
              ? line.ms < 1_000
                ? `${Math.round(line.ms)} ms`
                : secondsWords(line.ms)
              : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The model's numbers over the whole job: tokens out, a run's cost. */
function modelTotals(lines: Parameters<typeof buildStepTree>[0]) {
  let outputTokens = 0;
  let cost = 0;
  let calls = 0;
  for (const node of buildStepTree(lines).flat) {
    const { data } = node;
    if (typeof data.outputTokens === "number") {
      outputTokens += data.outputTokens;
      calls += 1;
    }
    if (typeof data.costEstimateUsd === "number") cost += data.costEstimateUsd;
  }
  return { outputTokens, cost, calls };
}

/**
 * One job, variant B (48c): what it is and how it ended, Cancel while it
 * runs and Retry once it ended; **Where the minute went** (`timeSplit`);
 * **What it did** — the step log as sentences on a time rail
 * (`jobStory`); beside it the result, the warnings, and **For the
 * curious**: the model's numbers, the process, every step to scale, the
 * raw JSONL. Reads `GET /api/jobs/<id>` every 2 s while the job is live.
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
  /* 39a: Retry reads the source again, past the kept reading. */
  const [fresh, setFresh] = useState(false);
  const offersFresh = KEPT_READING_KINDS.includes(kind);
  /* 39b review (L6): a rebuild or a sync is run anew, never replayed. */
  const retryable = !(NOT_RETRIED_KINDS as readonly string[]).includes(kind);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);

  const tree = buildStepTree(lines);
  const start = meta?.startedAt ?? meta?.queuedAt ?? tree.root?.startedAt;
  const warnings = [
    ...(meta?.error?.warnings ?? []),
    ...(((meta?.result as { warnings?: unknown } | undefined)?.warnings ??
      []) as string[]),
  ];
  const noteWarnings = tree.warnings.map(noteText);
  const outcome = meta ? jobOutcome(meta) : undefined;
  const model = resultModel(meta?.result);
  const story =
    meta && start !== undefined
      ? jobStory(
          lines,
          {
            kind,
            status: meta.status,
            start,
            ...(meta.endedAt !== undefined ? { end: meta.endedAt } : {}),
            ...(meta.error
              ? {
                  error: { code: meta.error.code, message: meta.error.message },
                }
              : {}),
            ...(model ? { model } : {}),
            ...(outcome ? { nothing: outcome.note } : {}),
          },
          now,
        )
      : [];
  const why =
    live && meta ? whyWaiting({ ...meta, id }, lines, [], now) : undefined;
  const totals = modelTotals(lines);

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
        offersFresh && fresh
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ fresh: true }),
            }
          : { method: "POST" },
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          <Link href="/jobs" className="underline underline-offset-2">
            ← Jobs
          </Link>
        </p>
        <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          {kindTitle(kind)}
          {model ? ` · ${model}` : ""}
          {meta ? (
            <>
              {" · "}
              <When epoch={meta.startedAt ?? meta.queuedAt} />
            </>
          ) : null}
        </p>
        <h1 className="max-w-[56rem] font-display text-2xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
          {titleOf(label)}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <JobStatusBadge
            status={meta?.status ?? "running"}
            nothing={outcome !== undefined}
          />
          {meta?.error && meta.status !== "done" && (
            <span className="[overflow-wrap:anywhere]">
              {meta.error.message}
            </span>
          )}
          <span className="flex-1" />
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
          ) : meta && !retryable ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="job-not-retried"
            >
              {notRetriedWords(kind, id)}
            </p>
          ) : meta ? (
            <>
              {offersFresh && (
                /* 39a: past the half-hour kept reading (38c). */
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={fresh}
                    onChange={(event) => setFresh(event.target.checked)}
                  />
                  {kind === "import-photo"
                    ? "Read the photos again"
                    : "Read it again"}
                  <span className="text-muted-foreground">
                    — not the kept reading
                  </span>
                </label>
              )}
              <Button
                type="button"
                size="sm"
                disabled={acting !== undefined}
                onClick={retry}
              >
                {acting === "retry" ? "Starting…" : "Retry"}
              </Button>
            </>
          ) : null}
          {!live && meta?.result !== undefined && FORM_KINDS.has(kind) && (
            <Link
              href={`/new-recipe?job=${id}`}
              className="text-sm underline underline-offset-2"
            >
              Open in the form
            </Link>
          )}
          {/* 45b: a fill reopens on its recipe's edit page, its marks with it. */}
          {!live && kind === "fill" && fillSlug(meta?.result) && (
            <Link
              href={`/recipe/${encodeURIComponent(fillSlug(meta?.result)!)}/edit?fill=${id}`}
              className="text-sm underline underline-offset-2"
            >
              Open in the form
            </Link>
          )}
        </div>
        {why && (
          <p
            className="rounded-md bg-muted px-2.5 py-2 text-sm"
            data-testid="job-why"
          >
            <b className="font-medium">{why.lead}</b>
            {why.rest ? ` ${why.rest}` : ""}
          </p>
        )}
        {liveRetry && (
          <p className="text-sm" role="status" data-testid="job-live-retry">
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
            className="border-l-2 border-destructive pl-2 text-sm"
            role="alert"
          >
            {actionError}
          </p>
        )}
        {error && (
          <p className="border-l-2 border-destructive pl-2 text-sm">
            Could not read the job: {error}
          </p>
        )}
      </div>

      {meta && start !== undefined && (
        <WhereTimeWent
          lines={lines}
          start={start}
          {...(meta.endedAt !== undefined ? { end: meta.endedAt } : {})}
          now={now}
        />
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <section
          aria-labelledby="job-steps-heading"
          className="flex min-w-0 flex-col gap-3"
        >
          <h2
            id="job-steps-heading"
            className="font-display text-xl font-semibold"
          >
            What it did
          </h2>
          {meta && start !== undefined ? (
            <Rail story={story} />
          ) : (
            <p className="text-sm text-muted-foreground">Reading…</p>
          )}
          {kind === "agent" && story.length > 0 && (
            <p className="text-xs text-muted-foreground">
              The model&apos;s turns between tool calls are folded into the line
              after them; every step is under “For the curious”.
            </p>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          {meta?.result !== undefined && (
            <section
              aria-labelledby="job-result-heading"
              className="flex flex-col gap-2 rounded-xl border bg-card p-4"
            >
              <h2
                id="job-result-heading"
                className="font-display text-base font-semibold"
              >
                {kind === "agent" ? "The answer" : "Result"}
              </h2>
              <ResultSummary meta={meta} />
            </section>
          )}

          {(warnings.length > 0 || noteWarnings.length > 0) && (
            <section
              aria-labelledby="job-warnings-heading"
              className="flex flex-col gap-2 rounded-xl border bg-card p-4"
            >
              <h2
                id="job-warnings-heading"
                className="font-display text-base font-semibold"
              >
                Warnings
              </h2>
              <ul className="list-disc pl-5 text-sm" data-testid="job-warnings">
                {[...new Set([...warnings, ...noteWarnings])].map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          <section
            aria-labelledby="job-curious-heading"
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <h2
              id="job-curious-heading"
              className="font-display text-base font-semibold"
            >
              For the curious
            </h2>
            {meta && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                {totals.calls > 0 && (
                  <>
                    <dt className="text-muted-foreground">Model out</dt>
                    <dd className="font-mono">
                      {totals.outputTokens.toLocaleString("en-US")} tokens ·{" "}
                      {totals.calls} {totals.calls === 1 ? "call" : "calls"}
                    </dd>
                  </>
                )}
                {totals.cost > 0 && (
                  <>
                    <dt className="text-muted-foreground">Cost</dt>
                    <dd className="font-mono">{costText(totals.cost)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Started</dt>
                <dd>
                  <When epoch={meta.startedAt ?? meta.queuedAt} />
                </dd>
                {meta.endedAt !== undefined && (
                  <>
                    <dt className="text-muted-foreground">Ended</dt>
                    <dd>
                      <When epoch={meta.endedAt} />
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Process</dt>
                <dd>
                  pid {meta.pid} on {meta.host}, {meta.tier}
                </dd>
                <dt className="text-muted-foreground">Kind</dt>
                <dd className="font-mono">{kind}</dd>
                <dt className="text-muted-foreground">Job</dt>
                <dd className="font-mono [overflow-wrap:anywhere]">{id}</dd>
                {meta.retryOf && (
                  <>
                    <dt className="text-muted-foreground">Runs again</dt>
                    <dd className="font-mono [overflow-wrap:anywhere]">
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
            {start !== undefined && meta && tree.steps.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Every step, to scale
                </summary>
                <div className="mt-2">
                  <StepTimeline
                    steps={tree.steps}
                    start={start}
                    {...(meta.endedAt !== undefined
                      ? { end: meta.endedAt }
                      : {})}
                    now={now}
                  />
                </div>
              </details>
            )}
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
          </section>
        </aside>
      </div>
    </div>
  );
}
