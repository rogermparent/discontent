"use client";

import { Check, CircleSlash, Clock, LoaderCircle, X } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  serverToolPhrase,
  type ToolRow,
  type ToolRowStatus,
} from "recipe-editor/controller/agent/conversation";
import type { ServerToolUse } from "recipe-editor/controller/agent/types";
import { durationText } from "recipe-editor/controller/jobs/timeline";
import { detailText } from "./links";

const STATUS_WORDS: Record<ToolRowStatus, string> = {
  running: "running",
  waiting: "waiting",
  done: "done",
  error: "error",
  not_run: "not run",
};

function StatusIcon({ status }: { status: ToolRowStatus }) {
  const className = "size-4 shrink-0";
  switch (status) {
    case "running":
      return (
        <LoaderCircle
          aria-hidden
          className={cn(className, "animate-spin text-primary")}
        />
      );
    case "waiting":
      return (
        <Clock aria-hidden className={cn(className, "text-muted-foreground")} />
      );
    case "done":
      return (
        <Check aria-hidden className={cn(className, "text-muted-foreground")} />
      );
    case "error":
      return <X aria-hidden className={cn(className, "text-foreground")} />;
    case "not_run":
      return (
        <CircleSlash
          aria-hidden
          className={cn(className, "text-muted-foreground")}
        />
      );
  }
}

function Detail({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {/* Focusable: a scroller keyboard users can reach (axe). */}
      <pre
        tabIndex={0}
        aria-label={label}
        className="mt-1 max-h-64 overflow-auto rounded border border-border bg-muted p-2 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {detailText(value)}
      </pre>
    </div>
  );
}

function RowLine({
  status,
  phrase,
  durationMs,
}: {
  status: ToolRowStatus;
  phrase: string;
  durationMs?: number;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1 truncate">{phrase}</span>
      <span className="sr-only">, {STATUS_WORDS[status]}</span>
      {status === "error" || status === "not_run" ? (
        <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
          {STATUS_WORDS[status]}
        </span>
      ) : null}
      {durationMs !== undefined && (
        <span
          data-testid="tool-duration"
          className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
        >
          {durationText(durationMs)}
        </span>
      )}
    </span>
  );
}

/**
 * A turn's tool calls as compact rows (44d): what it did in words, its
 * status (a spinner while it runs), how long it took, and a disclosure with
 * the input and the result — monospace, cut, scrolling inside itself.
 */
export function ToolRows({
  tools,
  serverTools,
  live,
}: {
  tools: ToolRow[];
  serverTools: ServerToolUse[];
  live: boolean;
}) {
  if (tools.length === 0 && serverTools.length === 0) return null;
  return (
    <ul
      aria-label="Tools used"
      data-testid="curator-tools"
      className="mt-2 flex flex-col gap-1"
    >
      {serverTools.map((use) => {
        const status: ToolRowStatus = use.result
          ? use.result.ok
            ? "done"
            : "error"
          : live
            ? "running"
            : "not_run";
        return (
          <li key={use.id} data-tool={use.name} data-status={status}>
            <details className="group rounded-md border border-border bg-card text-sm">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2 py-1 [&::-webkit-details-marker]:hidden">
                <RowLine status={status} phrase={serverToolPhrase(use)} />
              </summary>
              <div className="flex flex-col gap-2 border-t border-border p-2">
                <Detail label="Input" value={use.input} />
                <Detail
                  label="Result"
                  value={
                    use.result
                      ? use.result.ok
                        ? (use.result.pages ?? [])
                        : { error: use.result.errorCode ?? "failed" }
                      : "Not back yet."
                  }
                />
              </div>
            </details>
          </li>
        );
      })}
      {tools.map((row) => (
        <li
          key={row.id}
          data-tool={row.name}
          data-status={row.status}
          data-testid="curator-tool"
        >
          <details className="group rounded-md border border-border bg-card text-sm">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2 py-1 [&::-webkit-details-marker]:hidden">
              <RowLine
                status={row.status}
                phrase={row.phrase}
                durationMs={row.durationMs}
              />
            </summary>
            <div className="flex flex-col gap-2 border-t border-border p-2">
              <p className="font-mono text-xs text-muted-foreground">
                {row.name}
              </p>
              <Detail label="Input" value={row.input} />
              {row.result !== undefined ? (
                <Detail label="Result" value={row.result} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {row.status === "running"
                    ? "Running…"
                    : row.status === "waiting"
                      ? "Waiting for the call before it."
                      : "It did not run."}
                </p>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
