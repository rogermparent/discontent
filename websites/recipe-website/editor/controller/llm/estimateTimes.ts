/**
 * The model estimates a recipe's times and yield (epic 45, F4/F5): what the
 * fill asks for when the source does not state them — 1-hour bagels from a
 * video whose steps say "25 min", "15–20 min", "30 s each side", "15–17
 * min" and never a prep, cook or total time.
 *
 * Separate from extraction on purpose: 36's extractor keeps its "never
 * estimate or add up a time" rule (`extractRecipe.ts`), and this is its own
 * small `chatJson` call with its own schema, run only for the fields still
 * empty after the source fill. The user message carries the recipe — name,
 * yield text, ingredients, steps — and the times its steps plainly state
 * (`findStepTimes`, `stepWaits`, `readPlanTimes`) as hints. The answer is
 * checked here (`EstimateAnswerSchema`): whole minutes from 1 to 10,080 (a
 * week), a total no shorter than the prep or the cook time, a yield of at
 * most 60 characters, and a one-sentence `basis`. A bad or missing answer,
 * or a failed call, drops the estimate with a warning: nothing else fails.
 *
 * In a job it is an `llm.estimate` step with the model's token counts, so
 * the edit page's live panel shows it as it shows the extractor's reading.
 */
import { z } from "zod";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import type { Recipe } from "recipe-website-common/controller/types";
import { stripMarkup } from "recipe-website-common/util/ingredientNames";
import {
  formatChill,
  formatSpan,
  readPlanTimes,
} from "recipe-website-common/util/planTimes";
import {
  flatSteps,
  stepWaits,
} from "recipe-website-common/components/Form/Instructions/stepChecks";
import { stepPlainText } from "recipe-website-common/util/stepPlainText";
import { findStepTimes } from "recipe-website-common/util/timeText";
import { jobContext, type JobRun } from "../jobs/context";
import {
  chatJson,
  contextStep,
  estimateTokens,
  llmConfig,
  type LlmConfig,
} from "./client";
import { readerLabel } from "./readerLabel";
import {
  ESTIMATE_FIELDS,
  type EstimateField,
  type EstimateValues,
} from "../curation/fillGaps";

/** A week, in minutes: no recipe step takes longer, a cure aside. */
export const ESTIMATE_MAX_MINUTES = 10_080;

/** The longest yield an estimate may give ("about 24 cookies"). */
export const ESTIMATE_YIELD_MAX = 60;

/** The basis is one sentence: cut to this many characters. */
export const ESTIMATE_BASIS_MAX = 200;

/** The answer is small: room for four fields and one sentence. */
const ESTIMATE_ANSWER_TOKENS = 256;

/** How much of the recipe the prompt carries, at most (a long one is cut). */
const ESTIMATE_TEXT_MAX_CHARS = 12_000;

/** One call, bounded: a fill waits on it. */
export const ESTIMATE_TIMEOUT_MS = 120_000;

export const ESTIMATE_SCHEMA_NAME = "estimate";

/**
 * The answer's JSON Schema (Ollama `format`, OpenAI `response_format`,
 * Claude `output_config.format`). No bounds here — the Claude API refuses
 * them (`claudeSchema`); zod holds them.
 */
export const ESTIMATE_JSON_SCHEMA = {
  type: "object",
  properties: {
    prepTime: { type: "number" },
    cookTime: { type: "number" },
    totalTime: { type: "number" },
    recipeYield: { type: "string" },
    basis: { type: "string" },
  },
  required: ["basis"],
} as const;

const FIELD_WORDS: Record<EstimateField, string> = {
  prepTime:
    '"prepTime": the hands-on minutes before cooking — measuring, mixing, kneading, shaping, chopping',
  cookTime:
    '"cookTime": the minutes on the heat — in the oven, on the stove, on the grill, in the fryer',
  totalTime:
    '"totalTime": every minute from start to finish, the waits included — rising, proofing, chilling, marinating, resting',
  recipeYield:
    '"recipeYield": what the recipe makes, as a cook would say it ("8 bagels", "Serves 4", "about 24 cookies")',
};

export const ESTIMATE_SYSTEM_PROMPT = `You estimate a recipe's times and yield from its ingredients and steps, for a recipe whose source does not state them. Return JSON.

- Give each field you are asked for that you can estimate; leave a field out when the recipe gives you nothing to go on.
- Times are whole minutes (a number, e.g. 45). The total time includes every wait — rising, proofing, chilling, marinating, resting — so it is never shorter than the prep time or the cook time.
- Start from the times the steps state (listed for you); estimate only what they leave out (shaping, chopping, preheating, cleanup between batches).
- "basis": one short sentence saying how you got there, e.g. "25 min rise + 20 min proof + 17 min bake + ~10 min shaping".
- Never invent ingredients or steps, and never change the recipe.`;

