/**
 * `GET /api/jobs/board?limit=` — `/jobs` in one read (48c, variant B): the
 * newest jobs as board rows (`BoardJob`: a list row plus the page it read,
 * the status it answered, what it read or wrote, a curator run's cost),
 * the live jobs' step logs and the queue per resource. The page groups the
 * failures, folds the rounds and words the steps itself. `limit` 1–300,
 * default 300. Curation auth, read scope, like `GET /api/jobs`, whose
 * shape (the API's, the CLI's and MCP's) is unchanged.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { jobsBoard, parseLimit } from "recipe-editor/controller/jobs/views";

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
    return Response.json(await jobsBoard(limit ? { limit } : {}), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
