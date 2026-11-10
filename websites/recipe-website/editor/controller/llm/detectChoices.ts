/**
 * The model looks for alternatives in a recipe's steps (46f): the edit
 * page's "Look for alternatives with the model", for an old recipe whose
 * groups `suggestChoices`' rules do not read as a choice. Roger on
 * 45-De2-1: "at least let this be an option to try out, maybe even in the
 * edit page to update an old recipe".
 *
 * One small `chatJson` call with its own schema, in a `choices` job (the
 * machine's `gpu` line for a local model, as every call): the user message
 * is the steps' outline (`choiceOutline` — each entry's group name and
 * first line), the answer `{sets: [{label, groups}]}`, zod-checked and then
 * grounded (`groundChoiceSets`): numbers that name no open group are
 * dropped, and a set left with fewer than two adjacent groups or a label
 * over 40 characters is dropped whole. A bad answer, or nothing that
 * survives, is "nothing found" — never an error the form must handle.
 *
 * **Never applied by itself** (G5): the sets go back to the form as marked
 * suggestions ("suggested by the model") the person accepts or puts away,
 * and only Save stores them. `suggestChoices` stays the import's default.
 */
import { z } from "zod";
import {
  groundChoiceSets,
  outlineText,
  type OutlineEntry,
} from "recipe-website-common/util/choiceOutline";
import type { SuggestedChoice } from "recipe-website-common/util/suggestChoices";
import { jobContext, type JobRun } from "../jobs/context";
import {
  chatJson,
  contextStep,
  estimateTokens,
  llmConfig,
  type LlmConfig,
} from "./client";
import { readerLabel } from "./readerLabel";

export const CHOICES_SCHEMA_NAME = "choices";

/** The answer is small: a few sets of a few numbers. */
const CHOICES_ANSWER_TOKENS = 384;

/** One call, bounded: a person is waiting on the edit page. */
export const CHOICES_TIMEOUT_MS = 120_000;

/** The answer's JSON Schema; zod holds the bounds (`claudeSchema`). */
export const CHOICES_JSON_SCHEMA = {
  type: "object",
  properties: {
    sets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          groups: { type: "array", items: { type: "number" } },
        },
        required: ["label", "groups"],
      },
    },
  },
  required: ["sets"],
} as const;

export const CHOICES_SYSTEM_PROMPT = `You find alternatives among a recipe's step groups: two or more groups next to each other that are different ways to make or finish one part, where a cook follows one of them and not the others. Return JSON.

- Examples of alternatives: "Bagels", "Pretzels", "Pizza" after a shared dough; "Stovetop" and "Slow cooker"; "Vanilla frosting" and "Chocolate frosting".
- Not alternatives: groups a cook does one after another — a dough, then shaping, then baking; a first rise and a second rise; a cake and then its frosting; a sauce and the pasta it goes on.
- "sets": a list of {"label", "groups"}. "groups" are the entry numbers of the groups, as listed, next to each other, each a group (not a step) and not already in a choice. "label" is what the cook is choosing, at most 4 words ("Then make", "Method", "Frosting").
- When nothing is a choice, answer {"sets": []}. Never invent groups or numbers.`;

const AnswerSchema = z.object({
  sets: z.array(
    z.object({
      label: z.string(),
      groups: z.array(z.number()),
    }),
  ),
});

/** The user message: the recipe's name and its steps' outline. */
export function choicesUserPrompt(
  name: string | undefined,
  outline: readonly OutlineEntry[],
): string {
  return [
    `Recipe: ${name?.replace(/\s+/g, " ").trim() || "(no name)"}`,
    "",
    "Entries, in order:",
    outlineText(outline),
  ].join("\n");
}

/** What a look answers: the grounded sets, and who looked. */
export interface DetectChoicesResult {
  /** 0-based entry indexes, as the form's suggestions are. */
  sets: SuggestedChoice[];
  /** Who answered ("local model qwen3:8b"), when a model did. */
  model?: string;
  /** Why nothing came back, or what was dropped. */
  warnings: string[];
}

export interface DetectChoicesOptions {
  /** Defaults to `llmConfig()`; none → nothing asked, a warning. */
  config?: LlmConfig;
  job?: JobRun;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Check an answer: the schema, then the grounding. A bad answer is no sets
 * and a warning; dropped numbers or sets are said in a warning too.
 */
export function checkChoicesAnswer(
  data: unknown,
  outline: readonly OutlineEntry[],
): { sets: SuggestedChoice[]; warnings: string[] } {
  const parsed = AnswerSchema.safeParse(data);
  if (!parsed.success) {
    return {
      sets: [],
      warnings: ["The model's answer was not a list of choices."],
    };
  }
  const grounded = groundChoiceSets(parsed.data.sets, outline);
  const warnings: string[] = [];
  const dropped = grounded.droppedSets + grounded.droppedNumbers;
  if (dropped > 0) {
    warnings.push(
      `Dropped from the model's answer: ${[
        grounded.droppedSets
          ? `${grounded.droppedSets} set${grounded.droppedSets === 1 ? "" : "s"}`
          : "",
        grounded.droppedNumbers
          ? `${grounded.droppedNumbers} group number${grounded.droppedNumbers === 1 ? "" : "s"}`
          : "",
      ]
        .filter(Boolean)
        .join(" and ")} that did not fit the recipe.`,
    );
  }
  return { sets: grounded.sets, warnings };
}

/**
 * Ask the model once. No model configured, a failed call or a bad answer
 * answer no sets with a warning; a cancel (the job's signal) is rethrown.
 */
export async function detectChoices(
  name: string | undefined,
  outline: readonly OutlineEntry[],
  {
    config = llmConfig(),
    job: run,
    signal: ownSignal,
    timeoutMs = CHOICES_TIMEOUT_MS,
  }: DetectChoicesOptions = {},
): Promise<DetectChoicesResult> {
  const job = jobContext(run);
  const { log } = job;
  const signal = ownSignal ?? job.signal;
  if (!config) {
    log.info("llm.choices", "no model configured — not asked");
    return {
      sets: [],
      warnings: ["No model is configured in this editor, so none was asked."],
    };
  }
  const system = CHOICES_SYSTEM_PROMPT;
  const user = choicesUserPrompt(name, outline);
  const numCtx = contextStep(
    estimateTokens(system) + estimateTokens(user) + CHOICES_ANSWER_TOKENS,
  );
  const who = readerLabel(config);
  try {
    return await log.step(
      "llm.choices",
      { entries: outline.length },
      async (step) => {
        const result = await chatJson({
          step,
          system,
          user,
          schema: CHOICES_JSON_SCHEMA,
          schemaName: CHOICES_SCHEMA_NAME,
          config,
          numCtx,
          timeoutMs,
          signal,
          job,
        });
        const checked = checkChoicesAnswer(result.data, outline);
        step.set({ sets: checked.sets.length });
        return {
          ...checked,
          model: readerLabel({
            model: result.model,
            api: result.api ?? config.api,
          }),
        };
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    const why = error instanceof Error ? error.message : String(error);
    return {
      sets: [],
      model: who,
      warnings: [`The model's call failed: ${who} (${why}).`],
    };
  }
}
