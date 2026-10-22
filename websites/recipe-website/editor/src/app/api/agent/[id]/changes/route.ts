/**
 * `GET /api/agent/<id>/changes` — what a curator run wrote (44d): the
 * recipes it created, imported or updated, each with its card's fields read
 * from the content (`missing` when it is no longer there), the terms and
 * plans it touched, the places (the homepage strip, what's on hand, the
 * shopping list) and its commits — over the whole conversation the run
 * holds (Ec3). Derived from the transcript's tool results
 * (`controller/agent/changes.ts`), never from the model's words.
 *
 * `<id>` as `GET /api/agent/<id>` takes it. Not an agent run is 404.
 * Curation auth, read scope.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { curatorRunChanges } from "recipe-editor/controller/agent/curator";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { id } = await params;
    return Response.json(
      await curatorRunChanges(id, { contentDirectory: ctx.contentDirectory }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
