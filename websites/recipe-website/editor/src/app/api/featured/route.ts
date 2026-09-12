/**
 * `/api/featured` — the homepage strip, listed and written (23a/D5).
 *
 * Featuring was form-only before this: the strip is the site's front door, and
 * an agent that had just built a collection could not put it there. The POST
 * body is `{recipe | group, note?, date?, slug?}` — exactly one target, checked
 * for existence, so a 422 is a feature that would have rendered a nameless
 * card.
 *
 * Thin, per T17: parse, authenticate, call `controller/curation/featured`,
 * answer through `errorResponse`.
 */
import {
  readContext,
  requireCurationContext,
} from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  intParam,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  feature,
  listFeatured,
} from "recipe-editor/controller/curation/featured";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(
      await listFeatured(readContext(), {
        limit: intParam(url, "limit"),
        offset: intParam(url, "offset"),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await feature(ctx, body), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
