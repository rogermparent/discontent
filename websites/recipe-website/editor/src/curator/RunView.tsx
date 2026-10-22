"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  changeCount,
  runChanges,
} from "recipe-editor/controller/agent/changes";
import {
  buildConversation,
  costText,
  stopWords,
  tokenText,
  type Conversation,
} from "recipe-editor/controller/agent/conversation";
import type { CuratorRunChanges } from "recipe-editor/controller/agent/curator";
import type { TranscriptEnd } from "recipe-editor/controller/agent/transcript";
import {
  describeWaiting,
  durationText,
} from "recipe-editor/controller/jobs/timeline";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import { requestCancel } from "@/jobs/useJobPoll";
import { ChangesCard } from "./ChangesCard";
import { CuratorMarkdown } from "./CuratorMarkdown";
import { PromptForm } from "./PromptForm";
import { ToolRows } from "./ToolRows";
import type { AgentRunPoll } from "./useAgentRun";

function capitalized(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "3 of 40 turns · 2 tool calls · 12 s · 4.2k in, 310 out · about $0.42". */
export function runNumbers({
  turns,
  maxTurns,
  toolCalls,
  durationMs,
  end,
}: {
  turns: number;
  maxTurns?: number;
  toolCalls: number;
  durationMs?: number;
  end?: Pick<TranscriptEnd, "usage" | "costEstimate">;
}): string[] {
  const parts = [
    maxTurns
      ? `${turns} of ${maxTurns} turns`
      : `${turns} ${turns === 1 ? "turn" : "turns"}`,
    `${toolCalls} ${toolCalls === 1 ? "tool call" : "tool calls"}`,
  ];
  if (durationMs !== undefined) parts.push(durationText(durationMs));
  if (end) {
    const input =
      end.usage.inputTokens +
      end.usage.cacheReadTokens +
      end.usage.cacheWriteTokens;
    parts.push(
      `${tokenText(input)} tokens in, ${tokenText(end.usage.outputTokens)} out`,
    );
    if (end.costEstimate !== undefined) parts.push(costText(end.costEstimate));
  }
  return parts;
}

/** The one line the status region says: it changes with the turn, not per call. */
function statusLine(
  poll: AgentRunPoll,
  conversation: Conversation,
  meta: JobRecord | undefined,
): string {
  if (!poll.loaded) return "Opening the run…";
  if (poll.live) {
    if (meta?.status === "queued") {
      return meta.waiting
        ? `${capitalized(describeWaiting(meta.waiting))}.`
        : "Waiting to start…";
    }
    return conversation.turns === 0
      ? "Working: the first turn…"
      : `Working: ${conversation.turns} ${conversation.turns === 1 ? "turn" : "turns"} so far…`;
  }
  return stopWords(conversation.end, {
    status: meta?.status,
    failure: meta?.error?.message,
  });
}

/**
 * The changes route, read again whenever what the client sees written
 * changes (a new write's result arrived) and once the run ends.
 */
function useRunChanges(
  id: string | undefined,
  key: string,
  enabled: boolean,
  /** The run a follow-up continues: its card stays until the new one's lands. */
  carryFrom?: string,
): CuratorRunChanges | undefined {
  const [state, setState] = useState<{
    id: string;
    changes: CuratorRunChanges;
  }>();
  useEffect(() => {
    if (!id || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/agent/${encodeURIComponent(id)}/changes`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<CuratorRunChanges>)
          : undefined,
      )
      .then((changes) => {
        if (changes && !controller.signal.aborted) setState({ id, changes });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, key, enabled]);
  return state && (state.id === id || (!!carryFrom && state.id === carryFrom))
    ? state.changes
    : undefined;
}

/**
 * One run as a conversation (44d): each ask, each turn's words (Markdown,
 * links to this site's pages kept in the app) and its tool calls as rows,
 * what changed, and the footer — the numbers, the status line, Stop while
 * it runs, then how it ended and a follow-up box on the same run.
 */
export function RunView({
  id,
  poll,
  maxTurns,
  maxPrompt,
  onFollowUp,
  followError,
  following,
  carryFrom,
}: {
  id: string;
  poll: AgentRunPoll;
  /** The run this one follows up, just started: its view stays meanwhile. */
  carryFrom?: string;
  maxTurns: number;
  maxPrompt: number;
  onFollowUp: (prompt: string) => Promise<boolean>;
  followError?: string;
  following: boolean;
}) {
  const { meta, live, loaded, records } = poll;
  const conversation = useMemo(
    () => buildConversation(records, { live }),
    [records, live],
  );
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string>();
  const [followDraft, setFollowDraft] = useState("");

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);

  /* A new run (a follow-up, another row) is not stopping. */
  const [stoppingFor, setStoppingFor] = useState(id);
  if (stoppingFor !== id) {
    setStoppingFor(id);
    setStopping(false);
    setStopError(undefined);
  }

  const written = runChanges(conversation.messages);
  const writtenKey = `${written.commits}:${changeCount(written)}:${live}`;
  const changes = useRunChanges(
    poll.shown === id ? id : undefined,
    writtenKey,
    written.commits > 0 || changeCount(written) > 0,
    carryFrom,
  );

  const started = meta?.startedAt ?? meta?.queuedAt;
  const durationMs =
    conversation.end?.durationMs ??
    (started === undefined
      ? undefined
      : Math.max(0, (meta?.endedAt ?? now) - started));
  const specTurns = (meta?.spec as { maxTurns?: unknown } | undefined)
    ?.maxTurns;
  const budget = typeof specTurns === "number" ? specTurns : maxTurns;
  const numbers = runNumbers({
    turns: conversation.turns,
    maxTurns: budget,
    toolCalls: conversation.toolCalls,
    durationMs,
    ...(conversation.end ? { end: conversation.end } : {}),
  });
  const status = statusLine(poll, conversation, meta);
  const ended = loaded && !live;
  let lastAssistant = -1;
  conversation.items.forEach((item, index) => {
    if (item.kind === "assistant") lastAssistant = index;
  });

  const stop = async () => {
    setStopping(true);
    setStopError(await requestCancel(id));
    poll.refresh();
  };

  if (poll.error && records.length === 0) {
    return (
      <section aria-labelledby="curator-run-heading">
        <h2 id="curator-run-heading" className="sr-only">
          This run
        </h2>
        <p role="alert" className="border-l-2 border-destructive pl-2 text-sm">
          This run can&apos;t be read: {poll.error}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="curator-run-heading"
      data-testid="curator-run"
      data-run={id}
      data-live={String(live)}
      className="flex min-w-0 flex-col gap-4"
    >
      <h2 id="curator-run-heading" className="sr-only">
        This run
      </h2>
      <ol
        aria-label="Conversation"
        data-testid="curator-conversation"
        className="flex flex-col gap-4"
      >
        {conversation.items.map((item, index) => {
          if (item.kind === "user") {
            return (
              <li
                key={item.key}
                data-testid="curator-ask"
                className="ml-auto max-w-[min(100%,36rem)] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
              >
                <span className="sr-only">You asked: </span>
                {item.text}
              </li>
            );
          }
          if (item.kind === "end") {
            const words = stopWords(item.end);
            return (
              <li
                key={item.key}
                data-testid="curator-segment-end"
                className="border-t border-border pt-2 font-mono text-xs text-muted-foreground"
              >
                {[
                  words,
                  ...runNumbers({
                    turns: item.end.turns,
                    toolCalls: item.end.toolCalls,
                    durationMs: item.end.durationMs,
                    end: item.end,
                  }),
                ].join(" · ")}
              </li>
            );
          }
          return (
            <li key={item.key} data-testid="curator-turn" className="min-w-0">
              {/* A turn of tool calls alone is its rows: the label goes
                  with words. */}
              {item.text ? (
                <>
                  <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                    Curator
                  </p>
                  <CuratorMarkdown>{item.text}</CuratorMarkdown>
                </>
              ) : null}
              <ToolRows
                tools={item.tools}
                serverTools={item.serverTools}
                live={live && index === lastAssistant}
              />
            </li>
          );
        })}
      </ol>

      {changes && changeCount(changes) + changes.commits > 0 ? (
        <ChangesCard changes={changes} />
      ) : null}

      <div
        data-testid="curator-footer"
        className={cn(
          "flex flex-col gap-2",
          /* Phone: the controls ride above the tab bar (42-g's rule). */
          "sticky-chrome bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_6px_-1px_rgb(0_0_0/0.06)]",
          "sm:static sm:mx-0 sm:rounded-lg sm:border sm:p-3 sm:shadow-none print:hidden",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            role="status"
            data-testid="curator-status"
            className="text-sm font-semibold"
          >
            {status}
          </p>
          <p
            data-testid="curator-numbers"
            className="font-mono text-xs text-muted-foreground tabular-nums"
          >
            {numbers.join(" · ")}
          </p>
          <span className="ml-auto flex items-center gap-3">
            {live && loaded && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={stopping}
                onClick={stop}
              >
                {stopping ? "Stopping…" : "Stop"}
              </Button>
            )}
            <Link
              href={`/jobs/${id}`}
              className="inline-flex min-h-6 items-center text-sm underline underline-offset-2"
            >
              Job details
            </Link>
          </span>
        </div>
        {stopError && (
          <p className="border-l-2 border-destructive pl-2 text-sm">
            {stopError}
          </p>
        )}
        {ended && (
          <PromptForm
            label="Follow up"
            testId="curator-follow-up"
            value={followDraft}
            onChange={setFollowDraft}
            onSubmit={() => {
              void onFollowUp(followDraft).then((ok) => {
                if (ok) setFollowDraft("");
              });
            }}
            submitLabel="Send"
            busyLabel="Sending…"
            busy={following}
            max={maxPrompt}
            rows={2}
            placeholder="And two more like that"
            {...(followError ? { error: followError } : {})}
          />
        )}
      </div>
    </section>
  );
}
