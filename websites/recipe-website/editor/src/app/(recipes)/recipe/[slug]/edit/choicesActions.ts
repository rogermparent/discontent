"use server";

/**
 * The edit page's "Look for alternatives with the model" (46f): start a
 * `choices` job over the steps as the form holds them, and hand its
 * outcome back through a bounded long-poll — the same `keepUnstored` /
 * `waitUnstored` pair the fill uses for a recordless job, here for every
 * one (a single small call: the button says "Asking…" and links the job,
 * rather than following its steps). Signed in, as every editor action;
 * nothing is written — the form offers what comes back as suggestions.
 */
import { z } from "zod";
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import type { DetectChoicesResult } from "recipe-editor/controller/llm/detectChoices";
import { startSpec } from "recipe-editor/controller/jobs/kinds";
import {
  keepUnstored,
  waitUnstored,
} from "recipe-editor/controller/jobs/unstored";
import {
  CHOICE_LABEL_MAX,
  OUTLINE_FIRST_MAX,
  OUTLINE_MAX_ENTRIES,
  outlineHasCandidates,
} from "recipe-website-common/util/choiceOutline";
import type { ModelChoicesOutcome } from "recipe-website-common/components/Form/Instructions/modelChoices";

/** The outline as posted: bounded, so a spec stays small. */
const OutlineSchema = z
  .array(
    z.strictObject({
      group: z.boolean(),
      name: z.string().max(OUTLINE_FIRST_MAX),
      first: z.string().max(OUTLINE_FIRST_MAX),
      inChoice: z.boolean(),
    }),
  )
  .max(OUTLINE_MAX_ENTRIES);

/** Start looking; answers the job's id, or why none started. */
export async function choicesStartAction(
  slug: string,
  name: string,
  outline: unknown,
): Promise<{ job?: string; message?: string }> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to ask the model." };
  if (typeof slug !== "string" || !slug) return { message: "No recipe." };
  const parsed = OutlineSchema.safeParse(outline);
  if (!parsed.success) return { message: "Those steps can't be read." };
  if (!outlineHasCandidates(parsed.data)) {
    return {
      message: "Two named groups next to each other, in no choice, are needed.",
    };
  }
  try {
    const { job, done } = await startSpec({
      kind: "choices",
      slug,
      ...(typeof name === "string" && name.trim()
        ? { name: name.trim().slice(0, 200) }
        : {}),
      outline: parsed.data,
    });
    keepUnstored(job, done);
    return { job };
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
}

/** One wait for a look's outcome (at most `UNSTORED_WAIT_MS`). */
export async function choicesResultAction(
  job: string,
): Promise<ModelChoicesOutcome> {
  if (!(await authenticateUser())) {
    return { message: "Sign in to ask the model." };
  }
  const answer =
    typeof job === "string"
      ? await waitUnstored<DetectChoicesResult & { job: string }>(job)
      : ({ status: "missing" } as const);
  switch (answer.status) {
    case "missing":
      return {
        message:
          "That look is not running in this editor any more — ask again.",
      };
    case "pending":
      return { pending: true };
    case "done": {
      const { sets, warnings, model } = answer.value;
      return {
        sets: sets.filter(
          (set) =>
            set.label.length <= CHOICE_LABEL_MAX && set.groups.length >= 2,
        ),
        warnings,
        ...(model ? { model } : {}),
      };
    }
    default: {
      const { error } = answer;
      return {
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
