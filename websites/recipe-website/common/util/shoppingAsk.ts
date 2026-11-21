/**
 * 49b: asking the model about the shopping list's "same thing, different
 * names" — what a `shopping-merge` job answers, and what the page sends to
 * start one. Types and pure helpers only: the page reads results with them,
 * and the job's code (the model client, `node:fs` and all) must never be in
 * the browser's bundle (47i's Ti7).
 *
 * - **revise** (Db1): one proposal, or one merged row, with a note from the
 *   person ("these are different, one is salted", "use grams"). The model
 *   answers a revised proposal in 49a's shape, or "keep these apart".
 * - **find** (Db2): "Look for more with the model" — the list's names, and
 *   groups a shopper buys as one thing, as proposals in the same shape.
 *
 * Nothing here writes: a result's `decision` is what Accept (or Merge, Keep
 * apart) sends to the seat's `decideShoppingMerge`, and only the person's
 * press sends it (the "AI changes need approval" rule).
 */
import { MERGE_LIMITS, type ShoppingMerge } from "./shoppingMerges";
import type {
  ShoppingProposal,
  ShoppingProposalRow,
} from "./shoppingConsolidate";

/** A note for the model: as long as a decision's stored note may be. */
export const SHOPPING_ASK_NOTE_MAX = MERGE_LIMITS.note;

/** What the page (or the CLI) asks: about one proposal or merge, or for more. */
export type ShoppingAskStart =
  | {
      task: "revise";
      /** An open proposal's or a stored decision's id … */
      id?: string;
      /** … or the names themselves (a model's own proposal). */
      keys?: string[];
      note: string;
      claude?: boolean;
    }
  | { task: "find"; claude?: boolean };

/**
 * What Accept, Merge or Keep apart sends: the seat's merge input
 * (`ShoppingMergeSchema`). `replaces` names a merged decision this one
 * takes the place of (a merged row the model splits, or keeps apart).
 */
export interface ShoppingAskDecision {
  keys: string[];
  status: "merged" | "apart";
  name?: string;
  amount?: string;
  note?: string;
  replaces?: string;
}

/** What was asked about (revise): its names, and what the list says now. */
export interface ShoppingAskTarget {
  /** The proposal's or the decision's id (`mergeIdOf(keys)`). */
  id: string;
  keys: string[];
  /** A stored merged decision (a merged row), or an open proposal. */
  merged: boolean;
  /** The rows asked about, numbered for the model in this order. */
  rows: ShoppingProposalRow[];
  /** The list's line for them now: "3 cups all-purpose flour". */
  line: string;
}

/** A model-found proposal (find), and what its Merge sends. */
export interface ShoppingModelProposal {
  proposal: ShoppingProposal;
  /** Merge's input: the keys and the model's name (when it is not the list's). */
  decision: ShoppingAskDecision;
}

/** Who answered, and what it cost: as an `edit` job says it. */
export interface ShoppingAskNumbers {
  /** The job that ran it: `recipes jobs show <job>` has its steps. */
  job?: string;
  /** Who answered, or who would have ("local model qwen3:8b"). */
  model?: string;
  backend?: "local" | "claude";
  promptTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  costEstimateUsd?: number;
  /** The Claude API is here to try instead. */
  claudeAvailable?: boolean;
}

export type ShoppingAskResult = ShoppingAskNumbers &
  (
    | ({ task: "revise"; target: ShoppingAskTarget; note: string } & (
        | {
            /** A revised proposal: merge these (some or all), so. */
            status: "merge";
            proposal: ShoppingProposal;
            /** The model's amount, not the list's sum. */
            amountFromModel: boolean;
            decision: ShoppingAskDecision;
          }
        | {
            /** Keep these apart, and why. */
            status: "apart";
            reason: string;
            decision: ShoppingAskDecision;
          }
        | { status: "refused" | "failed"; problem: string }
      ))
    | ({ task: "find" } & (
        | {
            status: "found";
            proposals: ShoppingModelProposal[];
            /** Groups the check left out, and why ("item 9 is not on the list"). */
            dropped: string[];
            /** How many names were sent. */
            names: number;
          }
        | { status: "refused" | "failed"; problem: string }
      ))
  );

/** Whether `value` is a `shopping-merge` job's result. */
export function isShoppingAskResult(
  value: unknown,
): value is ShoppingAskResult {
  if (!value || typeof value !== "object") return false;
  const { task, status } = value as { task?: unknown; status?: unknown };
  return (
    (task === "revise" || task === "find") &&
    typeof status === "string" &&
    status.length > 0
  );
}

/**
 * A model-found proposal still worth showing (Db2): none of its names is in
 * a merged decision now, no apart decision covers them all, and the table
 * does not propose the same names — the list may have changed since the
 * model read it.
 */
export function stillOpen(
  found: ShoppingModelProposal,
  merges: readonly ShoppingMerge[],
  tableProposals: readonly ShoppingProposal[],
): boolean {
  const keys = found.decision.keys;
  if (tableProposals.some((proposal) => proposal.id === found.proposal.id)) {
    return false;
  }
  return !merges.some((merge) =>
    merge.status === "merged"
      ? merge.keys.some((key) => keys.includes(key))
      : keys.every((key) => merge.keys.includes(key)),
  );
}
