"use client";

import {
  noteText,
  stepDetail,
  stepTime,
  stepTitle,
  walkSteps,
  type StepNode,
} from "recipe-editor/controller/jobs/timeline";
import { cn } from "@discontent/component-library/lib/utils";

const STATUS_TEXT: Record<StepNode["status"], string> = {
  running: "running",
  ok: "done",
  failed: "failed",
};

/**
 * A job's steps as a list (37c): one row per step — what it is, its
 * status, its time (so far, while it runs) and the numbers worth a glance
 * (the model's lines found, tokens and GPU share; a page's status) —
 * nested by `parent`. Notes sit under the step that wrote them.
 */
export function StepList({
  steps,
  now,
  testId = "job-steps",
  notes = true,
}: {
  steps: readonly StepNode[];
  /** The clock a running step's time is counted to. */
  now: number;
  testId?: string;
  /** Show the steps' own notes too. */
  notes?: boolean;
}) {
  const rows = walkSteps(steps);
  if (rows.length === 0) return null;
  return (
    <ol className="space-y-0.5 text-sm" data-testid={testId}>
      {rows.map((node) => {
        const detail = stepDetail(node);
        return (
          <li
            key={node.n}
            data-step={node.step}
            data-status={node.status}
            className="flex flex-col"
            style={{ paddingLeft: `${node.depth * 1.25}rem` }}
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block w-3 text-center",
                  node.status === "running" && "animate-pulse text-primary",
                  node.status === "failed" && "text-foreground",
                  node.status === "ok" && "text-muted-foreground",
                )}
              >
                {node.status === "running"
                  ? "●"
                  : node.status === "failed"
                    ? "✕"
                    : "✓"}
              </span>
              <span className="font-medium">{stepTitle(node)}</span>
              <span className="sr-only">{STATUS_TEXT[node.status]}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {stepTime(node, now)}
              </span>
              {detail.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {detail.join(" · ")}
                </span>
              )}
            </span>
            {node.error && (
              <span className="ml-5 border-l-2 border-destructive pl-2 text-xs">
                {node.error}
              </span>
            )}
            {notes &&
              node.notes.map((note, index) => (
                <span
                  key={`${node.n}-note-${index}`}
                  className={cn(
                    "text-xs",
                    /* Not red text: `--destructive` on the page is 4.49:1 (T25). */
                    note.level === "info"
                      ? "pl-5 text-muted-foreground"
                      : "ml-5 border-l-2 border-destructive pl-2",
                  )}
                >
                  {noteText(note)}
                </span>
              ))}
          </li>
        );
      })}
    </ol>
  );
}
