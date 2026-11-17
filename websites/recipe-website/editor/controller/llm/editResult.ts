/**
 * What an `edit` job (47i) is and answers — types and one guard, with no
 * imports but types: the edit page's client box reads results with it, and
 * `askEdit.ts` (the model client, `node:fs` and all) must never be in the
 * browser's bundle.
 */
import type { EditValues } from "recipe-website-common/util/editRequest";
import type { StepUsesAnswer } from "recipe-website-common/util/usesSuggestions";
import type { EditCheck } from "./editCheck";

/** Which of them a request asked for: the default, or Claude. */
export type EditBackend = "local" | "claude";

/** What an `edit` job answers. */
export type EditResult = {
  /** The job that ran it: `recipes jobs show <job>` has its steps. */
  job?: string;
  slug: string;
  /** Who answered, or who would have. */
  model?: string;
  backend?: EditBackend;
  /** The tokens and the estimated cost (Claude only). */
  promptTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  costEstimateUsd?: number;
  /** Whether the Claude API is there to try instead (the panel's offer). */
  claudeAvailable?: boolean;
} & (
  | ({ task: "request"; request: string } & (
      | EditCheck
      | { status: "failed"; problem: string; note: string; warnings: string[] }
    ))
  | {
      task: "uses";
      status: "uses" | "failed";
      answers: StepUsesAnswer[];
      /** The steps whose suggestion differs from what the page shows now. */
      offered: number[];
      problem?: string;
      warnings: string[];
    }
);

/** An `edit` job's spec, as `kinds.ts` holds it. */
export interface EditSpec {
  kind: "edit";
  slug: string;
  task: "request" | "uses";
  /** The request as typed (`task: "request"`). */
  request?: string;
  /** The form's values the model reads. */
  recipe: EditValues;
  /** `claude`: the Claude API was asked for; else the default. */
  backend?: EditBackend;
}

/** Whether `result` is an `edit` job's (the `?edit=` link, the panel). */
export function isEditResult(value: unknown): value is EditResult {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as EditResult).slug === "string" &&
    ((value as EditResult).task === "request" ||
      (value as EditResult).task === "uses")
  );
}
