/**
 * `DELETE /api/group/<slug>/items/<slug>` — drop every item naming that target,
 * the inverse of the append above.
 *
 * `?kind=group` says the segment is a sub-group's slug rather than a recipe's
 * (23c/D15). The two namespaces are separate — one group may legitimately hold
 * a recipe and a group that share a slug — so the flag picks the row, and its
 * absence keeps the 22d behaviour byte for byte. The directory stays `[recipe]`:
 * renaming it would move a URL for nothing.
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
    const kind = new URL(request.url).searchParams.get("kind");
    const ctx = await requireCurationContext(request);
    return Response.json(
      await removeItem(
        ctx,
        slug,
        kind === "group" ? { group: recipe } : { recipe },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
