/**
 * `POST /api/jobs/<id>/cancel` — stop a job (epic 37, 37c, D7).
 *
 * Through `requestJobCancel` (37b): a job this editor runs is aborted at
 * once; one another process runs (a CLI, the stdio MCP server) finds
 * `<id>.cancel` within a second. Answers `{job, outcome, status}` —
 * `cancelled`, `requested`, or `ended` when it had already finished (not an
 * error: the job is stopped either way). An unknown id is 404.
 *
 * Curation auth, write scope: a cancel ends someone's import.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { cancelJobById } from "recipe-editor/controller/jobs/views";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request);
    const { id } = await params;
    return Response.json(
      await cancelJobById(id, {
        reason: `cancelled by ${ctx.author?.email ?? "a person"}`,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
