"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CircleAlert,
  ClipboardPaste,
  Database,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  RefreshCw,
  SearchX,
  Sparkles,
} from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { Segmented } from "recipe-website-common/components/TagPage/parts";
import {
  attentionGroups,
  didNotWork,
  dismissalKey,
  foldRounds,
  jobName,
  jobState,
  kindGroup,
  kindTitle,
  siteOf,
  type AttentionGroup,
  type HistoryRow,
  type KindFilter,
} from "recipe-editor/controller/jobs/attention";
import {
  liveStrip,
  whyWaiting,
  type StripItem,
} from "recipe-editor/controller/jobs/story";
import {
  durationText,
  placeInLine,
  resourceName,
} from "recipe-editor/controller/jobs/timeline";
import type {
  BoardJob,
  JobsBoard as Board,
  QueueEntryView,
  ResourceView,
} from "recipe-editor/controller/jobs/views";
import { costText } from "recipe-editor/controller/agent/conversation";
import { When, useHydrated } from "@/curator/time";
import { requestCancel } from "@/jobs/useJobPoll";
import { JobStatusBadge } from "./JobStatusBadge";

/** How often the page reads while anything is live (D7: every 2 s). */
export const JOBS_POLL_MS = 2_000;

/**
 * How often it reads while all is idle (38b): a job another process starts
 * — a CLI import, an agent's — shows within this, with no Refresh.
 */
export const JOBS_IDLE_POLL_MS = 10_000;

/** Where a viewer's dismissed "Needs a look" groups are kept (this browser). */
const DISMISSED_KEY = "recipe-editor:jobs-dismissed";

/* The tab's visibility, as React reads an outside store. */
function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const tabHidden = () => document.hidden;
const serverTabHidden = () => false;

const LIVE = new Set(["queued", "running"]);

function anyLive(board: Board): boolean {
  return (
    board.jobs.some((job) => LIVE.has(job.status)) ||
    board.queue.some((resource) => resource.holder || resource.waiters.length)
  );
}

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function writeDismissed(list: string[]) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* A private window: the dismissal lasts for this visit only. */
  }
}

/** A resource as a line's name: "GPU", "yt-dlp", a site, a repository. */
function lineTitle(resource: string): string {
  const name = resourceName(resource);
  return name === "the GPU" ? "GPU" : name.replace(/^the /, "");
}

/** The icon for a kind of job (decor: the row's words say what it is). */
function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const props = { className: cn("size-4", className), "aria-hidden": true };
  if (
    kind === "agent" ||
    kind === "fill" ||
    kind === "choices" ||
    kind === "edit"
  ) {
    return <Sparkles {...props} />;
  }
  if (kind === "inspect" || kind === "inspect-list") return <Eye {...props} />;
  if (kind === "reindex") return <Database {...props} />;
  if (kind === "git-sync") return <RefreshCw {...props} />;
  if (kind.endsWith("-text")) return <ClipboardPaste {...props} />;
  if (kind.endsWith("-photo")) return <ImageIcon {...props} />;
  if (kind === "form-batch" || kind === "import-list") {
    return <FileText {...props} />;
  }
  return <Link2 {...props} />;
}

/** A row's state word, coloured by the tokens (the word carries it). */
function StateWord({ word, tone }: { word: string; tone: string }) {
  return (
    <span
      className={cn(
        "font-mono text-xs font-medium whitespace-nowrap",
        tone === "ok" && "text-success",
        tone === "none" && "text-warning",
        tone === "fail" && "text-destructive",
        tone === "stopped" && "text-muted-foreground",
      )}
    >
      {word}
    </span>
  );
}

/** "Mon 9 Nov": UTC on the server and while hydrating, the reader's day after. */
function dayText(epoch: number, local: boolean, now?: number): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(local ? {} : { timeZone: "UTC" }),
  };
  const text = new Date(epoch).toLocaleDateString("en-GB", options);
  if (!local || now === undefined) return text;
  const same = new Date(epoch).toDateString() === new Date(now).toDateString();
  return same ? `Today · ${text}` : text;
}

