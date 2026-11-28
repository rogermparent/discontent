"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import type {
  CuratorModelOption,
  CuratorRunRow,
  CuratorSetup,
} from "recipe-editor/controller/agent/curator";
import {
  guessIntent,
  type AgentIntent,
  type AgentIntentChoice,
} from "recipe-editor/controller/agent/intents/guess";
import { planPreview } from "recipe-editor/controller/agent/planSteps";
import { IntentName, IntentRow } from "./IntentRow";
import { ModelChoice } from "./ModelChoice";
import { PlanSteps } from "./PlanSteps";
import type { CuratorShopping } from "./ResultCards";
import { PromptForm } from "./PromptForm";
import { RecentRuns, type RunFilter } from "./RecentRuns";
import { RunView } from "./RunView";
import { StageStrip } from "./RunParts";
import { useAgentRun } from "./useAgentRun";

/**
 * Asks that show what the curator does, one per intent (51d, the mock-up's
 * two first): new recipes from the web, which of yours fit, a holiday's
 * plan, a tagging read, and an import (the open loop) whose box ends at the
 * URL, for the person to paste one.
 */
export const CURATOR_EXAMPLES = [
  "3 pulled pork recipes I don't already have",
  "Recipes that work well in small batches with a milk frother",
  "Plan Christmas dinner from its menu",
  "Which of my recipes use gochujang? Tag the Korean ones korean",
  "Import this recipe and tag it by course and cuisine: https://",
] as const;

/**
 * `POST /api/agent` (44c): the new run's id, or why it was refused (no
 * model, an ask over the cap, a run still live — the editor's own words).
 * The page's runs hold their writes for review (48b, Db1): `hold: true`.
 */
