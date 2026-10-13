/**
 * `POST /api/inspect-list` — a roundup page's recipes, written nowhere (34f).
 *
 * The body is `{url}`; the answer is `InspectListResult`: the list's title
 * and `items: [{n, url, name, image?, existing?}]`, `existing` naming a recipe
 * already imported from that page, or a `reason` when the page lists none.
 *
 * Authenticated, read scope, for `/api/inspect`'s reason: it makes this server
 * fetch an arbitrary URL.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { inspectList } from "recipe-editor/controller/curation/importList";
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
    return Response.json(await inspectList(ctx, url));
  } catch (error) {
    return errorResponse(error);
  }
}
