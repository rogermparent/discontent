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
 *
 * `?ifStale=1` (39b review, L3): a full rebuild that, once it has the
 * repository's line, finds HEAD and the index version current skips the
 * work and answers `{rebuilt: [], skipped: "fresh"}`. The Pi deploy asks it
 * so, since the new container's own start-time rebuild is usually just
 * ahead of it in line. A query parameter, not a body field: an older image
 * (a rollback) ignores it and rebuilds, where its strict body schema would
 * have refused an unknown key.
 */
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { recipeContentTypes } from "recipe-editor/controller/contentTypes";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { corpusOf, runSpec } from "recipe-editor/controller/jobs/kinds";
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
    const flag = new URL(request.url).searchParams.get("ifStale");
    const ifStale = flag === "1" || flag === "true";
    /* A `reindex` job (epic 39 D2): `job` in the answer, steps on `/jobs`. */
    const result = await runSpec(
      {
        kind: "reindex",
        ...corpusOf(ctx),
        ...(contentType ? { contentType } : {}),
        trigger: "api",
        ...(ifStale ? { ifStale: true } : {}),
      },
      { ctx },
    );
    if (!result.skipped) revalidateDerivedState(recipeContentTypes);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
