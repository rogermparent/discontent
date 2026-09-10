/**
 * `DELETE /api/group/<slug>/items/<recipe>` — drop every item naming that
 * recipe, the inverse of the append above.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { removeItem } from "recipe-editor/controller/curation/groups";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; recipe: string }> },
) {
  try {
    const { slug, recipe } = await params;
    const ctx = await requireCurationContext(request);
    return Response.json(await removeItem(ctx, slug, recipe));
  } catch (error) {
    return errorResponse(error);
  }
}
