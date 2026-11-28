"use server";

/**
 * The edit page's "Add grams" (51f): "Ask the model for the rest" starts a
 * `grams` job over the lines the paste and the bank left (as the form holds
 * them) and hands its answers back through `choicesActions`' bounded
 * long-poll; nothing is written — the form marks each answer "≈ Model"
 * until it is kept, and Save is the write. "Save to the bank" is the one
 * write here: a line's grams per cup into `conversions/grams.json`, one
 * commit, only when the person asks for it (Roger's answer 5).
 */
import { z } from "zod";
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import { corpusOf, startSpec } from "recipe-editor/controller/jobs/kinds";
import {
  keepUnstored,
  waitUnstored,
} from "recipe-editor/controller/jobs/unstored";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { setGrams } from "recipe-editor/controller/curation/conversions";
import { editModelFor } from "recipe-editor/controller/llm/askEdit";
import { readerLabel } from "recipe-editor/controller/llm/readerLabel";
import {
  GRAMS_LINE_MAX,
  GRAMS_MAX_LINES,
  type GramsModelResult,
} from "recipe-editor/controller/llm/gramsModel";
import { CurationError } from "recipe-editor/controller/curation/errors";
import type {
  GramsAskOutcome,
  GramsAskStart,
  GramsBankSaved,
} from "recipe-website-common/components/Form/Ingredients/gramsContext";

const LinesSchema = z
  .array(
    z.strictObject({
      line: z.number().int().min(0).max(500),
      text: z
        .string()
        .min(1)
        .max(GRAMS_LINE_MAX * 4),
    }),
  )
  .min(1)
  .max(GRAMS_MAX_LINES);

/** Start asking; answers the job's id and who is asked, or why none started. */
export async function gramsStartAction(
  slug: string,
  lines: unknown,
  claude?: boolean,
): Promise<GramsAskStart> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to ask the model." };
  if (typeof slug !== "string" || !slug) return { message: "No recipe." };
  const parsed = LinesSchema.safeParse(lines);
  if (!parsed.success) return { message: "Those lines can't be read." };
  const chosen = editModelFor(claude ? "claude" : undefined);
  if ("problem" in chosen) {
    return { message: `Nothing was asked: ${chosen.problem}.` };
  }
  try {
    const { job, done } = await startSpec({
      kind: "grams",
      ...corpusOf(curationContextFor(email)),
      slug,
      lines: parsed.data,
      backend: chosen.backend,
    });
    keepUnstored(job, done);
    return { job, model: readerLabel(chosen.config) };
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
}

/** One wait for the answers (at most `UNSTORED_WAIT_MS`). */
export async function gramsResultAction(job: string): Promise<GramsAskOutcome> {
  if (!(await authenticateUser())) {
    return { message: "Sign in to ask the model." };
  }
  const answer =
    typeof job === "string"
      ? await waitUnstored<GramsModelResult & { job: string }>(job)
      : ({ status: "missing" } as const);
  switch (answer.status) {
    case "missing":
      return {
        message: "That ask is not running in this editor any more — ask again.",
      };
    case "pending":
      return { pending: true };
    case "done": {
      const { answers, model, warnings } = answer.value;
      return { answers, warnings, ...(model ? { model } : {}) };
    }
    default: {
      const { error } = answer;
      return {
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

const SaveSchema = z.strictObject({
  name: z.string(),
  gramsPerCup: z.number(),
});

/** "Save to the bank": one line's grams per cup, one commit. */
export async function saveGramsToBankAction(
  input: unknown,
): Promise<GramsBankSaved> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to change the bank." };
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { message: "That entry can't be read." };
  try {
    const result = await setGrams(curationContextFor(email), parsed.data);
    const entry = result.entries.find((each) => each.key === result.key);
    return entry ? { entry } : { message: "Nothing was saved." };
  } catch (error) {
    return {
      message:
        error instanceof CurationError || error instanceof Error
          ? error.message
          : String(error),
    };
  }
}
