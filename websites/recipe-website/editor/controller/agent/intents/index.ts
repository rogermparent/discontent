/**
 * An intent's plan, run (51b): `online`, `mine` or `plan` (`PLANNED_INTENTS`)
 * in code, through `IntentRun` — the prompt, each step's tool call and
 * result, each model call's numbers, the answer — and how it ended, in the
 * loop's own terms (`AgentStopReason`), so `runAgentJob` records it exactly
 * as it records a loop run. `organize` and `any` are the loop's.
 */
import { recipeIndexExists } from "../../curation/importList";
import { LlmError } from "../../llm/client";
import type { AgentStopReason, AgentUsage } from "../types";
import type { AgentIntent } from "./guess";
import { runMine, type MineOutcome } from "./mine";
import { runOnline, type OnlineOutcome } from "./online";
import { runPlan, type PlanOutcome } from "./plan";
import { IntentRun, IntentStop, type IntentRunOptions } from "./runner";

export type IntentOutcome = OnlineOutcome | MineOutcome | PlanOutcome;

export type PlannedIntent = Extract<AgentIntent, "online" | "mine" | "plan">;

export interface IntentPlanResult {
  text: string;
  stopReason: AgentStopReason;
  error?: string;
  usage: AgentUsage;
  turns: number;
  toolCalls: number;
  durationMs: number;
  outcome?: IntentOutcome;
  /** Model calls that failed and that the plan went on without. */
  problems: { task: string; problem: string }[];
}

const PLANS: Record<
  PlannedIntent,
  (run: IntentRun) => Promise<{ text: string; outcome: IntentOutcome }>
> = {
  online: runOnline,
  mine: runMine,
  plan: runPlan,
};

/**
 * The answer when the recipe index is not built (51b review 3): every plan
 * reads it to know what you have, and an unbuilt one reads as empty — so
 * online would propose what you already have, mine find nothing and plan
 * resolve nothing. Stop and say so instead.
 */
export const NO_INDEX_ANSWER =
  "I can't tell what you already have: the recipe index isn't built here, so I stopped before searching. Reindex (`recipes reindex`, or restart the editor) and ask again.";

/** Run `intent`'s plan. Never throws: the result says how it ended. */
export async function runIntentPlan(
  intent: PlannedIntent,
  options: IntentRunOptions,
): Promise<IntentPlanResult> {
  const run = new IntentRun(options);
  options.onMessage({ role: "user", text: options.prompt });
  const ended = (
    stopReason: AgentStopReason,
    extra: { text?: string; error?: string; outcome?: IntentOutcome } = {},
  ): IntentPlanResult => ({
    text: extra.text ?? "",
    stopReason,
    ...(extra.error ? { error: extra.error } : {}),
    usage: run.usage,
    turns: run.turns,
    toolCalls: run.toolCalls,
    durationMs: run.durationMs,
    ...(extra.outcome ? { outcome: extra.outcome } : {}),
    problems: run.problems,
  });
  try {
    if (!recipeIndexExists(options.ctx)) {
      options.job.log.warn("intent", "the recipe index is not built");
      run.answer(NO_INDEX_ANSWER);
      return ended("done", { text: NO_INDEX_ANSWER });
    }
    const { text, outcome } = await PLANS[intent](run);
    run.answer(text);
    return ended("done", { text, outcome });
  } catch (error) {
    if (error instanceof IntentStop) {
      return ended(
        error.stopReason,
        error.stopReason === "cancelled" ? {} : { error: error.message },
      );
    }
    if (run.signal.aborted && options.job.signal?.aborted) {
      return ended("cancelled");
    }
    const message =
      error instanceof LlmError
        ? error.message
        : `the ${intent} plan failed: ${(error as Error)?.message ?? String(error)}`;
    return ended("error", { error: message });
  } finally {
    run.close();
  }
}

export { IntentRun, IntentStop } from "./runner";
export type { IntentChat, IntentRunOptions } from "./runner";
