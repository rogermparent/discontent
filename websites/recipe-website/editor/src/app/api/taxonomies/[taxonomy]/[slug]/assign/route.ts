/**
 * `POST /api/taxonomies/<taxonomy>/<slug>/assign` — `{add?, remove?, type?,
 * force?}` (31c; `force`, 35-D10).
 *
 * Tags and untags carriers — recipes, or groups with `type: "group"` — one
 * update each, and answers `{slug, type, tag, updated, unchanged, missing,
 * warnings?}`. An `add` naming no carrier is a 422 `unknown_recipe` /
 * `unknown_group` unless `force`. No record is required: assigning is how a
 * bare tag comes into being.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  assertTaxonomy,
  assignTerm,
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
    return Response.json(await assignTerm(ctx, slug, body));
  } catch (error) {
    return errorResponse(error);
  }
}
