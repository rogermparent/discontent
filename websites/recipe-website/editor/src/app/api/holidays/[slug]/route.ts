/**
 * `/api/holidays/<slug>?date=YYYY-MM-DD` — one holiday's menu (42h), the seat
 * behind `holiday_get` over `--remote`: when it next falls, and its recipes
 * by course (dishes) and by style (drinks). An alias of a holiday answers
 * that holiday; any other slug is 404 `not_found`.
 *
 * A public read, as `/api/holidays` is.
 */
import { readContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { holidayGet } from "recipe-editor/controller/curation/holidays";

interface Context {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const date = new URL(request.url).searchParams.get("date");
    return Response.json(
      await holidayGet(readContext(), slug, date !== null ? { date } : {}),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
