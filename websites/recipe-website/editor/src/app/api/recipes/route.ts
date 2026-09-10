/**
 * `/api/recipes` — the corpus, and the door new recipes come in through.
 *
 * Thin by rule (T17): parse, authenticate, call `controller/curation/*`,
 * respond. The revalidation is not written here either — it rides the context's
 * `onWrite` hook, which is what makes "the page updates without a Reload" a
 * property of every write route rather than of the ones that remembered.
 *
 * GET is public. The editor already serves every recipe page to guests
 * (`allowGuest`), so gating the same data behind a token would protect nothing
 * and would stop the curator from reading a corpus it is about to add to.
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
  createRecipe,
  listRecipes,
} from "recipe-editor/controller/curation/recipes";
import { searchRecipes } from "recipe-editor/controller/curation/search";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ctx = readContext();
    const limit = intParam(url, "limit");
    const offset = intParam(url, "offset");

    const query = url.searchParams.get("q");
    if (query !== null) {
      return Response.json(await searchRecipes(ctx, query, { limit, offset }));
    }

    return Response.json(
      await listRecipes(ctx, {
        limit,
        offset,
        tag: url.searchParams.get("tag") ?? undefined,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    const result = await createRecipe(ctx, body, {
      overwrite: boolParam(url, "overwrite"),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
