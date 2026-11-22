/**
 * `GET /api/shopping/tidy/runs[?limit=N]` (epic 50, 50b, Db5): this list's
 * tidy runs, newest first, each with its suggestions' status now (pending,
 * accepted, skipped, or stale once an item has left the list).
 */
import { requireShoppingContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import {
  readShoppingItems,
  readTidyRuns,
} from "recipe-editor/controller/curation/shopping";
import { tidyRunView } from "recipe-website-common/util/shoppingTidy";

export async function GET(request: Request) {
  try {
    const ctx = await requireShoppingContext(request, { need: "read" });
    const raw = Number(new URL(request.url).searchParams.get("limit") ?? "");
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 20;
    const [runs, items] = await Promise.all([
      readTidyRuns(ctx),
      readShoppingItems(ctx),
    ]);
    return Response.json(
      { runs: runs.slice(0, limit).map((run) => tidyRunView(run, items)) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