/* ------------------------------------------------------------------ */
/* Now                                                                  */
/* ------------------------------------------------------------------ */

function Strip({ items }: { items: StripItem[] }) {
  if (items.length === 0) return null;
  return (
    <ol
      aria-label="Steps so far"
      className="flex flex-wrap items-center gap-y-1 text-sm"
    >
      {items.map((item, index) => (
        <li
          key={`${item.step}-${index}`}
          data-step={item.step}
          data-status={item.status}
          className={cn(
            "inline-flex min-h-7 items-center gap-1.5",
            item.status === "now"
              ? "font-semibold text-foreground"
              : item.status === "failed"
                ? "text-foreground"
                : "text-foreground/90",
            index > 0 &&
              "before:mx-1.5 before:inline-block before:h-px before:w-4 before:bg-border",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
              item.status === "ok" && "border-success",
              item.status === "failed" && "border-destructive bg-destructive",
              item.status === "now" &&
                "border-info shadow-[0_0_0_3px] shadow-info/20 after:size-2 after:rounded-full after:bg-info",
            )}
          />
          {item.title}
          {item.status === "now" ? (
            <span className="sr-only">, now</span>
          ) : item.status === "failed" ? (
            <span className="sr-only">, failed</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function LiveCard({
  job,
  lines,
  queue,
  now,
  onChanged,
}: {
  job: BoardJob;
  lines: Board["live"][number]["lines"];
  queue: ResourceView[];
  now?: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const start = job.startedAt ?? job.queuedAt;
  const storyJob = { kind: job.kind, status: job.status, start };
  const strip = liveStrip(lines, storyJob, now);
  /* The sentence needs the reader's clock: none on the server's render. */
  const why =
    now !== undefined ? whyWaiting(job, lines, queue, now) : undefined;
  const queued = job.status === "queued";
  const stop = async () => {
    setBusy(true);
    setError(await requestCancel(job.id));
    setBusy(false);
    onChanged();
  };
  return (
    <article
      data-live-job={job.id}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-card p-4",
        !queued && "border-info/45",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {kindTitle(job.kind)}
            {job.model ? ` · ${job.model}` : ""}
            {queued ? " · queued" : ""}
          </p>
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-tight [overflow-wrap:anywhere]">
            <Link
              href={`/jobs/${job.id}`}
              className="underline-offset-2 hover:underline"
            >
              {jobName(job)}
            </Link>
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {now !== undefined && (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {durationText(Math.max(0, now - start))}
            </span>
          )}
          {job.cancellable !== false && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-label={`${queued ? "Cancel" : "Stop"} “${jobName(job)}”`}
              onClick={stop}
            >
              {queued ? "Cancel" : "Stop"}
            </Button>
          )}
        </div>
      </div>
      <Strip items={strip} />
      {why && (
        <p
          data-testid="job-why"
          className="rounded-md bg-muted px-2.5 py-2 text-sm"
        >
          <b className="font-medium">{why.lead}</b>
          {why.rest ? ` ${why.rest}` : ""}
          {why.untilAt !== undefined && (
            <>
              {" "}
              Next request at{" "}
              <time dateTime={new Date(why.untilAt).toISOString()}>
                {new Date(why.untilAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              .
            </>
          )}
        </p>
      )}
      {error && (
        <p className="border-l-2 border-destructive pl-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Needs a look                                                         */
/* ------------------------------------------------------------------ */

function LookGroup({
  group,
  onDismiss,
}: {
  group: AttentionGroup;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);
  const listId = `look-${group.key.replace(/[^a-z0-9]+/gi, "-")}`;
  const Icon = group.key === "gone" ? SearchX : CircleAlert;
  const resolved = group.resolved.filter((item) => item.resolvedBy);
  return (
    <div
      data-group={group.key}
      className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b py-3.5 last:border-b-0 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto]"
    >
      <span
        aria-hidden
        className="inline-flex size-7 items-center justify-center rounded-md bg-warning/15 text-warning"
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-[15px] leading-[22px] font-semibold">
          {group.title}
        </h3>
        <p className="text-sm text-muted-foreground">{group.detail}</p>
        {resolved.length > 0 && (
          <p className="text-sm">
            <span className="mr-1.5 font-mono text-xs font-medium text-success">
              {resolved.some((item) => item.resolvedBy!.kind.endsWith("-text"))
                ? "pasted"
                : "read later"}
            </span>
            {resolved.length === 1 ? "Later it went in as " : "Later: "}
            {resolved.map((item, index) => (
              <span key={item.job.id}>
                {index > 0 ? ", " : ""}
                <Link
                  href={`/jobs/${item.resolvedBy!.id}`}
                  className="underline underline-offset-2"
                >
                  {jobName(item.resolvedBy!)}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
        {"show" in group.next && shown && (
          <ul id={listId} className="mt-1 flex flex-col gap-1 text-sm">
            {group.open.map(({ job }) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="underline underline-offset-2 [overflow-wrap:anywhere]"
                >
                  {job.url ?? jobName(job)}
                </Link>{" "}
                <span className="text-muted-foreground">
                  · {kindTitle(job.kind)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap gap-2 sm:col-start-3">
        {"href" in group.next ? (
          <Button asChild size="sm">
            <Link href={group.next.href}>{group.next.label}</Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={shown}
            aria-controls={listId}
            onClick={() => setShown((open) => !open)}
          >
            {shown ? "Hide them" : group.next.label}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                              */
/* ------------------------------------------------------------------ */

const ROW =
  "grid min-h-13 grid-cols-[3.25rem_1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b py-2 sm:grid-cols-[3.25rem_1.75rem_minmax(0,1fr)_auto_4rem]";

function JobRow({ job, nested = false }: { job: BoardJob; nested?: boolean }) {
  const state = jobState(job);
  const site = siteOf(job.url);
  return (
    <div
      data-job={job.id}
      data-kind={job.kind}
      className={cn(ROW, "relative", nested && "pl-0")}
    >
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        <When epoch={job.startedAt ?? job.queuedAt} timeOnly />
      </span>
      <span className="inline-flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <KindIcon kind={job.kind} />
      </span>
      <span className="flex min-w-0 flex-col">
        <Link
          href={`/jobs/${job.id}`}
          className="truncate text-[15px] leading-5 font-semibold after:absolute after:inset-0 hover:underline"
        >
          {jobName(job)}
        </Link>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {[kindTitle(job.kind), job.name ? site : undefined]
            .filter(Boolean)
            .join(" · ")}
          {job.error && job.status !== "cancelled"
            ? ` · ${job.error.message}`
            : job.outcome
              ? ` · ${job.outcome.note}`
              : ""}
        </span>
      </span>
      <span className="relative">
        <JobStatusBadge
          status={job.status}
          nothing={job.outcome?.kind === "nothing"}
        />
        <span className="sr-only">{` ${state.word}`}</span>
      </span>
      <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {durationText(job.durationMs)}
      </span>
    </div>
  );
}

function RoundRow({ row }: { row: HistoryRow }) {
  return (
    <details data-round={row.key} data-kind={row.kind} className="group">
      <summary
        className={cn(
          ROW,
          "cursor-pointer list-none hover:bg-accent/40 [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          <When epoch={row.at} timeOnly />
        </span>
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <KindIcon kind={row.kind} />
        </span>
        <span className="flex min-w-0 flex-col">
          <b className="truncate text-[15px] leading-5 font-semibold">
            {row.title}
          </b>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {row.detail}
          </span>
        </span>
        <StateWord word={row.state} tone={row.tone} />
        <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
          {durationText(row.durationMs)}
        </span>
      </summary>
      <div className="border-b bg-muted/40 pl-4">
        {row.jobs.map((job) => (
          <JobRow key={job.id} job={job as BoardJob} nested />
        ))}
      </div>
    </details>
  );
}

const FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "imports", label: "Imports" },
  { id: "inspects", label: "Inspects" },
  { id: "curator", label: "Curator" },
  { id: "repo", label: "Repository" },
];

function History({
  jobs,
  more,
  total,
  eachRow: initialEachRow,
}: {
  jobs: BoardJob[];
  more: boolean;
  total: number;
  eachRow: boolean;
}) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [eachRow, setEachRow] = useState(initialEachRow);
  const local = useHydrated();
  const [now, setNow] = useState<number | undefined>();
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);
  const shown = jobs.filter(
    (job) =>
      !LIVE.has(job.status) &&
      (filter === "all" || kindGroup(job.kind) === filter),
  );
  const rows: HistoryRow[] = eachRow
    ? foldRounds(shown, -Infinity)
    : foldRounds(shown);
  /* Rows by day: the reader's day once hydrated (UTC before, as `When`). */
  const days: { day: string; rows: HistoryRow[] }[] = [];
  for (const row of rows) {
    const day = dayText(row.at, local, now);
    const last = days.at(-1);
    if (last && last.day === day) last.rows.push(row);
    else days.push({ day, rows: [row] });
  }
  return (
    <section
      aria-labelledby="jobs-history-heading"
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="jobs-history-heading"
          className="font-display text-xl font-semibold"
        >
          History{" "}
          <small className="text-sm font-normal text-muted-foreground">
            {shown.length} {shown.length === 1 ? "job" : "jobs"}
            {rows.length !== shown.length ? ` in ${rows.length} rows` : ""} ·
            kept 14 days
          </small>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Show"
            testId="jobs-filter"
            value={filter}
            onChange={setFilter}
            options={FILTERS}
          />
          <label className="flex min-h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={eachRow}
              onChange={(event) => setEachRow(event.target.checked)}
            />
            One row per job
          </label>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs.</p>
      ) : (
        <div data-testid="job-list" className="flex flex-col">
          {days.map(({ day, rows: dayRows }) => (
            <div key={day} className="flex flex-col">
              <p className="border-b pt-4 pb-1.5 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
                {day}
              </p>
              {dayRows.map((row) =>
                row.jobs.length === 1 ? (
                  <JobRow key={row.key} job={row.jobs[0] as BoardJob} />
                ) : (
                  <RoundRow key={row.key} row={row} />
                ),
              )}
            </div>
          ))}
        </div>
      )}
      {more && (
        <p className="text-xs text-muted-foreground">
          {total - jobs.length} older not shown.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The machine                                                          */
/* ------------------------------------------------------------------ */

function EntryWords({ entry, now }: { entry: QueueEntryView; now?: number }) {
  const who = entry.jobId ? (
    entry.label ? (
      <Link
        href={`/jobs/${entry.jobId}`}
        className="underline underline-offset-2 [overflow-wrap:anywhere]"
      >
        {entry.kind ? kindTitle(entry.kind) : entry.label}
      </Link>
    ) : (
      <span>
        a job from pid {entry.pid} on {entry.host}
      </span>
    )
  ) : (
    <span>
      {entry.purpose ?? "a call outside a job"} (pid {entry.pid} on {entry.host}
      )
    </span>
  );
  return (
    <span>
      {who}
      {entry.label && entry.kind ? (
        <span className="text-muted-foreground"> · {entry.label}</span>
      ) : null}
      {now !== undefined ? (
        <span className="text-xs text-muted-foreground">
          {" "}
          · {durationText(Math.max(0, now - entry.since))}
        </span>
      ) : null}
    </span>
  );
}

function Lines({ queue, now }: { queue: ResourceView[]; now?: number }) {
  return (
    <section
      aria-labelledby="jobs-lines-heading"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <h2
        id="jobs-lines-heading"
        className="font-display text-base font-semibold"
      >
        Lines
      </h2>
      <ul className="flex flex-col" data-testid="job-queue">
        {queue.map((resource) => (
          <li
            key={resource.resource}
            data-resource={resource.resource}
            className="flex flex-col gap-0.5 border-b py-2.5 text-sm last:border-b-0"
          >
            <b className="font-semibold [overflow-wrap:anywhere]">
              {lineTitle(resource.resource)}
            </b>
            {resource.holder ? (
              <EntryWords entry={resource.holder} now={now} />
            ) : (
              <span className="text-muted-foreground">Free</span>
            )}
            {resource.waiters.length > 0 && (
              <ol className="flex flex-col gap-0.5">
                {resource.waiters.map((waiter, index) => (
                  <li
                    key={`${waiter.jobId ?? waiter.pid}-${index}`}
                    className="flex gap-2"
                  >
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {placeInLine(index + (resource.holder ? 1 : 0))}
                    </span>
                    <EntryWords entry={waiter} now={now} />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-[18px] text-muted-foreground">
        Your own clicks go before batch work. Each site gets one request every
        15 s; a page&apos;s own picture may follow it at once.
      </p>
    </section>
  );
}

function Stats({ jobs }: { jobs: BoardJob[] }) {
  const ended = jobs.filter((job) => !LIVE.has(job.status));
  const failed = ended.filter(didNotWork).length;
  const cancelled = ended.filter((job) => job.status === "cancelled").length;
  const runs = ended.filter((job) => job.costUsd !== undefined);
  const cost = runs.reduce((sum, job) => sum + (job.costUsd ?? 0), 0);
  const tiles: [string, string][] = [
    [String(ended.length), ended.length === 1 ? "job" : "jobs"],
    [String(failed), "didn't work"],
    [String(cancelled), "cancelled"],
    [
      cost > 0 ? costText(cost).replace("about ", "") : "$0",
      `curator, ${runs.length} ${runs.length === 1 ? "run" : "runs"}`,
    ],
  ];
  return (
    <section
      aria-labelledby="jobs-stats-heading"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <h2
        id="jobs-stats-heading"
        className="font-display text-base font-semibold"
      >
        Last 14 days
      </h2>
      <dl className="grid grid-cols-2 gap-2">
        {tiles.map(([value, label]) => (
          <div
            key={label}
            className="flex flex-col-reverse gap-0.5 rounded-md bg-muted px-2.5 py-2"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-[22px] leading-7 tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                             */
/* ------------------------------------------------------------------ */

/**
 * `/jobs`, variant B (48c): **Now** — a card per live job with its steps
 * so far and a sentence on why it waits; **Needs a look** — what didn't
 * work, grouped by cause, each with its next step (dismissed per viewer,
 * until a newer job joins the group); **History** — finished jobs by day,
 * each round in one row (`?rows=each` or the checkbox: one row per job),
 * filtered by B's kinds; and beside them the machine: each resource's
 * line, the fortnight's counts, the model imports read with.
 *
 * It reads `GET /api/jobs/board` every 2 s while anything is live and every
 * 10 s while all is idle (38b), never while the tab is hidden and at once
 * when it is shown again; a read refused for good (401/403) stops it, and
 * Refresh reads now.
 */
export function JobsBoard({
  initial,
  limit,
  eachRow,
  models,
}: {
  initial: Board;
  limit: number;
  eachRow: boolean;
  models?: ReactNode;
}) {
  const [board, setBoard] = useState(initial);
  const [now, setNow] = useState<number | undefined>();
  /* This viewer's dismissed groups: read once mounted (never on the server). */
  const [dismissed, setDismissed] = useState<string[]>([]);
  /*
   * The browser's clock once mounted, set from a timer's callback:
   * eslint-plugin-react-hooks 7.1 refuses a setState in an effect's body,
   * concise arrow included (40h).
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
      setDismissed(readDismissed());
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [error, setError] = useState<string | undefined>();
  const [reads, setReads] = useState(0);
  const [refused, setRefused] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/jobs/board?limit=${limit}`, {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        const body = (await response.json().catch(() => ({
          error: { message: `The editor answered ${response.status}` },
        }))) as Board | { error: { message: string } };
        if (signal?.aborted) return;
        if (!response.ok || "error" in body) {
          if (response.status === 401 || response.status === 403) {
            setRefused(true);
          }
          throw new Error(
            "error" in body ? body.error.message : `${response.status}`,
          );
        }
        setBoard(body);
        setError(undefined);
        setRefused(false);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      setNow(Date.now());
      setReads((count) => count + 1);
    },
    [limit],
  );

  const live = anyLive(board);
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    tabHidden,
    serverTabHidden,
  );
  const resumed = useRef(false);
  useEffect(() => {
    if (hidden) {
      resumed.current = true;
      return;
    }
    if (refused) return;
    const delay = resumed.current ? 0 : live ? JOBS_POLL_MS : JOBS_IDLE_POLL_MS;
    resumed.current = false;
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hidden, live, load, reads, refused]);

  /* The live cards' clock ticks between reads. */
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);

  const liveJobs = board.jobs.filter((job) => LIVE.has(job.status));
  const logs = useMemo(
    () => new Map(board.live.map((entry) => [entry.id, entry.lines])),
    [board.live],
  );
  const groups = useMemo(() => attentionGroups(board.jobs), [board.jobs]);
  const looking = groups.filter(
    (group) => !dismissed.includes(dismissalKey(group)),
  );
  const running = liveJobs.filter((job) => job.status === "running").length;
  const queued = liveJobs.length - running;
  const readAgo =
    now !== undefined
      ? Math.max(0, Math.round((now - board.readAt) / 1000))
      : 0;

  const dismiss = (group: AttentionGroup) => {
    const next = [...readDismissed(), dismissalKey(group)];
    writeDismissed(next);
    setDismissed(next);
  };
  const undismiss = () => {
    writeDismissed([]);
    setDismissed([]);
  };

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="jobs-dashboard"
      /* Hydrated: `now` is set by the first effect (tests wait on this). */
      data-ready={now !== undefined ? "true" : undefined}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
            Imports · inspects · curator · rebuilds · syncs
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Jobs
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground" aria-live="off">
            {now !== undefined
              ? `Read ${readAgo} s ago · every ${live ? 2 : 10} s`
              : "Read just now"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
      </div>
      {error && (
        <p className="border-l-2 border-destructive pl-2 text-sm" role="alert">
          Could not read the jobs: {error}
        </p>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section
            aria-labelledby="jobs-now-heading"
            className="flex flex-col gap-3"
            data-testid="jobs-now"
          >
            <h2
              id="jobs-now-heading"
              className="font-display text-xl font-semibold"
            >
              Now{" "}
              <small className="text-sm font-normal text-muted-foreground">
                {liveJobs.length === 0
                  ? "nothing running"
                  : [
                      running ? `${running} running` : undefined,
                      queued ? `${queued} queued` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </small>
            </h2>
            {liveJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is running. Imports, inspects, curator runs, rebuilds
                and syncs show here while they work, with why they wait.
              </p>
            ) : (
              liveJobs.map((job) => (
                <LiveCard
                  key={job.id}
                  job={job}
                  lines={logs.get(job.id) ?? []}
                  queue={board.queue}
                  now={now}
                  onChanged={() => void load()}
                />
              ))
            )}
          </section>

          <section
            aria-labelledby="jobs-look-heading"
            className="flex flex-col gap-1"
            data-testid="jobs-look"
          >
            <h2
              id="jobs-look-heading"
              className="font-display text-xl font-semibold"
            >
              Needs a look{" "}
              <small className="text-sm font-normal text-muted-foreground">
                {looking.length === 0
                  ? "nothing"
                  : `${looking.reduce((sum, group) => sum + group.open.length, 0)} jobs ended without what they set out for`}
              </small>
            </h2>
            {looking.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every job that ended did what it set out to.
              </p>
            ) : (
              looking.map((group) => (
                <LookGroup
                  key={group.key}
                  group={group}
                  onDismiss={() => dismiss(group)}
                />
              ))
            )}
            {groups.length > looking.length && (
              <p className="text-sm text-muted-foreground">
                <button
                  type="button"
                  className="min-h-6 underline underline-offset-2"
                  onClick={undismiss}
                >
                  Show the {groups.length - looking.length} dismissed
                </button>
              </p>
            )}
          </section>

          <History
            jobs={board.jobs}
            more={board.more}
            total={board.total}
            eachRow={eachRow}
          />
        </div>

        <aside className="flex flex-col gap-4" aria-label="The machine">
          <Lines queue={board.queue} now={now} />
          <Stats jobs={board.jobs} />
          {models}
        </aside>
      </div>
    </div>
  );
}
