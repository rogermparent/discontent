"use client";

import Link from "next/link";
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

/** "Oct 21, 14:05", in the reader's zone. */
function whenText(epoch: number): string {
  return new Date(epoch).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
                    {/* The server's zone may not be the reader's. */}
                    <time
                      dateTime={new Date(row.queuedAt).toISOString()}
                      suppressHydrationWarning
                    >
                      {whenText(row.queuedAt)}
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
