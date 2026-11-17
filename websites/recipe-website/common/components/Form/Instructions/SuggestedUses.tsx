"use client";

/*
 * What a fill's model suggests a step uses (47g), in the Steps section: a
 * marked card under the step with the lines it would list, **Accept** and
 * **Dismiss**; once accepted the step's chips are the suggestion's and the
 * mark stays, with **Undo**, until Save. Nothing is applied by itself and
 * nothing is stored but an accepted list (memory `ai-changes-need-approval`,
 * as 45e2's suggested choices). "Accepted" is what the person pressed in
 * this form, kept in state — never read off the step's list, so a list a
 * person saved is never shown as the model's, and Undo puts back exactly
 * what the step had.
 *
 * A suggestion is for the step's text as the model read it, and for the
 * ingredient lines its names still find: edit the step and it goes. It is
 * offered only while it differs from what the step shows — so accepting one
 * can bring out another, where the stored list moves a later step's guess
 * (47f Df5).
 */
import type { ReactNode } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { numberList } from "../../../util/usesSuggestions";

/** Where one step's suggestion stands. */
export interface StepSuggestion {
  status: "offered" | "accepted";
  /** The names to store. */
  uses: string[];
  /** The ingredient lines they mean now. */
  lines: number[];
}

export interface UsesSuggestions {
  /** Who suggested: "local model qwen3:8b". */
  model: string;
  /** `entry:step` → the suggestion in play there. */
  at: ReadonlyMap<string, StepSuggestion>;
  /** Note that the step's suggestion is being accepted, over `previous`. */
  accept: (entry: number, step: number, previous: string[] | undefined) => void;
  dismiss: (entry: number, step: number) => void;
  /** Forget the acceptance; answers what the step stored before it. */
  undo: (entry: number, step: number) => string[] | undefined;
}

/** The dashed tape a suggestion wears until Save (45b's estimated tape). */
function Tape({ children }: { children: ReactNode }) {
  return (
    <span
      data-kind="missing"
      data-testid="step-uses-suggested-mark"
      className="make-tape px-2 py-1 font-mono text-[0.75rem] leading-none"
    >
      {children}
    </span>
  );
}

const CHIP =
  "rounded-sm border border-dashed border-border px-1.5 py-1 font-mono text-xs leading-none text-muted-foreground";

/**
 * One step's suggestion: offered (the lines, Accept, Dismiss) or accepted
 * (the mark and Undo). The buttons carry `data-uses-accept` /
 * `data-uses-undo` so the step can keep focus beside them after a press.
 */
export function StepUsesSuggestion({
  number,
  model,
  suggestion,
  labels,
  onAccept,
  onDismiss,
  onUndo,
}: {
  /** The step's number, in reading order. */
  number: number | undefined;
  model: string;
  suggestion: StepSuggestion;
  /** Each ingredient line's chip label. */
  labels: readonly string[];
  onAccept: () => void;
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const step = number === undefined ? "this step" : `step ${number}`;
  if (suggestion.status === "accepted") {
    return (
      <p
        className="flex flex-wrap items-center gap-2 text-xs"
        data-testid="step-uses-suggestion"
        data-state="accepted"
      >
        <Tape>suggested by {model}</Tape>
        <span className="text-muted-foreground">Accepted. Not saved yet.</span>
        <Button
          variant="ghost"
          size="sm"
          data-uses-undo
          data-focus="uses-undo"
          className="h-7 px-2 text-xs max-sm:h-9"
          aria-label={`Undo the suggested ingredients for ${step}`}
          onClick={onUndo}
        >
          Undo
        </Button>
      </p>
    );
  }
  return (
    <div
      role="group"
      aria-label={`Suggested by ${model} for ${step}: uses ${
        suggestion.lines.map((line) => labels[line]).join(", ") || "nothing"
      }`}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      data-testid="step-uses-suggestion"
      data-state="offered"
    >
      <Tape>suggested by {model}</Tape>
      <span className="text-muted-foreground">uses</span>
      {suggestion.lines.length ? (
        <ul role="list" className="contents">
          {suggestion.lines.map((line) => (
            <li key={line} className={CHIP} data-testid="step-uses-offer">
              {labels[line]}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted-foreground">nothing</span>
      )}
      <Button
        variant="outline"
        size="sm"
        data-uses-accept
        className="h-7 px-2 text-xs max-sm:h-9"
        aria-label={`Accept the suggested ingredients for ${step}`}
        onClick={onAccept}
      >
        Accept
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-uses-dismiss
        className="h-7 px-2 text-xs max-sm:h-9"
        aria-label={`Dismiss the suggested ingredients for ${step}`}
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  );
}

/**
 * Above the steps: which steps have a suggestion waiting, and one press to
 * accept them all. Shown while any is offered.
 */
export function UsesSuggestionsSummary({
  model,
  offered,
  onAcceptAll,
}: {
  model: string;
  /** The numbers of the steps with a suggestion on offer. */
  offered: readonly number[];
  onAcceptAll: () => void;
}) {
  if (offered.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Suggested ingredients for the steps"
      data-testid="step-uses-suggestions"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm"
    >
      <p className="min-w-0 flex-1 basis-64">
        <span className="font-medium">
          {model.charAt(0).toUpperCase() + model.slice(1)}
        </span>{" "}
        suggests what step{offered.length === 1 ? "" : "s"}{" "}
        {numberList(offered)} use{offered.length === 1 ? "s" : ""}. Accept or
        dismiss each under its step; nothing is saved until Save.
      </p>
      {offered.length > 1 ? (
        <Button
          variant="outline"
          className="max-sm:h-11"
          data-focus="uses-accept-all"
          onClick={onAcceptAll}
        >
          Accept all {offered.length}
        </Button>
      ) : null}
    </div>
  );
}
