/**
 * `POST /api/inspect-list` — a roundup page's recipes, written nowhere (34f).
 *
 * The body is `{url}`; the answer is `InspectListResult`: the list's title
 * and `items: [{n, url, name, image?, existing?}]`, `existing` naming a recipe
 * already imported from that page, or a `reason` when the page lists none.
 *
 * Authenticated, read scope, for `/api/inspect`'s reason: it makes this server
 * fetch an arbitrary URL. A list page the SSRF guard refuses answers 422
 * `url_refused` (46a).
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { assertFetchableUrl } from "recipe-editor/controller/guardedFetch";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { corpusOf, runSpec } from "recipe-editor/controller/jobs/kinds";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const InspectListBodySchema = z.strictObject({
  url: z.string().min(1, "inspect-list needs a url"),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { url } = parseInput(
      InspectListBodySchema,
      await readJsonBody(request),
    );
    await assertFetchableUrl(url);
    /* A job (epic 37): the answer carries its `job` id. */
    return Response.json(
      await runSpec({ kind: "inspect-list", ...corpusOf(ctx), url }, { ctx }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
