/**
 * `/api/taxonomies/<taxonomy>/<slug>` — one term, read, patched or deleted
 * (31c).
 *
 * GET answers `getTerm`: the record (or `null` for a term that only exists on
 * carriers), breadcrumb, children, own and with-descendants counts, and the
 * own carriers. PATCH changes everything about the record except its slug —
 * moving a term is `…/rename`, because a rename rewrites every carrier.
 * DELETE is refused with 409 `term_in_use` while recipes or groups carry the
 * tag; `?unassign=1` removes it from them first, one update each.
 */
import {
  readContext,
  requireCurationContext,
} from "recipe-editor/controller/apiContext";
import {
  boolParam,
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  assertTaxonomy,
  deleteTerm,
  getTerm,
  updateTerm,
} from "recipe-editor/controller/curation/terms";

interface Context {
  params: Promise<{ taxonomy: string; slug: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { taxonomy, slug } = await params;
    assertTaxonomy(taxonomy);
    return Response.json(await getTerm(readContext(), slug));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { taxonomy, slug } = await params;
    assertTaxonomy(taxonomy);
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await updateTerm(ctx, slug, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { taxonomy, slug } = await params;
    assertTaxonomy(taxonomy);
    const url = new URL(request.url);
    const ctx = await requireCurationContext(request);
    return Response.json(
      await deleteTerm(ctx, slug, { unassign: boolParam(url, "unassign") }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
