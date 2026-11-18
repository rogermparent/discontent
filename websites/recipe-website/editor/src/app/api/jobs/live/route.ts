/**
 * `GET /api/jobs/live` — `{running, queued}`: how many jobs run and wait
 * now, for the masthead's live chip (48c). Reads the last day's records
 * only. Curation auth, read scope.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { liveJobCounts } from "recipe-editor/controller/jobs/views";

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    return Response.json(await liveJobCounts(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
