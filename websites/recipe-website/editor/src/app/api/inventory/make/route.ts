/**
 * `/api/inventory/make?query=…&limit=…` — what the shared list can make
 * (25d), the seat behind `inventory_makeable` over `--remote`.
 *
 * Authenticated like its parent: the answer is the list, restated as recipes.
 * `query` is the search language (`tag:drink` when absent); `limit` caps each
 * bucket's rows.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  intParam,
} from "recipe-editor/controller/curation/http";
import { makeable } from "recipe-editor/controller/curation/inventory";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("query");
    const limit = intParam(url, "limit");
    return Response.json(
      await makeable(ctx, {
        ...(query !== null ? { query } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
