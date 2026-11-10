"use client";

/*
 * "Look for alternatives with the model" (46f): the Steps section's action
 * that asks the editor's model whether any adjacent groups are a choice.
 * The form is shared with the export's build and with /new-recipe, which
 * have no model; only the edit page provides this context (its server
 * actions start the job and wait for it), so the action appears there
 * alone. What comes back is offered as marked suggestions — "suggested by
 * the model" — that the person accepts or puts away (G5).
 */
import { createContext, useContext, useId } from "react";
import { Button } from "@discontent/component-library/components/Button";
import type { OutlineEntry } from "../../../util/choiceOutline";
import type { SuggestedChoice } from "../../../util/suggestChoices";

/** One long-poll's answer: still running, the sets found, or why none. */
export interface ModelChoicesOutcome {
  pending?: true;
  sets?: SuggestedChoice[];
  warnings?: string[];
  /** Who answered ("local model qwen3:8b"). */
  model?: string;
  message?: string;
}

export interface ModelChoices {
  /** Who would answer ("local model qwen3:8b"); absent when none is set up. */
  model?: string;
  /** Why the action is off, said beside it, when no model is set up. */
  unavailable?: string;
  /** Start a look over the steps' outline: the job's id, or why not. */
  start: (
    name: string,
    outline: OutlineEntry[],
  ) => Promise<{ job?: string; message?: string }>;
  /** One bounded wait for the look's outcome. */
  result: (job: string) => Promise<ModelChoicesOutcome>;
}

const ModelChoicesContext = createContext<ModelChoices | undefined>(undefined);

export const ModelChoicesProvider = ModelChoicesContext.Provider;

/** The edit page's model action, or `undefined` anywhere else. */
export function useModelChoices(): ModelChoices | undefined {
  return useContext(ModelChoicesContext);
}

/** The words the mark of a model's suggestion wears. */
export const SUGGESTED_BY_MODEL = "suggested by the model";

/** Where a look stands. */
export interface LookState {
  status: "idle" | "asking" | "done";
  job?: string;
  /** What the last look said: found, nothing found, or why it failed. */
  message?: string;
}

/**
 * The action and what it said: a button beside "Make a choice of
 * groups…", disabled with the reason when no model is set up, "Asking …"
 * while the job runs (its id links to /jobs), then one line of outcome.
 */
export function LookForChoices({
  modelChoices,
  look,
  onLook,
}: {
  modelChoices: ModelChoices;
  look: LookState;
  onLook: () => void;
}) {
  const reasonId = useId();
  const off = !modelChoices.model;
  const asking = look.status === "asking";
  return (
    <div className="mx-0.5 my-1 flex flex-col gap-1">
      <Button
        variant="ghost"
        className="self-start max-sm:h-11"
        data-focus="look"
        disabled={off || asking}
        aria-describedby={off ? reasonId : undefined}
        onClick={onLook}
      >
        {asking ? "Asking the model…" : "Look for alternatives with the model"}
      </Button>
      <p
        id={reasonId}
        role="status"
        data-testid="model-choices-status"
        className="text-sm text-muted-foreground"
      >
        {off ? (
          modelChoices.unavailable
        ) : asking ? (
          <>
            Asking {modelChoices.model}
            {look.job ? (
              <>
                {" "}
                (
                <a className="underline" href={`/jobs/${look.job}`}>
                  the job
                </a>
                )
              </>
            ) : null}
            …
          </>
        ) : (
          look.message
        )}
      </p>
    </div>
  );
}
