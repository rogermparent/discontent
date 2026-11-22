/** `GET /api/shopping/tidy/runs/<id>` (epic 50, 50b): one run, as the list reads it now. */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import {
  readShoppingItems,
  readTidyRun,
} from "recipe-editor/controller/curation/shopping";
import { tidyRunView } from "recipe-website-common/util/shoppingTidy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { id } = await params;
    const [run, items] = await Promise.all([
      readTidyRun(ctx, id),
      readShoppingItems(ctx),
    ]);
    return Response.json(tidyRunView(run, items), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
