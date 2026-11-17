/**
 * `POST /api/recipe/<slug>/fill` — the recipe's gaps filled from its source,
 * written nowhere (45b): `recipes fill --remote`. The body is `{estimate?,
 * uses?, usesAll?}` (`estimate: false`: no estimate; `uses`: whether the
 * model is asked what each step uses — unset, the Claude API is and a local
 * model is not; `usesAll: true`: steps that store a `uses` are read too,
 * 47g); the answer is `FillResult` — what
 * the source fills, what the model estimates, and the patch `PUT
 * /api/recipe/<slug>` takes.
 *
 * Authenticated although it writes nothing, as `/api/inspect` is: it makes
 * this server fetch the recipe's source (and run yt-dlp, and a model).
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { corpusOf, runSpec } from "recipe-editor/controller/jobs/kinds";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const FillBodySchema = z.strictObject({
  estimate: z.boolean().optional(),
  uses: z.boolean().optional(),
  usesAll: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { slug } = await params;
    const { estimate, uses, usesAll } = parseInput(
      FillBodySchema,
      (await readJsonBody(request, { optional: true })) ?? {},
    );
    /* A job (epic 37): the answer carries its `job` id. */
    return Response.json(
      await runSpec(
        {
          kind: "fill",
          ...corpusOf(ctx),
          slug,
          ...(estimate === false ? { estimate: false } : {}),
          ...(typeof uses === "boolean" ? { uses } : {}),
          ...(usesAll === true ? { usesAll: true } : {}),
        },
        { ctx },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
