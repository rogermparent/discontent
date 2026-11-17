/**
 * `POST /api/recipe/<slug>/edit` — "Edit with AI" over the stored recipe
 * (47i), written nowhere: `recipes revise --remote`. The body is
 * `{request, claude?}` (`claude: true` asks the Claude API rather than the
 * local model); the answer is the `edit` job's `EditResult` — its `status`
 * (`changed`, `no-change`, `refused`, `failed`), the changed `fields`, their
 * new values, the model's `note`, and on a change the `patch` `PUT
 * /api/recipe/<slug>` takes.
 *
 * Authenticated although it writes nothing, as `/fill` is: it runs a model.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { runSpec } from "recipe-editor/controller/jobs/kinds";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { storedEditSpec } from "recipe-editor/controller/llm/askEdit";
import { EDIT_REQUEST_MAX } from "recipe-website-common/util/editRequest";
import { z } from "zod";

const EditBodySchema = z.strictObject({
  request: z.string().min(1).max(EDIT_REQUEST_MAX),
  claude: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { slug } = await params;
    const body = parseInput(EditBodySchema, await readJsonBody(request));
    const spec = await storedEditSpec(ctx, slug, {
      request: body.request,
      claude: body.claude === true,
    });
    /* A job (epic 37): the answer carries its `job` id. */
    return Response.json(await runSpec(spec, { ctx }));
  } catch (error) {
    return errorResponse(error);
  }
}
