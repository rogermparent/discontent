"use client";

import {
  stepDetail,
  stepTime,
  stepTitle,
  walkSteps,
  type StepNode,
} from "recipe-editor/controller/jobs/timeline";
import { cn } from "@discontent/component-library/lib/utils";

/**
 * A job's steps as bars on one time axis (37c): each step a row — its
 * name indented by its nesting (`parent`), a bar from its start to its end
 * (or to now, while it runs), its time — so a look says where the minute
 * went: the model, the queue, a site's polite gap.
 */
export function StepTimeline({
  steps,
  start,
  end,
  now,
}: {
  steps: readonly StepNode[];
  /** Epoch ms the axis starts at (the job's start). */
  start: number;
  /** Epoch ms it ends at (the job's end); undefined while it runs. */
  end?: number;
  now: number;
}) {
  const rows = walkSteps(steps);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No steps yet.</p>;
  }
  const last = Math.max(
    end ?? now,
    ...rows.map((node) => node.startedAt + (node.ms ?? now - node.startedAt)),
  );
  const span = Math.max(1, last - start);
  return (
    <ol className="space-y-1 text-sm" data-testid="job-timeline">
      {rows.map((node) => {
        const offset = Math.max(0, node.startedAt - start);
        const length = node.ms ?? Math.max(0, now - node.startedAt);
        const left = (offset / span) * 100;
        const width = Math.max(0.5, (length / span) * 100);
        const detail = stepDetail(node);
        return (
          <li
            key={node.n}
            data-step={node.step}
            data-status={node.status}
            className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-2 max-sm:grid-cols-1"
          >
            <span
              className="min-w-0 truncate"
              style={{ paddingLeft: `${node.depth}rem` }}
              title={detail.join(" · ")}
            >
              {stepTitle(node)}
              <span className="sr-only">
                {`, at +${(offset / 1000).toFixed(1)} s for ${stepTime(node, now)}${node.status === "failed" ? ", failed" : node.status === "running" ? ", running" : ""}${detail.length ? `, ${detail.join(", ")}` : ""}`}
              </span>
            </span>
            <span className="flex items-center gap-2" aria-hidden="true">
              <span className="relative h-3 flex-1 rounded bg-muted">
                <span
                  className={cn(
                    "absolute top-0 h-3 rounded",
                    node.status === "failed"
                      ? "bg-destructive"
                      : node.step === "queue.wait" || node.step === "pace.wait"
                        ? "bg-muted-foreground/50"
                        : "bg-primary",
                    node.status === "running" && "animate-pulse",
                  )}
                  style={{
                    left: `${left}%`,
                    width: `${Math.min(width, 100 - left)}%`,
                  }}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {stepTime(node, now)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
