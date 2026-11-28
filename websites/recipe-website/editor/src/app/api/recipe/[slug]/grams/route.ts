/**
 * `POST /api/recipe/<slug>/grams` — the recipe's lines given grams (51f):
 * `recipes grams --remote`. The body is `{paste?, model?, dryRun?}` — a
 * pasted metric list, whether the model is asked for what the paste and the
 * gram bank leave, and whether to write — and the answer is
 * `GramsRecipeResult` (each line's from → to, where its grams came from,
 * what was left). A write is one commit; a dry run is read-scoped.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gramsForRecipe } from "recipe-editor/controller/curation/gramsRecipe";
import { ForbiddenError } from "recipe-editor/controller/curation/errors";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const GramsBodySchema = z.strictObject({
  paste: z.string().max(20_000).optional(),
  model: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const body = parseInput(
      GramsBodySchema,
      (await readJsonBody(request, { optional: true })) ?? {},
    );
    if (!body.dryRun && ctx.scope !== "write") {
      throw new ForbiddenError(
        "This API token is read-only, and this request writes. Pass dryRun, or use a write token.",
      );
    }
    const { slug } = await params;
    return Response.json(await gramsForRecipe(ctx, slug, body));
  } catch (error) {
    return errorResponse(error);
  }
}
