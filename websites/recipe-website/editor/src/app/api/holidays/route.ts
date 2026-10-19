/**
 * `/api/holidays?date=YYYY-MM-DD` — every holiday, soonest first (42h), the
 * seat behind `holiday_list` over `--remote`.
 *
 * A public read like `/api/tags` and `/api/taxonomies/tag/<slug>`: the same
 * holidays, counts and recipes are on the public `/holidays` pages and the
 * export. `date` counts as of that day; absent, the server's today.
 *
 * Thin, per T17: call `controller/curation/holidays`, answer through
 * `errorResponse`.
 */
import { readContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { holidayList } from "recipe-editor/controller/curation/holidays";

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date");
    return Response.json(
      await holidayList(readContext(), date !== null ? { date } : {}),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