/** The answer as checked (F4): a model's 0 or `null` reads as "left out". */
const minutes = z.preprocess(
  (value) => (value === 0 || value === null ? undefined : value),
  z.number().int().min(1).max(ESTIMATE_MAX_MINUTES).optional(),
);

export const EstimateAnswerSchema = z.object({
  prepTime: minutes,
  cookTime: minutes,
  totalTime: minutes,
  recipeYield: z.preprocess(
    (value) =>
      value === null || (typeof value === "string" && !value.trim())
        ? undefined
        : typeof value === "string"
          ? value.replace(/\s+/g, " ").trim()
          : value,
    z.string().max(ESTIMATE_YIELD_MAX).optional(),
  ),
  basis: z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value,
    z.string().min(1),
  ),
});

export type EstimateAnswer = z.infer<typeof EstimateAnswerSchema>;

/** One estimate that passed: the values for the fields asked for, and why. */
export interface TimeEstimate {
  values: EstimateValues;
  fields: EstimateField[];
  basis: string;
  /** Who estimated, for the form's text ("local model qwen3:8b"). */
  model: string;
}

export interface EstimateTimesResult {
  estimate?: TimeEstimate;
  /** Why there is none, or what was dropped. */
  warnings: string[];
  /** The call's numbers, when one was made. */
  durationMs?: number;
}

