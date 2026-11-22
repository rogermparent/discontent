/**
 * `POST /api/shopping/tidy/suggestions/<id>/<accept|skip|ask>` (epic 50,
 * 50b): what a person does with one suggestion.
 *
 * - `accept` writes it as one change of this list (a layer `from` the
 *   suggestion, `by` the run's model) and marks it accepted — one commit.
 * - `skip` marks it skipped (a later run is told not to repeat it).
 * - `ask {note, model?, wait?}` asks the model about this one card again
 *   (Db6): a `shopping-tidy` job whose answer takes the card's place.
 */
import { z } from "zod";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { NotFoundError } from "recipe-editor/controller/curation/errors";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { decideTidySuggestion } from "recipe-editor/controller/curation/shopping";
import { runSpec, startSpec } from "recipe-editor/controller/jobs/kinds";
import { keepUnstored } from "recipe-editor/controller/jobs/unstored";
import { storedTidyAskSpec } from "recipe-editor/controller/llm/shoppingTidy";
import { TIDY_NOTE_MAX } from "recipe-website-common/util/shoppingTidy";

const AskSchema = z.strictObject({
  note: z.string().trim().min(1).max(TIDY_NOTE_MAX),
  model: z.string().trim().min(1).max(80).optional(),
  wait: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const ctx = await requireCurationContext(request);
    const { id, action } = await params;
    if (action === "accept" || action === "skip") {
      return Response.json(await decideTidySuggestion(ctx, id, action));
    }
    if (action !== "ask") {
      throw new NotFoundError(
        `No action "${action}" on a suggestion: accept, skip or ask.`,
      );
    }
    const { wait, ...input } = parseInput(
      AskSchema,
      await readJsonBody(request),
    );
    const spec = await storedTidyAskSpec(ctx, { suggestion: id, ...input });
    if (wait) return Response.json(await runSpec(spec, { ctx }));
    const { job, stored, done } = await startSpec(spec, { ctx });
    keepUnstored(job, done);
    return Response.json({ job, stored }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
