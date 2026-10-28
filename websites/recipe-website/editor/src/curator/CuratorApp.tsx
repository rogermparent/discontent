"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import type {
  CuratorRunRow,
  CuratorSetup,
} from "recipe-editor/controller/agent/curator";
import { PromptForm } from "./PromptForm";
import { RecentRuns } from "./RecentRuns";
import { RunView } from "./RunView";
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
 */
export async function startRun(
  prompt: string,
  {
    runId,
    newerWebTools,
  }: {
    runId?: string;
    /** 46d: Claude's newer web tools for this run (a follow-up keeps its own). */
    newerWebTools?: boolean;
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
 * The curator page (44d): the head (what it is, what runs it, whether it
 * can search the web), the ask — or the open run as a conversation — and
 * the recent runs. `run` and `prompt` are the URL's (`?run=`, `?prompt=`):
 * a run opens from a link and Back goes back; ⌘K fills `prompt` without
 * starting it (Ed6).
 */
export function CuratorApp({
  setup,
  runs,
  run,
  prompt,
  maxPrompt,
  maxTurns,
}: {
  setup: CuratorSetup;
  runs: CuratorRunRow[];
  run?: string;
  prompt?: string;
  maxPrompt: number;
  maxTurns: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(prompt ?? "");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  /* 46d: Claude's newer web tools, off by default (Ea3), per run. */
  const [newerWebTools, setNewerWebTools] = useState(false);
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

  const start = async () => {
    setStarting(true);
    setStartError(undefined);
    const answer = await startRun(draft.trim(), {
      newerWebTools: setup.api === "anthropic" && newerWebTools,
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
    /* The run's own setting carries over on the server (46d). */
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

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-6" data-testid="curator-main">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-3xl font-bold tracking-tight">
            Curator
          </h1>
          <p className="text-sm">
            Finds, fetches and imports recipes with the same tools Claude Code
            uses.
          </p>
          <p
            className="text-sm text-muted-foreground"
            data-testid="curator-setup"
          >
            Running on {setup.model}.{" "}
            {setup.search
              ? "Web search is on."
              : "Web search is off here: give it the URLs to read."}
          </p>
        </header>

        {run ? (
          <>
            <p>
              <Button asChild variant="outline" size="sm">
                <Link href="/curator">New ask</Link>
              </Button>
            </p>
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
            />
          </>
        ) : (
          <PromptForm
            label="What should the curator do?"
            testId="curator-ask-form"
            value={draft}
            onChange={setDraft}
            onSubmit={() => void start()}
            submitLabel="Start"
            busyLabel="Starting…"
            busy={starting}
            max={maxPrompt}
            inputRef={inputRef}
            rows={4}
            placeholder="Find, fetch, import — ask in plain words"
            {...(startError ? { error: startError } : {})}
          >
            {setup.api === "anthropic" && (
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
                    Claude&apos;s web search with dynamic filtering: fewer
                    tokens on a search-heavy ask. Its follow-ups keep it.
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <p
                className="text-xs text-muted-foreground"
                id="curator-examples"
              >
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
                      onClick={() => fill(example)}
                    >
                      {example}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </PromptForm>
        )}
      </div>
      <RecentRuns runs={runs} {...(run ? { current: run } : {})} />
    </div>
  );
}