export interface EstimateTimesOptions {
  /** The fields to estimate (default: all four). */
  want?: readonly EstimateField[];
  /** Defaults to `llmConfig()`; none → nothing asked, a warning. */
  config?: LlmConfig;
  /** The job: the call is its `llm.estimate` step. */
  job?: JobRun;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function stripped(text: string | undefined): string {
  return stripMarkup(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The times the steps plainly state, one line each — every duration
 * `findStepTimes` reads in a step, named by the wait it is when `stepWaits`
 * sees one ("step 2: rise 25 minutes") — then the oven, bake and chill facts
 * `readPlanTimes` reads. The model starts from these (F4: "the facts as
 * hints").
 */
export function estimateHints(
  recipe: Pick<Recipe, "instructions" | "recipeYield">,
): string[] {
  const hints: string[] = [];
  flatSteps(recipe.instructions ?? []).forEach((step, index) => {
    const plain = stepPlainText(step.text);
    const waits = stepWaits(step.text);
    for (const time of findStepTimes(plain)) {
      const wait = waits.find(
        (entry) => entry.seconds === time.seconds && entry.verb,
      );
      hints.push(
        `step ${index + 1}: ${wait?.verb ? `${wait.verb} ` : ""}${time.text}`,
      );
    }
  });
  const facts = readPlanTimes(recipe);
  if (facts.oven) {
    hints.push(`oven: ${facts.oven.value.degrees}°${facts.oven.value.unit}`);
  }
  if (facts.bake) {
    hints.push(
      `bake: ${formatSpan(facts.bake.value)}${facts.bake.value.perBatch ? " a batch" : ""} (step ${facts.bake.step + 1})`,
    );
  }
  if (facts.chill) {
    hints.push(
      `chill: ${formatChill(facts.chill.value)} (step ${facts.chill.step + 1})`,
    );
  }
  return [...new Set(hints)];
}

/** The user message: the recipe, what is known, the hints, what to give. */
export function estimateUserPrompt(
  recipe: Partial<ImportedRecipe>,
  want: readonly EstimateField[],
): string {
  const ingredients = (recipe.ingredients ?? [])
    .map((line) =>
      line.type === "heading"
        ? `${stripped(line.ingredient)}:`
        : `- ${stripped(line.ingredient)}`,
    )
    .filter((line) => line.replace(/^- /, "").trim());
  const steps = flatSteps(recipe.instructions ?? []).map(
    (step, index) => `${index + 1}. ${stripped(step.text)}`,
  );
  const known = [
    recipe.prepTime ? `Prep time: ${recipe.prepTime} min` : undefined,
    recipe.cookTime ? `Cook time: ${recipe.cookTime} min` : undefined,
    recipe.totalTime ? `Total time: ${recipe.totalTime} min` : undefined,
    stripped(recipe.recipeYield)
      ? `Yield: ${stripped(recipe.recipeYield)}`
      : undefined,
  ].filter(Boolean);
  const hints = estimateHints({
    instructions: recipe.instructions ?? [],
    recipeYield: recipe.recipeYield,
  });
  let body = [
    `Recipe: ${stripped(recipe.name) || "(no name)"}`,
    "",
    "Ingredients:",
    ...(ingredients.length ? ingredients : ["(none listed)"]),
    "",
    "Steps:",
    ...(steps.length ? steps : ["(none listed)"]),
  ].join("\n");
  if (body.length > ESTIMATE_TEXT_MAX_CHARS) {
    body = `${body.slice(0, ESTIMATE_TEXT_MAX_CHARS)}\n…`;
  }
  return [
    body,
    "",
    "Already known (keep these as they are):",
    ...(known.length ? known : ["(nothing)"]),
    "",
    "Times the steps state:",
    ...(hints.length ? hints.map((hint) => `- ${hint}`) : ["(none)"]),
    "",
    "Estimate these fields:",
    ...want.map((field) => `- ${FIELD_WORDS[field]}`),
    '- "basis": one short sentence',
  ].join("\n");
}

/**
 * Check an answer (F4): the schema, then the totals — against the values the
 * recipe already has as well as the estimated ones. Throws the reason.
 */
export function checkEstimate(
  data: unknown,
  recipe: Partial<ImportedRecipe>,
  want: readonly EstimateField[],
): { values: EstimateValues; fields: EstimateField[]; basis: string } {
  const parsed = EstimateAnswerSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `the answer is not an estimate (${issue?.path.join(".") || "answer"}: ${issue?.message ?? "invalid"})`,
    );
  }
  const answer = parsed.data;
  const values: EstimateValues = {};
  const fields: EstimateField[] = [];
  for (const field of want) {
    const value = answer[field];
    if (value === undefined) continue;
    (values as Record<string, unknown>)[field] = value;
    fields.push(field);
  }
  if (fields.length === 0) throw new Error("the answer estimated nothing");
  const at = (field: "prepTime" | "cookTime" | "totalTime") =>
    values[field] ?? (recipe[field] && recipe[field] > 0 ? recipe[field] : 0);
  const total = at("totalTime");
  if (total) {
    if (total < at("cookTime")) {
      throw new Error(
        `the total (${total} min) is shorter than the cook time (${at("cookTime")} min)`,
      );
    }
    if (total < at("prepTime")) {
      throw new Error(
        `the total (${total} min) is shorter than the prep time (${at("prepTime")} min)`,
      );
    }
  }
  const basis =
    answer.basis.length > ESTIMATE_BASIS_MAX
      ? `${answer.basis.slice(0, ESTIMATE_BASIS_MAX - 1).trimEnd()}…`
      : answer.basis;
  return { values, fields, basis };
}

/**
 * One estimate for `want` (default: all four fields) — or none, with a
 * warning: no model configured, a failed call, an answer that does not pass
 * `checkEstimate`. A cancel (the job's signal) is rethrown.
 */
export async function estimateTimes(
  recipe: Partial<ImportedRecipe>,
  {
    want = ESTIMATE_FIELDS,
    config = llmConfig(),
    job: run,
    signal: ownSignal,
    timeoutMs = ESTIMATE_TIMEOUT_MS,
  }: EstimateTimesOptions = {},
): Promise<EstimateTimesResult> {
  const job = jobContext(run);
  const { log } = job;
  const signal = ownSignal ?? job.signal;
  if (want.length === 0) return { warnings: [] };
  if (!config) {
    log.info("llm.estimate", "no model configured — not estimated");
    return {
      warnings: [
        "No model is configured, so the times and yield the source doesn't state were not estimated.",
      ],
    };
  }
  const system = ESTIMATE_SYSTEM_PROMPT;
  const user = estimateUserPrompt(recipe, want);
  const numCtx = contextStep(
    estimateTokens(system) + estimateTokens(user) + ESTIMATE_ANSWER_TOKENS,
  );
  const who = readerLabel(config);
  try {
    return await log.step(
      "llm.estimate",
      { fields: [...want] },
      async (step) => {
        const result = await chatJson({
          step,
          system,
          user,
          schema: ESTIMATE_JSON_SCHEMA,
          schemaName: ESTIMATE_SCHEMA_NAME,
          config,
          numCtx,
          timeoutMs,
          signal,
          job,
        });
        let checked;
        try {
          checked = checkEstimate(result.data, recipe, want);
        } catch (error) {
          const why = error instanceof Error ? error.message : String(error);
          step.fail(why);
          return {
            warnings: [`The estimate was dropped: ${why}.`],
            durationMs: result.durationMs,
          };
        }
        step.set({ estimated: checked.fields });
        return {
          estimate: {
            ...checked,
            model: readerLabel({
              model: result.model,
              api: result.api ?? config.api,
            }),
          },
          warnings: [],
          durationMs: result.durationMs,
        };
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    const why = error instanceof Error ? error.message : String(error);
    return { warnings: [`The estimate was dropped: ${who} failed (${why}).`] };
  }
}
