/**
 * `/api/taxonomies/<taxonomy>` — a vocabulary's terms, listed and created
 * (31c).
 *
 * Only `tag` exists; any other taxonomy is a 404. GET is public like
 * `/api/groups` and `/api/tags` — the vocabulary is what every tag page
 * already shows. POST writes a term **record** (`createTerm`); assigning the
 * term to recipes is `…/<slug>/assign`.
 *
 * `?records=1` lists only the terms that have a record; `limit` / `offset`
 * page the slug-sorted list.
 *
 * Thin, per T17: parse, authenticate, call `controller/curation/terms`,
 * answer through `errorResponse`.
 */
import {
  readContext,
  requireCurationContext,
} from "recipe-editor/controller/apiContext";
import {
  boolParam,
  errorResponse,
  intParam,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  assertTaxonomy,
  createTerm,
  listTerms,
} from "recipe-editor/controller/curation/terms";

interface Context {
  params: Promise<{ taxonomy: string }>;
}

export async function GET(request: Request, { params }: Context) {
  try {
    assertTaxonomy((await params).taxonomy);
    const url = new URL(request.url);
    return Response.json(
      await listTerms(readContext(), {
        limit: intParam(url, "limit"),
        offset: intParam(url, "offset"),
        records: boolParam(url, "records"),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertTaxonomy((await params).taxonomy);
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await createTerm(ctx, body), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
