"use server";

/**
 * The several-recipes picker's server action (36e): "Import selected".
 *
 * The recipes were already read — the import that found them answered with
 * every reading — so this writes, and reads nothing again: one commit per
 * recipe through the seat's `importBatchPicks`, the same function behind
 * `recipes import --all / --pick`, so a link from one recipe to another of
 * the batch, the shared picture (downloaded once) and the "(local model,
 * 2 of 4 from …)" commit note are the same whichever way they arrive.
 *
 * Signed in, or nothing (`authenticateUser`); the input is parsed strictly,
 * and each recipe then goes through `RecipeInputSchema` like any create —
 * the readings come back from the browser, where a signed-in person could
 * have typed any recipe into the form anyway. A partial reading is created
 * when ticked (`allowPartial`): the picker leaves those unticked and says
 * why. Answers are plain objects, an error as `{error}`, never a throw.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { z } from "zod";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import {
  UnauthenticatedError,
  toErrorObject,
  type ErrorObject,
} from "recipe-editor/controller/curation/errors";
import {
  shortSource,
  type BatchPick,
  type ImportBatchItem,
} from "recipe-editor/controller/curation/importRecipe";
import { corpusOf, runSpec } from "recipe-editor/controller/jobs/kinds";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { authenticateUser } from "recipe-editor/controller/actions/shared";

/** More than a video or a paste holds: a bad request, not a batch. */
const BATCH_MAX = 30;

const RecipeBatchInputSchema = z.strictObject({
  /** The video, or a pasted text's source. */
  url: z.string().trim().min(1).optional(),
  pastedText: z.boolean().optional(),
  /** A page's own Recipe nodes (38c): no model read them. */
  fromPage: z.boolean().optional(),
  /** How many recipes were found: "2 of 4" in each commit. */
  total: z.number().int().min(2).max(BATCH_MAX),
  /** Every recipe found, by name: a link may point at one imported earlier. */
  siblings: z
    .array(
      z.strictObject({
        n: z.number().int().min(1).max(BATCH_MAX),
        name: z.string().optional(),
      }),
    )
    .max(BATCH_MAX)
    .optional(),
  picks: z
    .array(
      z.strictObject({
        n: z.number().int().min(1).max(BATCH_MAX),
        recipe: z.record(z.string(), z.unknown()),
        components: z
          .array(
            z.strictObject({
              line: z.number().int().min(0),
              target: z.number().int().min(1).max(BATCH_MAX),
            }),
          )
          .optional(),
        chapter: z
          .strictObject({ title: z.string(), start: z.number().min(0) })
          .optional(),
        /* Another slug, after a conflict (36e review). */
        slug: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .min(1)
    .max(BATCH_MAX),
});

export type RecipeBatchInput = z.input<typeof RecipeBatchInputSchema>;

/** Create the picked recipes, one commit each. */
export async function importRecipeBatchAction(
  raw: RecipeBatchInput,
): Promise<
  { recipes: ImportBatchItem[]; job?: string } | { error: ErrorObject["error"] }
> {
  try {
    const email = await authenticateUser();
    if (!email) throw new UnauthenticatedError();
    const ctx = curationContextFor(email, getContentDirectory());
    const input = parseInput(RecipeBatchInputSchema, raw);
    const from = input.url ? ` from ${shortSource(input.url)}` : "";
    const commitNote = input.pastedText
      ? "local model, pasted text, {n} of {total}"
      : input.fromPage
        ? `{n} of {total}${from}`
        : `local model, {n} of {total}${from}`;
    /* A job since 37c (`form-batch`): a step log, `/jobs`, Cancel, Retry. */
    const { recipes, job } = await runSpec(
      {
        kind: "form-batch",
        ...corpusOf(ctx),
        ...(input.url ? { url: input.url } : {}),
        picks: input.picks as BatchPick[],
        total: input.total,
        ...(input.siblings ? { siblings: input.siblings } : {}),
        commitNote,
      },
      { ctx },
    );
    return { recipes, job };
  } catch (error) {
    return { error: toErrorObject(error).error };
  }
}
