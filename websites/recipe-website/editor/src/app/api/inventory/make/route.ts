/**
 * `/api/inventory/make?query=…&feature=…&limit=…&staples=0` — what the shared
 * list can make (25d), the seat behind `inventory_makeable` over `--remote`.
 *
 * Authenticated like its parent: the answer is the list, restated as recipes.
 * `query` is the search language (every recipe when absent); `feature`,
 * repeated, features an ingredient as `/make` does (41i); `limit` caps each
 * bucket's rows; `staples=0` (or `false`) stops assuming pantry staples (U5),
 * which are on otherwise. A `beanSwaps` parameter (42m's tier, gone in 43m)
 * is ignored.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  intParam,
} from "recipe-editor/controller/curation/http";
import { makeable } from "recipe-editor/controller/curation/inventory";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const url = new URL(request.url);
    const query = url.searchParams.get("query");
    const limit = intParam(url, "limit");
    const staples = url.searchParams.get("staples");
    const on = (value: string) => !/^(0|false|no|off)$/i.test(value.trim());
    const feature = url.searchParams.getAll("feature");
    return Response.json(
      await makeable(ctx, {
        ...(query !== null ? { query } : {}),
        ...(feature.length > 0 ? { feature } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(staples !== null ? { staples: on(staples) } : {}),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
