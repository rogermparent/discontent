/**
 * `POST /api/reindex` — Settings → Maintenance → Reload, over HTTP.
 *
 * Two halves, and both are needed. `reindex` rebuilds the LMDB index from the
 * data files, which is what repairs a directory edited behind the app's back
 * (a `git checkout` in the content repo, a CLI write, a hand-edited file).
 * `revalidateDerivedState` then expires every cached read derived from any
 * index — a rebuild reprojects everything and cannot know which cached page is
 * still right, which is exactly the case the catch-all item tag exists for.
 *
 * Over the whole registry rather than the rebuilt type: this is a repair seat,
 * and a repair seat wants everything. The narrow seats (`rebuildRecipeIndex`,
 * `rebuildFeaturedRecipeIndex`) are narrow on purpose and stay that way.
 */
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { recipeContentTypes } from "recipe-editor/controller/contentTypes";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { reindex } from "recipe-editor/controller/curation/reindex";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const ReindexBodySchema = z.strictObject({
  contentType: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    /*
     * An empty body means "all types", so the body is optional here alone —
     * but a body that is *present* still has to be JSON, and `readJsonBody`
     * is what turns a malformed one into a 400 rather than a 500.
     */
    const body = await readJsonBody(request, { optional: true });
    const { contentType } =
      body === undefined
        ? { contentType: undefined }
        : parseInput(ReindexBodySchema, body);
    const result = await reindex(ctx, contentType);
    revalidateDerivedState(recipeContentTypes);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
