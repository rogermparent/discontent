"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import { Segmented } from "recipe-website-common/components/TagPage/parts";
import type { CuratorRunRow } from "recipe-editor/controller/agent/curator";
import { costText } from "recipe-editor/controller/agent/conversation";
import { When } from "./time";

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

/** Which runs the list shows (48b, variant B). */
export type RunFilter = "all" | "review" | "changed";

/**
 * A run's pill (48b): its held writes waiting ("Review 2"), else what it
 * saved or changed ("Saved 1"), else "Read only".
 */
export function runPill(
  row: Pick<CuratorRunRow, "review" | "saved" | "changes" | "status">,
): { label: string; review: boolean } | undefined {
  if (row.status === "queued" || row.status === "running") return undefined;
  if (row.review > 0) return { label: `Review ${row.review}`, review: true };
  if (row.saved > 0) return { label: `Saved ${row.saved}`, review: false };
  if (row.changes > 0) {
    return { label: `Changed ${row.changes}`, review: false };
  }
  return { label: "Read only", review: false };
}

/**
 * The recent conversations (44d), newest first: each its first ask's
 * line, when, how it stands, what it holds for review or changed (48b's
 * pills), what it cost and whether it says heads up. A row opens its run
 * (`?run=<id>`), so a run is linkable and Back goes back. The filter
 * narrows it to the runs waiting for review, or those that changed
 * something.
 */
export function RecentRuns({
  runs,
  current,
  initialFilter = "all",
}: {
  runs: CuratorRunRow[];
  current?: string;
  initialFilter?: RunFilter;
}) {
  const [filter, setFilter] = useState<RunFilter>(initialFilter);
  const toReview = runs.filter((row) => row.review > 0);
  const changed = runs.filter((row) => row.changes > 0);
  const shown =
    filter === "review" ? toReview : filter === "changed" ? changed : runs;
  const cost = runs.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  return (
    <section
      id="curator-runs"
      aria-labelledby="curator-recent-heading"
      className="flex min-w-0 scroll-mt-20 flex-col gap-2"
    >
      <h2
        id="curator-recent-heading"
        className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        Recent runs
      </h2>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs yet. Ask for something and it shows here.
        </p>
      ) : (
        <>
          <Segmented
            label="Show runs"
            testId="curator-run-filter"
            value={filter}
            onChange={setFilter}
            className="grid grid-cols-3"
            options={[
              { id: "all", label: `All ${runs.length}` },
              { id: "review", label: `To review ${toReview.length}` },
              { id: "changed", label: `Changed ${changed.length}` },
            ]}
          />
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filter === "review"
                ? "Nothing is waiting for your review."
                : "No run here changed anything yet."}
            </p>
          ) : (
            <ol className="flex flex-col gap-1" data-testid="curator-recent">
              {shown.map((row) => {
                const selected = row.id === current;
                const pill = runPill(row);
                const state = runStateWords(row);
                return (
                  <li key={row.id} data-run={row.id}>
                    <Link
                      href={`/curator?run=${row.id}`}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 flex-col gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                        selected && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">
                        {row.ask || "(no words)"}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                        {pill && (
                          <span
                            data-testid="curator-run-pill"
                            className={cn(
                              "rounded-full border px-1.5 leading-5",
                              pill.review
                                ? "border-primary font-semibold text-foreground"
                                : "border-border",
                            )}
                          >
                            {pill.label}
                          </span>
                        )}
                        {row.headsUp && <span>heads up</span>}
                        {row.reviewed && (
                          <span
                            data-testid="curator-run-reviewed"
                            title="Claude Code reviewed this run"
                          >
                            Reviewed
                          </span>
                        )}
                        {/* UTC from the server, the reader's zone once mounted. */}
                        <When epoch={row.queuedAt} />
                        {state !== "finished" && <span>{state}</span>}
                        {row.asks > 1 && <span>{row.asks} asks</span>}
                        {row.costUsd !== undefined && (
                          <span>
                            {costText(row.costUsd).replace("about ", "")}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="font-mono text-xs text-muted-foreground">
            {runs.length} {runs.length === 1 ? "run" : "runs"}
            {cost > 0 ? ` · ${costText(cost)}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
