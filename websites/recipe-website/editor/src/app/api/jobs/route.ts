/**
 * `GET /api/jobs` — this editor's jobs, newest first (epic 37, 37c, D7).
 *
 * `?status=` one of queued, running, done, failed, cancelled, interrupted, or
 * `live` (queued and running); `?kind=` a job kind (`import-url`,
 * `form-url`, …); `?limit=` 1–300, default 50. Rows are `JobSummary`: no
 * spec, no result — `GET /api/jobs/<id>` has those. `?queue=1` adds
 * `queue`: per resource (`gpu`, `ytdlp`, each active `site:`), the holder
 * and the line — the `/jobs` page's view.
 *
 * Curation auth, read scope (a read token may watch jobs). The store is the
 * editor's own (`RECIPE_JOBS_DIR`, else `editor/jobs/`): every process on
 * this machine that shares it — a CLI, the stdio MCP server — shows here too.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import {
  listJobSummaries,
  parseLimit,
  parseStatusFilter,
  queueOverview,
} from "recipe-editor/controller/jobs/views";

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    const query = new URL(request.url).searchParams;
    const status = parseStatusFilter(query.get("status"));
    const limit = parseLimit(query.get("limit"));
    const kind = query.get("kind") || undefined;
    const [list, queue] = await Promise.all([
      listJobSummaries({
        ...(status ? { status } : {}),
        ...(kind ? { kind } : {}),
        ...(limit ? { limit } : {}),
      }),
      query.get("queue") === "1" ? queueOverview() : undefined,
    ]);
    return Response.json(queue ? { ...list, queue } : list, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
