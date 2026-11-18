"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import type {
  CuratorModelOption,
  CuratorRunRow,
  CuratorSetup,
} from "recipe-editor/controller/agent/curator";
import { ModelChoice } from "./ModelChoice";
import { PromptForm } from "./PromptForm";
import { RecentRuns, type RunFilter } from "./RecentRuns";
import { RunView } from "./RunView";
import { StageStrip } from "./RunParts";
import { useAgentRun } from "./useAgentRun";

/**
 * Asks that show what the curator does, true to its tools: a search of the
 * web and the corpus, an import that tags, and a corpus read that tags.
 * The import's box ends at the URL, for the person to paste one.
 */
export const CURATOR_EXAMPLES = [
  "Find three pork shoulder braises I don't have yet",
  "Import this recipe and tag it by course and cuisine: https://",
  "Which of my recipes use gochujang? Tag the Korean ones korean",
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
  }: {
    runId?: string;
    /** 46d: Claude's newer web tools for this run (a follow-up keeps its own). */
    newerWebTools?: boolean;
    /** 48b: who answers, where the editor has both (a follow-up keeps its own). */
    model?: CuratorModelOption["id"];
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
}) {
  const chosen =
    setup.models?.find((option) => option.id === model) ?? setup.models?.[0];
  const newer = chosen ? chosen.newerWebTools : setup.newerWebTools;
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
}: {
  setup: CuratorSetup;
  runs: CuratorRunRow[];
  run?: string;
  prompt?: string;
  filter?: RunFilter;
  maxPrompt: number;
  maxTurns: number;
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
    });
    setStarting(false);
    if ("error" in answer) {
      setStartError(answer.error);
      return;
    }
    setDraft("");
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

  const fill = (example: string) => {
    setDraft(example);
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
            newAsk={
              <Button asChild variant="outline" size="sm">
                <Link href="/curator">New ask</Link>
              </Button>
            }
          />
        ) : (
          <>
            {ask(false)}
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
