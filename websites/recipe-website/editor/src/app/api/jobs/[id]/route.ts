/**
 * `GET /api/jobs/<id>?from=<n>` — one job (epic 37, 37c, D7): its record
 * (the spec summarised), its step log from byte `n` on, `next` (the offset
 * to ask from next time) and `live`. The form's progress panel and the
 * `/jobs` pages poll it; `recipes jobs log --follow` too.
 *
 * `<id>` is the whole ULID, or the eight characters the step lines show.
 * `from` is a whole number ≥ 0 (absent is 0); anything else is 400.
 * Curation auth, read scope.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { getJobView, parseFrom } from "recipe-editor/controller/jobs/views";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurationContext(request, { need: "read" });
    const { id } = await params;
    const from = parseFrom(new URL(request.url).searchParams.get("from"));
    return Response.json(await getJobView(id, { from }), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