export async function startRun(
  prompt: string,
  {
    runId,
    newerWebTools,
    model,
    intent,
  }: {
    runId?: string;
    /** 46d: Claude's newer web tools for this run (a follow-up keeps its own). */
    newerWebTools?: boolean;
    /** 48b: who answers, where the editor has both (a follow-up keeps its own). */
    model?: CuratorModelOption["id"];
    /** 51d (D1): the intent picked, or `auto` for the guess; a follow-up none. */
    intent?: AgentIntentChoice;
  } = {},
): Promise<{ job: string } | { error: string }> {
  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        ...(runId ? { runId } : {}),
        ...(newerWebTools ? { newerWebTools: true } : {}),
        ...(model ? { model } : {}),
        ...(intent ? { intent } : {}),
        hold: true,
      }),
    });
    const body = (await response.json().catch(() => undefined)) as
      { job?: string; error?: { message?: string } } | undefined;
    if (response.ok && typeof body?.job === "string") return { job: body.job };
    return {
      error: body?.error?.message ?? `The editor answered ${response.status}.`,
    };
  } catch (error) {
    return {
      error: `Couldn't reach the editor: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * The line under the intent row (51d, D1; the mock-up's): the guess from
 * the words and why, or the person's pick beside the guess, with a way
 * back to the guess. Read from `guess.ts`, the server's own rules, so the
 * page and the run never disagree; nothing is stored (no `localStorage`).
 */
function guessLine(
  picked: AgentIntent | undefined,
  guess: { id: AgentIntent; why: string } | undefined,
  onUseGuess: () => void,
  typed: boolean,
): { line: ReactNode; action?: ReactNode } {
  /* Beside the line, not in the group's description (51d review 6). */
  const back = (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto min-h-6 px-0"
      onClick={onUseGuess}
    >
      {guess ? "Use the guess" : "Let it guess"}
    </Button>
  );
  if (picked) {
    return guess && guess.id !== picked
      ? {
          line: (
            <>
              You picked <IntentName id={picked} />. The guess was{" "}
              <IntentName id={guess.id} />: {guess.why}.
            </>
          ),
          action: back,
        }
      : {
          line: (
            <>
              You picked <IntentName id={picked} />.
            </>
          ),
          ...(guess ? {} : { action: back }),
        };
  }
  if (guess) {
    return {
      line: (
        <>
          Looks like <IntentName id={guess.id} />, guessed from your words:{" "}
          {guess.why}. Pick another to change it.
        </>
      ),
    };
  }
  return {
    line: typed
      ? "No guess from these words: the model decides when you ask, or pick one."
      : "Pick what kind of ask it is, or just ask: it guesses from your words.",
  };
}

/** The ask's box with who answers, the newer-tools toggle and the examples. */
function AskPanel({
  setup,
  draft,
  setDraft,
  start,
  starting,
  startError,
  model,
  setModel,
  newerWebTools,
  setNewerWebTools,
  maxPrompt,
  inputRef,
  compact,
  onExample,
  intent,
  onPickIntent,
  onUseGuess,
}: {
  setup: CuratorSetup;
  draft: string;
  setDraft: (value: string) => void;
  start: () => void;
  starting: boolean;
  startError?: string;
  model: CuratorModelOption["id"] | undefined;
  setModel: (id: CuratorModelOption["id"]) => void;
  newerWebTools: boolean;
  setNewerWebTools: (value: boolean) => void;
  maxPrompt: number;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** In the side column beside an open run: no examples. */
  compact: boolean;
  onExample: (example: string) => void;
  /** 51d: the intent the person picked; none, the guess from the words. */
  intent: AgentIntent | undefined;
  onPickIntent: (intent: AgentIntent) => void;
  onUseGuess: () => void;
}) {
  const chosen =
    setup.models?.find((option) => option.id === model) ?? setup.models?.[0];
  const newer = chosen ? chosen.newerWebTools : setup.newerWebTools;
  const guess = draft.trim() ? guessIntent(draft) : undefined;
  return (
    <section
      aria-label={compact ? "New ask" : undefined}
      className={
        compact ? "rounded-lg border border-border bg-card p-3" : undefined
      }
      data-testid="curator-ask-panel"
    >
      <PromptForm
        label="What should the curator do?"
        testId="curator-ask-form"
        value={draft}
        onChange={setDraft}
        onSubmit={start}
        submitLabel="Start"
        busyLabel="Starting…"
        busy={starting}
        max={maxPrompt}
        inputRef={inputRef}
        rows={compact ? 3 : 4}
        placeholder="Find, fetch, import, tag — in plain words"
        {...(startError ? { error: startError } : {})}
        beforeForm={
          <IntentRow
            value={intent ?? guess?.id}
            onPick={onPickIntent}
            {...guessLine(intent, guess, onUseGuess, draft.trim() !== "")}
            testId={compact ? "curator-side-intents" : "curator-intents"}
          />
        }
        beforeSubmit={
          <ModelChoice setup={setup} value={model} onChange={setModel} />
        }
      >
        {newer && (
          <div
            className="flex items-start gap-2"
            data-testid="curator-newer-web-tools"
          >
            <Checkbox
              id="curator-newer-web-tools"
              className="mt-0.5"
              checked={newerWebTools}
              onCheckedChange={(value) => setNewerWebTools(value === true)}
              aria-describedby="curator-newer-web-tools-hint"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor="curator-newer-web-tools" className="text-sm">
                Use newer web tools
              </label>
              <p
                id="curator-newer-web-tools-hint"
                className="text-xs text-muted-foreground"
              >
                Claude&apos;s web search with dynamic filtering: fewer tokens on
                a search-heavy ask. Its follow-ups keep it.
              </p>
            </div>
          </div>
        )}
        {!compact && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground" id="curator-examples">
              Or start from an example:
            </p>
            <ul
              aria-labelledby="curator-examples"
              className="flex flex-col items-start gap-1.5"
            >
              {CURATOR_EXAMPLES.map((example) => (
                <li key={example} className="max-w-full">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-auto min-h-8 max-w-full justify-start text-left whitespace-normal"
                    onClick={() => onExample(example)}
                  >
                    {example}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PromptForm>
    </section>
  );
}

/**
 * The curator page (44d; variant B "Ask, watch, approve", 48b): the ask —
 * who answers, at what cost — then the run as Ask → Working → Review, its
 * writes held until the person saves them (Db1), and the recent runs with
 * what each holds for review. With a run open the ask moves to the side
 * column, above the runs. `run` and `prompt` are the URL's (`?run=`,
 * `?prompt=`): a run opens from a link and Back goes back; ⌘K fills
 * `prompt` without starting it (Ed6). `filter` (`?show=review`) opens the
 * runs list on those waiting for review (⌘K's count).
 */
export function CuratorApp({
  setup,
  runs,
  run,
  prompt,
  filter,
  maxPrompt,
  maxTurns,
  shopping,
}: {
  setup: CuratorSetup;
  runs: CuratorRunRow[];
  run?: string;
  prompt?: string;
  filter?: RunFilter;
  maxPrompt: number;
  maxTurns: number;
  /** 51d: a mine card's "Add to shopping list" (50d's picker, the lists). */
  shopping?: CuratorShopping;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(prompt ?? "");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  /* 46d: Claude's newer web tools, off by default (Ea3), per run. */
  const [newerWebTools, setNewerWebTools] = useState(false);
  /* 48b (Db5): who answers this ask: the editor's own model by default. */
  const [model, setModel] = useState<CuratorModelOption["id"] | undefined>(
    setup.models?.[0]?.id,
  );
  /* 51d (D1): the intent picked for the next ask; none, the guess (`auto`). */
  const [intent, setIntent] = useState<AgentIntent>();
  const [reasking, setReasking] = useState(false);
  const [reaskError, setReaskError] = useState<string>();
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string>();
  /* A follow-up just started from this run: keep it on screen meanwhile. */
  const [carryFrom, setCarryFrom] = useState<string>();
  /* A run started here takes focus when it opens (the box it was in is gone). */
  const [focusFor, setFocusFor] = useState<{
    id: string;
    where: "heading" | "status";
  }>();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* ⌘K's hand-off on this very page: a new `?prompt=` fills the box. */
  const [seenPrompt, setSeenPrompt] = useState(prompt);
  if (prompt !== seenPrompt) {
    setSeenPrompt(prompt);
    if (prompt) setDraft(prompt);
  }

  const poll = useAgentRun(run, { carryFrom });

  /* A run that ends moves the recent list: read it again. */
  const wasLive = useRef<{ id?: string; live: boolean }>({ live: false });
  useEffect(() => {
    const before = wasLive.current;
    wasLive.current = { id: run, live: poll.live && poll.loaded };
    if (before.id === run && before.live && poll.loaded && !poll.live) {
      router.refresh();
    }
  }, [run, poll.live, poll.loaded, router]);

  const chosen =
    setup.models?.find((option) => option.id === model) ?? setup.models?.[0];
  const start = async () => {
    setStarting(true);
    setStartError(undefined);
    const answer = await startRun(draft.trim(), {
      newerWebTools:
        (chosen ? chosen.newerWebTools : setup.newerWebTools) && newerWebTools,
      /* Only where there is a choice: else the editor's own model. */
      ...((setup.models?.length ?? 0) > 1 && model ? { model } : {}),
      /* 51d: the pick, else the guess: `auto`, so the server's rules (the
       * same `guess.ts`) or its model decide, never a second copy here. */
      intent: intent ?? "auto",
    });
    setStarting(false);
    if ("error" in answer) {
      setStartError(answer.error);
      return;
    }
    setDraft("");
    setIntent(undefined);
    setFocusFor({ id: answer.job, where: "heading" });
    router.push(`/curator?run=${answer.job}`);
  };

  const followUp = async (text: string): Promise<boolean> => {
    if (!run) return false;
    setFollowing(true);
    setFollowError(undefined);
    /* The run's own settings (newer tools, model) carry over on the server. */
    const answer = await startRun(text.trim(), { runId: run });
    setFollowing(false);
    if ("error" in answer) {
      setFollowError(answer.error);
      return false;
    }
    setCarryFrom(run);
    setFocusFor({ id: answer.job, where: "status" });
    /* The same conversation: the new run holds all of it (Ec3). */
    router.replace(`/curator?run=${answer.job}`);
    return true;
  };

  /* 51d (D1): the same ask again with another intent: a new run on the
   * same model, not a follow-up (a follow-up is the loop, 51b Db2). */
  const reask = async (text: string, next: AgentIntent): Promise<boolean> => {
    setReasking(true);
    setReaskError(undefined);
    const spec = poll.meta?.spec as
      { model?: unknown; newerWebTools?: unknown } | undefined;
    const runModel =
      spec?.model === "local" ||
      spec?.model === "import" ||
      spec?.model === "claude"
        ? spec.model
        : undefined;
    const answer = await startRun(text.trim(), {
      intent: next,
      /* 51d review 4: the run's own newer web tools come along too. */
      ...(spec?.newerWebTools === true ? { newerWebTools: true } : {}),
      ...(runModel && (setup.models?.length ?? 0) > 1
        ? { model: runModel }
        : {}),
    });
    setReasking(false);
    if ("error" in answer) {
      setReaskError(answer.error);
      return false;
    }
    setFocusFor({ id: answer.job, where: "heading" });
    router.push(`/curator?run=${answer.job}`);
    return true;
  };

  const fill = (example: string) => {
    setDraft(example);
    /* 51d: an example is guessed afresh, as the mock-up does. */
    setIntent(undefined);
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    requestAnimationFrame(() =>
      input.setSelectionRange(example.length, example.length),
    );
  };

  const ask = (compact: boolean) => (
    <AskPanel
      setup={setup}
      draft={draft}
      setDraft={setDraft}
      start={() => void start()}
      starting={starting}
      {...(startError ? { startError } : {})}
      model={model}
      setModel={setModel}
      newerWebTools={newerWebTools}
      setNewerWebTools={setNewerWebTools}
      maxPrompt={maxPrompt}
      inputRef={inputRef}
      compact={compact}
      onExample={fill}
      intent={intent}
      onPickIntent={setIntent}
      onUseGuess={() => setIntent(undefined)}
    />
  );
  const waiting = runs.filter((row) => row.review > 0).length;

  return (
    <div className="grid min-w-0 gap-6 [grid-template-areas:'head'_'main'_'side'] lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-x-8 lg:[grid-template-areas:'head_main'_'side_main'] lg:grid-rows-[auto_1fr]">
      <header className="flex items-center justify-between gap-3 [grid-area:head] lg:items-start">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-3xl font-bold tracking-tight">
            Curator
          </h1>
          <p className="text-sm">
            Finds, fetches and imports recipes with the same tools Claude Code
            uses — and holds every change for you to approve.
          </p>
        </div>
        {/* Phone: the runs list is below the run; this jumps to it. */}
        <Button asChild variant="outline" className="min-h-11 lg:hidden">
          <a href="#curator-runs">
            Runs · {runs.length}
            {waiting > 0 ? (
              <span className="sr-only">, {waiting} to review</span>
            ) : null}
          </a>
        </Button>
      </header>

      <div
        className="flex min-w-0 flex-col gap-6 [grid-area:main]"
        data-testid="curator-main"
      >
        {run ? (
          <RunView
            id={run}
            poll={poll}
            maxTurns={maxTurns}
            maxPrompt={maxPrompt}
            onFollowUp={followUp}
            following={following}
            {...(carryFrom ? { carryFrom } : {})}
            {...(focusFor?.id === run ? { focusOnOpen: focusFor.where } : {})}
            {...(followError ? { followError } : {})}
            onReask={reask}
            reasking={reasking}
            {...(reaskError ? { reaskError } : {})}
            {...(shopping ? { shopping } : {})}
            newAsk={
              <Button asChild variant="outline" size="sm">
                <Link href="/curator">New ask</Link>
              </Button>
            }
          />
        ) : (
          <>
            {ask(false)}
            <PlanSteps
              steps={planPreview(
                intent ??
                  (draft.trim() ? guessIntent(draft)?.id : undefined) ??
                  "any",
              )}
              heading="What it will do"
              headingLevel={2}
              preview
            />
            <section
              aria-labelledby="curator-how"
              className="flex flex-col gap-2"
            >
              <h2
                id="curator-how"
                className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                How a run goes
              </h2>
              <StageStrip
                stages={[
                  { name: "Ask", note: "in plain words", state: "current" },
                  {
                    name: "Working",
                    note: "watch what it reads",
                    state: "next",
                  },
                  {
                    name: "Review",
                    note: "nothing saves until you do",
                    state: "next",
                  },
                ]}
                label="How a run goes"
              />
            </section>
          </>
        )}
      </div>

      <aside
        className="flex min-w-0 flex-col gap-6 [grid-area:side]"
        aria-label="Asks and runs"
      >
        {run ? ask(true) : null}
        <RecentRuns
          runs={runs}
          {...(run ? { current: run } : {})}
          {...(filter ? { initialFilter: filter } : {})}
        />
      </aside>
    </div>
  );
}
