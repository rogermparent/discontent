"use client";

import { useCallback, useState, type ReactNode } from "react";
import type {
  ShoppingAskResult,
  ShoppingAskStart,
  ShoppingModelProposal,
} from "../../util/shoppingAsk";

/**
 * 49b: what the editor hands the shopping page to ask the model — passed in
 * as `MakePage`'s actions are, so nothing here imports the editor (nor the
 * job's code: 47i's Ti7). Without it the page asks nothing and shows no
 * note field, no "Ask the model" and no "Look for more".
 */
export interface ShoppingAskSurface {
  /** Who answers ("local model qwen3:8b"). */
  model: string;
  /** The Claude API, when it is here beside a local model ("Try with Claude"). */
  claude?: string;
  /** Start a `shopping-merge` job over the list as it is now. */
  start(input: ShoppingAskStart): Promise<{
    job?: string;
    /** False: the job has no record — `progress` long-polls its outcome. */
    stored?: boolean;
    model?: string;
    message?: string;
  }>;
  /** The job's live panel (the editor's `ImportProgress`); calls `settled` once. */
  progress(props: ShoppingAskProgressProps): ReactNode;
}

export interface ShoppingAskProgressProps {
  job: string;
  stored: boolean;
  task: "revise" | "find";
  /** Who is asked: "Asking local model qwen3:8b…". */
  model: string;
  settled(outcome: {
    result?: ShoppingAskResult;
    message?: string;
    cancelled?: boolean;
  }): void;
}

/** What is being asked about: a proposal's id, a merged row's id, or more. */
export type AskTopic =
  { kind: "revise"; id: string; keys?: string[] } | { kind: "find" };

interface Running {
  job: string;
  stored: boolean;
  task: "revise" | "find";
  model: string;
  topic: AskTopic;
  input: ShoppingAskStart;
}

/**
 * The page's asks (49b): one job at a time, as Edit with AI's box — the
 * latest revise's result and the latest find's proposals, each until the
 * person acts on it or asks again. Nothing here writes.
 */
export function useShoppingAsk(surface: ShoppingAskSurface | undefined) {
  const [running, setRunning] = useState<Running>();
  const [settledJob, setSettledJob] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string>();
  /* The latest revise's answer, and the topic it answered. */
  const [revised, setRevised] = useState<{
    topic: AskTopic;
    result: ShoppingAskResult;
    input: ShoppingAskStart;
  }>();
  /* The latest find's answer; its proposals leave as they are answered. */
  const [found, setFound] = useState<{
    result: ShoppingAskResult;
    open: ShoppingModelProposal[];
  }>();
  /* A merged row the person asked about from its menu (its decision's id). */
  const [about, setAbout] = useState<string>();

  const busy = starting || (!!running && settledJob !== running.job);

  const ask = useCallback(
    async (input: ShoppingAskStart, topic: AskTopic) => {
      if (!surface) return;
      setStarting(true);
      setMessage(undefined);
      if (topic.kind === "find") setFound(undefined);
      else setRevised(undefined);
      try {
        const started = await surface.start(input);
        if (!started.job) {
          setMessage(started.message ?? "The ask did not start.");
          return;
        }
        setRunning({
          job: started.job,
          stored: started.stored !== false,
          task: input.task,
          model: started.model ?? surface.model,
          topic,
          input,
        });
      } catch (error) {
        setMessage(
          `The ask did not start: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setStarting(false);
      }
    },
    [surface],
  );

  const settle = useCallback(
    (
      job: string,
      outcome: {
        result?: ShoppingAskResult;
        message?: string;
        cancelled?: boolean;
      },
    ) => {
      setSettledJob(job);
      const current = running?.job === job ? running : undefined;
      if (!current) return;
      const { result } = outcome;
      if (!result) {
        setMessage(
          outcome.cancelled
            ? "The ask was cancelled; nothing changed."
            : (outcome.message ?? "The ask did not finish."),
        );
        return;
      }
      if (result.task !== current.task) {
        setMessage("That job isn't this ask.");
        return;
      }
      if (result.task === "find") {
        setFound({
          result,
          open: result.status === "found" ? result.proposals : [],
        });
      } else {
        setRevised({ topic: current.topic, result, input: current.input });
      }
    },
    [running],
  );

  return {
    available: !!surface,
    surface,
    model: surface?.model ?? "",
    busy,
    running,
    settledJob,
    message,
    revised,
    found,
    about,
    ask,
    settle,
    /** Open the note for a merged row (its menu's "Ask the model about this"). */
    askAbout: (id: string) => {
      setAbout(id);
      setMessage(undefined);
    },
    closeAbout: () => setAbout(undefined),
    /** Discard (or accepted): the revise's suggestion goes. */
    clearRevised: () => setRevised(undefined),
    /** A found proposal answered (merged, kept apart): it leaves the list. */
    answeredFound: (id: string) =>
      setFound((current) =>
        current
          ? {
              ...current,
              open: current.open.filter((each) => each.proposal.id !== id),
            }
          : current,
      ),
    clearMessage: () => setMessage(undefined),
  };
}

export type ShoppingAsker = ReturnType<typeof useShoppingAsk>;
