/**
 * `/api/agent/<id>/review` — a curator run's held writes (48b, Db1–Db3).
 *
 * - `GET` — `{calls, pending, live}`: each held call of the conversation
 *   the run holds, in the order the model made them — its phrase, input,
 *   what its dry run said, how it stands (`pending`, `applied`,
 *   `discarded`, `failed`), and for a `term_assign` each recipe it adds as
 *   the content stands now (and the tagging post-check, 48a). Read scope.
 * - `POST` `{decisions: [{call, apply, add?}]}` — Save: apply the ticked
 *   (`apply: true`) in the model's order, each as its own commit, and skip
 *   the rest; `add` narrows a `term_assign` to the recipes left ticked
 *   (never wider than the model asked). Answers the review as it now
 *   stands. A call already decided, or not this conversation's, is 400
 *   `validation`; a run still working is 409 `job_live`. Write scope: a
 *   signed-in session or a write token.
 *
 * `<id>` as `GET /api/agent/<id>` takes it. Not an agent run is 404.
 */
import { z } from "zod";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { parseInput } from "recipe-editor/controller/curation/schema";
import {
  applyReview,
  curatorReview,
} from "recipe-editor/controller/agent/review";

const ReviewRequestSchema = z.strictObject({
  decisions: z
    .array(
      z.strictObject({
        call: z.string().min(1).max(200),
        apply: z.boolean(),
        add: z.array(z.string().min(1).max(200)).max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { id } = await params;
    return Response.json(
      await curatorReview(id, { contentDirectory: ctx.contentDirectory }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request);
    const { id } = await params;
    const body = parseInput(ReviewRequestSchema, await readJsonBody(request));
    return Response.json(await applyReview(id, body.decisions, { ctx }), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
