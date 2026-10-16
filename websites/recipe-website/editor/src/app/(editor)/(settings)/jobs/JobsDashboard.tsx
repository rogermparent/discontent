"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  JOB_KIND_NAMES,
  JOB_STATUS_FILTERS,
} from "recipe-editor/controller/jobs/listing";
import {
  durationText,
  resourceName,
} from "recipe-editor/controller/jobs/timeline";
import type {
  JobListResult,
  QueueEntryView,
  ResourceView,
} from "recipe-editor/controller/jobs/views";
import { JobStatusBadge, formatWhen } from "./JobStatusBadge";

/** How often the page reads while anything is live (D7: every 2 s). */
export const JOBS_POLL_MS = 2_000;

const LIVE = new Set(["queued", "running"]);

function anyLive(list: JobListResult, queue: ResourceView[]): boolean {
  return (
    list.jobs.some((job) => LIVE.has(job.status)) ||
    queue.some((resource) => resource.holder || resource.waiters.length > 0)
  );
}

function resourceTitle(resource: string): string {
  const name = resourceName(resource);
  return name === "the GPU" ? "GPU" : name;
}

function EntryText({
  entry,
  now,
  waiting,
}: {
  entry: QueueEntryView;
  /** Undefined until mounted: a server's clock is not the browser's. */
  now?: number;
  waiting: boolean;
}) {
  const who = entry.jobId ? (
    entry.label ? (
      <Link
        href={`/jobs/${entry.jobId}`}
        className="underline underline-offset-2"
      >
        {entry.label}
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
    <span className="flex flex-wrap items-baseline gap-x-2">
      {who}
      {entry.kind && (
        <span className="font-mono text-xs text-muted-foreground">
          {entry.kind}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {entry.tier} · {waiting ? "waiting" : "holding"}
        {now !== undefined
          ? ` ${durationText(Math.max(0, now - entry.since))}`
          : ""}
      </span>
    </span>
  );
}

/**
 * `/jobs`' live half (37c): the queue per resource — the holder, then the
 * waiters in order with their tiers — and the recent jobs, filtered by
 * status and kind. It reads `GET /api/jobs?queue=1` every 2 s while
 * anything is live, and stops when all is idle (Refresh reads again).
 */
export function JobsDashboard({
  initialList,
  initialQueue,
  limit,
}: {
  initialList: JobListResult;
  initialQueue: ResourceView[];
  limit: number;
}) {
  const [list, setList] = useState(initialList);
  const [queue, setQueue] = useState(initialQueue);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [now, setNow] = useState<number | undefined>();
  useEffect(() => setNow(Date.now()), []);
  const [error, setError] = useState<string | undefined>();
  const [reads, setReads] = useState(0);
  const first = useRef(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const query = new URLSearchParams({ limit: String(limit), queue: "1" });
      if (status) query.set("status", status);
      if (kind) query.set("kind", kind);
      try {
        const response = await fetch(`/api/jobs?${query}`, {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        const body = (await response.json()) as
          | (JobListResult & { queue: ResourceView[] })
          | { error: { message: string } };
        if (!response.ok || "error" in body) {
          throw new Error(
            "error" in body ? body.error.message : `${response.status}`,
          );
        }
        setList({ jobs: body.jobs, total: body.total, more: body.more });
        setQueue(body.queue);
        setError(undefined);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      setNow(Date.now());
      setReads((count) => count + 1);
    },
    [status, kind, limit],
  );

  /* A filter change reads at once. */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /* While anything is live, read again every 2 s; idle, stop. */
  const live = anyLive(list, queue);
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), JOBS_POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [live, load, reads]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="mb-2 text-lg font-semibold">
          Queue
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="job-queue">
          {queue.map((resource) => (
            <li
              key={resource.resource}
              className="rounded-md border p-3 text-sm"
              data-resource={resource.resource}
            >
              <p className="font-medium">{resourceTitle(resource.resource)}</p>
              {resource.holder ? (
                <EntryText entry={resource.holder} now={now} waiting={false} />
              ) : (
                <p className="text-muted-foreground">Free</p>
              )}
              {resource.waiters.length > 0 && (
                <ol className="mt-1 list-decimal pl-5">
                  {resource.waiters.map((waiter, index) => (
                    <li key={`${waiter.jobId ?? waiter.pid}-${index}`}>
                      <EntryText entry={waiter} now={now} waiting />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-heading">
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <h2 id="recent-heading" className="mr-auto text-lg font-semibold">
            Recent jobs
          </h2>
          <div className="flex flex-col text-sm">
            <label htmlFor="jobs-status" className="text-muted-foreground">
              Status
            </label>
            <select
              id="jobs-status"
              className="rounded-md border bg-background px-2 py-1"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All</option>
              {JOB_STATUS_FILTERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-sm">
            <label htmlFor="jobs-kind" className="text-muted-foreground">
              Kind
            </label>
            <select
              id="jobs-kind"
              className="rounded-md border bg-background px-2 py-1"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">All</option>
              {JOB_KIND_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
        {error && (
          <p className="mb-2 text-sm text-destructive" role="alert">
            Could not read the jobs: {error}
          </p>
        )}
        {list.jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="job-list">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Kind
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Job
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Duration
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b align-top"
                    data-job={job.id}
                  >
                    <td className="py-1 pr-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs">{job.kind}</td>
                    <td className="max-w-[24rem] py-1 pr-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="break-words underline underline-offset-2"
                      >
                        {job.label}
                      </Link>
                      {job.error && job.status !== "cancelled" && (
                        <p className="text-xs text-destructive">
                          {job.error.message}
                        </p>
                      )}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs tabular-nums">
                      {durationText(job.durationMs)}
                    </td>
                    <td
                      className="py-1 text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {formatWhen(job.startedAt ?? job.queuedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.more && (
              <p className="mt-1 text-xs text-muted-foreground">
                {list.total - list.jobs.length} older not shown.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
