/**
 * `POST /api/taxonomies/<taxonomy>/<slug>/rename` — `{to, label?}` (31c).
 *
 * Moves the term's record to the new slug (children and featured entries
 * follow by reference) and rewrites every carrier's tag string, one update
 * each. A target that already exists is 409 `slug_conflict`: that is a merge.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  assertTaxonomy,
  renameTerm,
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
    return Response.json(await renameTerm(ctx, slug, body));
  } catch (error) {
    return errorResponse(error);
  }
}
