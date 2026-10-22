"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import type { CuratorRunRow } from "recipe-editor/controller/agent/curator";

/** A run's state in a word or two, for the list. */
export function runStateWords(
  row: Pick<CuratorRunRow, "status" | "stopReason">,
): string {
  switch (row.status) {
    case "queued":
      return "waiting";
    case "running":
      return "running";
    case "cancelled":
      return "stopped by you";
    case "failed":
      return "failed";
    case "interrupted":
      return "interrupted";
    case "done":
      return !row.stopReason || row.stopReason === "done"
        ? "finished"
        : row.stopReason === "cancelled"
          ? "stopped by you"
          : "stopped";
  }
}

const noSubscription = () => () => {};

/** False on the server and while hydrating, true once React owns the page. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * When a run was asked. The server (the Pi, whose zone is not the
 * reader's) and the first client render say it the same fixed way, in UTC
 * ("Oct 21, 14:05 UTC"), so hydration matches; once mounted it is redrawn
 * in the reader's own zone and locale — the homepage's server-day-then-
 * browser-day order (42f).
 */
function whenText(epoch: number, local: boolean): string {
  const date = new Date(epoch);
  if (local) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return `${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })} UTC`;
}

/**
 * The recent conversations (44d), newest first: each its first ask's
 * line, when, how it stands and how much it changed. A row opens its run
 * (`?run=<id>`), so a run is linkable and Back goes back.
 */
export function RecentRuns({
  runs,
  current,
}: {
  runs: CuratorRunRow[];
  current?: string;
}) {
  const local = useHydrated();
  return (
    <section aria-labelledby="curator-recent-heading" className="min-w-0">
      <h2
        id="curator-recent-heading"
        className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        Recent runs
      </h2>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs yet. Ask for something and it shows here.
        </p>
      ) : (
        <ol className="flex flex-col gap-1" data-testid="curator-recent">
          {runs.map((row) => {
            const selected = row.id === current;
            return (
              <li key={row.id} data-run={row.id}>
                <Link
                  href={`/curator?run=${row.id}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                    selected && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">
                    {row.ask || "(no words)"}
                  </span>
                  <span className="flex flex-wrap gap-x-2 font-mono text-xs">
                    {/* UTC from the server, the reader's zone once mounted. */}
                    <time dateTime={new Date(row.queuedAt).toISOString()}>
                      {whenText(row.queuedAt, local)}
                    </time>
                    <span>{runStateWords(row)}</span>
                    {row.asks > 1 && <span>{row.asks} asks</span>}
                    <span>
                      {row.changes === 0
                        ? "no changes"
                        : `${row.changes} ${row.changes === 1 ? "change" : "changes"}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
