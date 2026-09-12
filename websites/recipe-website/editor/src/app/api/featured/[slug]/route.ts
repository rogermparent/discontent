/**
 * `/api/featured/<slug>` — take one thing off the homepage strip.
 *
 * The slug is the *feature's*, not the target's: featuring the same group twice
 * is legal (D5), so "unfeature the thing that points at X" would be ambiguous
 * in a way `GET /api/featured` already resolves — list, then delete the row.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { unfeature } from "recipe-editor/controller/curation/featured";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const ctx = await requireCurationContext(request);
    return Response.json(await unfeature(ctx, slug));
  } catch (error) {
    return errorResponse(error);
  }
}
