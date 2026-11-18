"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  changeCount,
  changesToShow,
  runChanges,
} from "recipe-editor/controller/agent/changes";
import {
  buildConversation,
  claudeModelName,
  costText,
  stopWords,
  tokenText,
  type Conversation,
} from "recipe-editor/controller/agent/conversation";
import type { CuratorRunChanges } from "recipe-editor/controller/agent/curator";
import {
  askSegments,
  callCount,
  didLines,
  foundRecipes,
  importedUrls,
  segmentAnswer,
  splitHeadsUp,
  type AskSegment,
} from "recipe-editor/controller/agent/runSummary";
import { dollarText } from "recipe-editor/controller/llm/cost";
import type { TranscriptEnd } from "recipe-editor/controller/agent/transcript";
import {
  describeWaiting,
  durationText,
} from "recipe-editor/controller/jobs/timeline";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import { requestCancel } from "@/jobs/useJobPoll";
import { conversationUrls } from "recipe-editor/controller/agent/nearMiss";
import { ChangesCard } from "./ChangesCard";
import { CuratorMarkdown } from "./CuratorMarkdown";
import { hostsOf, siteSlugsOf, type LinkKnown } from "./links";
import { PromptForm } from "./PromptForm";
import { ReviewPanel, useReview } from "./ReviewPanel";
import {
  BudgetMeter,
  DidList,
  FoundRecipes,
  HeadsUpCallout,
  StageStrip,
  type Stage,
} from "./RunParts";
import { useHydrated, When } from "./time";
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
  end?: Pick<TranscriptEnd, "usage" | "costEstimate" | "maxCostUsd">;
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
    if (end.costEstimate !== undefined) {
      /* 46d: beside the run's cost budget, when it had one — "about $0.42
       * (cap $1.00)": an estimate, and a turn can carry it a little past. */
      parts.push(
        end.maxCostUsd !== undefined
          ? `${costText(end.costEstimate)} (cap ${dollarText(end.maxCostUsd)})`
          : costText(end.costEstimate),
      );
    }
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
 * changes (a new write's result arrived, a Save) and once the run ends.
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

/** A model id as the page names it: "Claude Sonnet 5", "qwen3:8b". */
function modelName(conversation: Conversation): string {
  const start = conversation.start;
  if (!start) return "The curator";
  return start.api === "anthropic" ? claudeModelName(start.model) : start.model;
}

/**
 * One ask and what its run did (variant B): the ask (the conversation's
 * first is the run's title, above), "What it did" in plain words with the
 * raw calls a click away, the model's heads-up as a callout, its answer,
 * and — the newest ask's — the recipes it found as Import buttons.
 */
function Segment({
  segment,
  first,
  newest,
  live,
  model,
  known,
  origin,
  conversation,
  onImportAll,
  following,
}: {
  segment: AskSegment;
  first: boolean;
  newest: boolean;
  live: boolean;
  model: string;
  known: LinkKnown;
  origin?: string;
  conversation: Conversation;
  onImportAll: (urls: string[]) => void;
  following: boolean;
}) {
  const [open, setOpen] = useState(false);
  const callsId = useId();
  const lines = didLines(segment.turns);
  const calls = callCount(segment.turns);
  const answer = segmentAnswer(segment);
  const { headsUps, rest } = splitHeadsUp(answer);
  const found = newest
    ? foundRecipes(answer, {
        hosts: known.hosts,
        ...(origin ? { origin } : {}),
        imported: importedUrls(conversation),
      })
    : [];
  let lastWithTools = -1;
  segment.turns.forEach((turn, index) => {
    if (turn.tools.length + turn.serverTools.length > 0) lastWithTools = index;
  });
  return (
    <li className="flex min-w-0 flex-col gap-4" data-testid="curator-segment">
      {!first && (
        <p
          data-testid="curator-ask"
          className="ml-auto max-w-[min(100%,36rem)] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          <span className="sr-only">You followed up: </span>
          {segment.ask.text}
        </p>
      )}
      {(lines.length > 0 || calls > 0) && (
        <section
          aria-label="What it did"
          data-testid="curator-did-panel"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold">What it did</h3>
            {calls > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-8"
                aria-expanded={open}
                aria-controls={callsId}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? "Hide" : "Show"} the {calls}{" "}
                {calls === 1 ? "tool call" : "tool calls"}
                <ChevronDown
                  aria-hidden
                  className={cn("transition-transform", open && "rotate-180")}
                />
              </Button>
            )}
          </div>
          <DidList lines={lines} />
          <ol
            id={callsId}
            hidden={!open}
            aria-label="Tool calls"
            data-testid="curator-conversation"
            className="flex flex-col gap-3 border-t border-border pt-3"
          >
            {segment.turns.map((turn, index) => (
              <li key={turn.key} data-testid="curator-turn" className="min-w-0">
                {/* A turn's words before its calls; the last turn's words
                    are the answer, below. */}
                {turn.text && index < segment.turns.length - 1 ? (
                  <div className="text-sm text-muted-foreground">
                    <CuratorMarkdown known={known}>{turn.text}</CuratorMarkdown>
                  </div>
                ) : null}
                <ToolRows
                  tools={turn.tools}
                  serverTools={turn.serverTools}
                  live={live && newest && index === lastWithTools}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
      <HeadsUpCallout notes={headsUps} model={model} known={known} />
      {rest && (
        <div data-testid="curator-answer" className="min-w-0">
          <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
            {model}
          </p>
          <CuratorMarkdown known={known}>{rest}</CuratorMarkdown>
        </div>
      )}
      {found.length > 0 && !live && (
        <FoundRecipes
          found={found}
          busy={following}
          onImportAll={() => onImportAll(found.map((recipe) => recipe.url))}
        />
      )}
      {segment.end && (
        <p
          data-testid="curator-segment-end"
          className="border-t border-border pt-2 font-mono text-xs text-muted-foreground"
        >
          {[
            stopWords(segment.end.end),
            ...runNumbers({
              turns: segment.end.end.turns,
              toolCalls: segment.end.end.toolCalls,
              durationMs: segment.end.end.durationMs,
              end: segment.end.end,
            }),
          ].join(" · ")}
        </p>
      )}
    </li>
  );
}

/**
 * One run (44d; variant B, 48b): its title (the conversation's first
 * ask), Ask → Working → Review, the budget moving per turn, each ask with
 * what it did, the model's heads-up and its answer, the held writes'
 * review, what changed, and the footer — the numbers, the status line,
 * Stop while it runs, then how it ended and a follow-up box on the same
 * run.
 *
 * Focus (44d review): `focusOnOpen` moves it to the run's heading (a run
 * just started) or its status line (a follow-up just sent). When a run
 * ends while focus is nowhere — Stop, which had it, unmounts — or still
 * where this view put it, it moves to the follow-up box. Never taken from
 * anything else the reader is on.
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
  focusOnOpen,
  newAsk,
}: {
  id: string;
  /** Where focus goes when this run opens (a run or follow-up just started here). */
  focusOnOpen?: "heading" | "status";
  poll: AgentRunPoll;
  /** The run this one follows up, just started: its view stays meanwhile. */
  carryFrom?: string;
  maxTurns: number;
  maxPrompt: number;
  onFollowUp: (prompt: string) => Promise<boolean>;
  followError?: string;
  following: boolean;
  /** The "New ask" link, beside the title. */
  newAsk?: ReactNode;
}) {
  const router = useRouter();
  const { meta, live, loaded, records } = poll;
  const conversation = useMemo(
    () => buildConversation(records, { live }),
    [records, live],
  );
  const segments = useMemo(() => askSegments(conversation), [conversation]);
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string>();
  const [followDraft, setFollowDraft] = useState("");
  /* This page's origin, once hydrated: its own links are not found recipes. */
  const hydrated = useHydrated();
  const origin = hydrated ? window.location.origin : undefined;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusOnOpen === "heading") headingRef.current?.focus();
    else if (focusOnOpen === "status") {
      statusRef.current?.focus({ preventScroll: true });
    }
  }, [focusOnOpen, id]);

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

  /* 48b: the held writes, read once the run has ended (and after a Save). */
  const heldCount = useMemo(
    () =>
      conversation.items.reduce(
        (sum, item) =>
          item.kind === "assistant"
            ? sum + item.tools.filter((row) => row.status === "held").length
            : sum,
        0,
      ),
    [conversation.items],
  );
  const ended = loaded && !live;
  const shownHere = poll.shown === id;
  const [savedTimes, setSavedTimes] = useState(0);
  const reviewState = useReview(
    shownHere ? id : undefined,
    `${heldCount}:${ended}`,
    heldCount > 0 && ended,
  );
  const review = reviewState.review;

  const written = useMemo(
    () => runChanges(conversation.messages),
    [conversation.messages],
  );
  /* 46d: the hosts the conversation has seen — a link there is a real
   * page — and the slugs this site's tools answered with. */
  const known = useMemo(
    () => ({
      hosts: hostsOf(conversationUrls(conversation.messages)),
      slugs: siteSlugsOf(conversation.messages),
    }),
    [conversation.messages],
  );
  const writtenKey = `${written.commits}:${changeCount(written)}:${written.terms.length}:${live}:${savedTimes}`;
  const changes = useRunChanges(
    shownHere ? id : undefined,
    writtenKey,
    changesToShow(written) || savedTimes > 0 || heldCount > 0,
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
  const model = modelName(conversation);

  /* The run ended under the reader — or, started here, had ended by its
   * first read: the follow-up box takes focus if nothing else has it (Stop,
   * which did, is gone) or this view put it. */
  const seen = useRef<{ id: string; running: boolean; loaded: boolean }>({
    id,
    running: false,
    loaded: false,
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { id, running: loaded && live, loaded };
    if (before.id !== id || !ended) return;
    if (!before.running && (before.loaded || !focusOnOpen)) return;
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      active === headingRef.current ||
      footerRef.current?.contains(active)
    ) {
      followUpRef.current?.focus();
    }
  }, [id, loaded, live, ended, focusOnOpen]);

  const stop = async () => {
    setStopping(true);
    setStopError(await requestCancel(id));
    poll.refresh();
  };

  if (poll.error && records.length === 0) {
    return (
      <section aria-labelledby="curator-run-heading">
        <h2
          id="curator-run-heading"
          ref={headingRef}
          tabIndex={-1}
          className="sr-only"
        >
          This run
        </h2>
        <p role="alert" className="border-l-2 border-destructive pl-2 text-sm">
          This run can&apos;t be read: {poll.error}
        </p>
      </section>
    );
  }

  /* Ask → Working → Review (variant B). */
  const pending = review?.pending ?? (ended ? heldCount : 0);
  const decided = review ? review.calls.length - review.pending : 0;
  const firstAsk = segments[0]?.ask;
  const stages: Stage[] = [
    {
      name: "Ask",
      note: firstAsk ? (
        <>
          sent{" "}
          <span data-testid="curator-time">
            <When epoch={Date.parse(firstAsk.t)} timeOnly />
          </span>
        </>
      ) : (
        "sent"
      ),
      state: "done",
    },
    {
      name: "Working",
      note: live
        ? conversation.turns === 0
          ? "starting…"
          : `${conversation.turns} ${conversation.turns === 1 ? "turn" : "turns"} so far`
        : `${conversation.turns} ${conversation.turns === 1 ? "turn" : "turns"}${durationMs !== undefined ? ` · ${durationText(durationMs)}` : ""} · ${conversation.end?.stop === "done" ? "done" : "ended"}`,
      state: live ? "current" : "done",
    },
    {
      name: "Review",
      note: live
        ? "when it ends"
        : heldCount === 0
          ? changeCount(written) > 0
            ? "written as it ran"
            : "nothing to review"
          : pending > 0
            ? `${pending} ${pending === 1 ? "change" : "changes"} waiting for you`
            : `${decided} reviewed`,
      state: live ? "next" : pending > 0 ? "current" : "done",
    },
  ];
  const maxCostUsd = conversation.start?.maxCostUsd;
  const costSoFar = conversation.costSoFar ?? conversation.end?.costEstimate;

  return (
    <section
      aria-labelledby="curator-run-heading"
      data-testid="curator-run"
      data-run={id}
      data-live={String(live)}
      className="flex min-w-0 flex-col gap-5"
    >
      <h2
        id="curator-run-heading"
        ref={headingRef}
        tabIndex={-1}
        className="sr-only"
      >
        This run
      </h2>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Run · {model}
            {conversation.start ? (
              <>
                {" · "}
                <span data-testid="curator-time">
                  <When epoch={Date.parse(conversation.start.t)} />
                </span>
              </>
            ) : null}
          </p>
          {firstAsk ? (
            <p
              data-testid="curator-ask"
              className="font-display text-xl leading-snug font-semibold tracking-tight whitespace-pre-wrap [overflow-wrap:anywhere] sm:text-2xl"
            >
              <span className="sr-only">You asked: </span>
              {firstAsk.text}
            </p>
          ) : null}
        </div>
        {newAsk ? <div className="flex shrink-0 gap-2">{newAsk}</div> : null}
      </div>

      <StageStrip stages={stages} />
      <BudgetMeter
        {...(costSoFar !== undefined ? { costSoFar } : {})}
        {...(maxCostUsd !== undefined ? { maxCostUsd } : {})}
        turns={conversation.turns}
        maxTurns={budget}
        live={live}
      />

      <ol aria-label="Asks" className="flex flex-col gap-6">
        {segments.map((segment, index) => (
          <Segment
            key={segment.key}
            segment={segment}
            first={index === 0}
            newest={index === segments.length - 1}
            live={live}
            model={model}
            known={known}
            {...(origin ? { origin } : {})}
            conversation={conversation}
            following={following}
            onImportAll={(urls) =>
              void onFollowUp(
                `Import these recipes:\n${urls.map((url) => `- ${url}`).join("\n")}`,
              )
            }
          />
        ))}
      </ol>

      {review && review.calls.length > 0 ? (
        <ReviewPanel
          id={id}
          review={review}
          model={model}
          onSaved={(next) => {
            reviewState.set(next);
            setSavedTimes((count) => count + 1);
            /* The runs list (server-rendered) now says Saved, not Review. */
            router.refresh();
          }}
        />
      ) : null}

      {changes && changesToShow(changes) ? (
        <ChangesCard changes={changes} />
      ) : null}

      <div
        ref={footerRef}
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
            ref={statusRef}
            tabIndex={-1}
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
        {poll.error && records.length > 0 && (
          <p
            role="alert"
            data-testid="curator-poll-error"
            className="border-l-2 border-destructive pl-2 text-sm"
          >
            Can&apos;t read this run right now: {poll.error}
          </p>
        )}
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
            inputRef={followUpRef}
            rows={2}
            placeholder="And two more like that"
            {...(followError ? { error: followError } : {})}
          />
        )}
      </div>
    </section>
  );
}
