/**
 * `POST /api/taxonomies/<taxonomy>/<slug>/merge` — `{into}` (31c).
 *
 * Re-tags every carrier of `<slug>` to `into` and folds the record in: moved
 * when `into` has no record, otherwise its children re-parented, its features
 * re-pointed, its pinned recipes appended and the record deleted. Not
 * undoable from here, like a delete.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  assertTaxonomy,
  mergeTerm,
} from "recipe-editor/controller/curation/terms";

interface Context {
  params: Promise<{ taxonomy: string; slug: string }>;
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { taxonomy, slug } = await params;
    assertTaxonomy(taxonomy);
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await mergeTerm(ctx, slug, body));
  } catch (error) {
    return errorResponse(error);
  }
}
