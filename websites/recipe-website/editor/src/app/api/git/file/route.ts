/**
 * `GET /api/git/file?type&slug&rev` — one item's data file as it was (23d/D23).
 *
 * The read that comes *before* a restore: it answers "what would I get back"
 * with the parsed record rather than a diff, so a caller can compare it to the
 * current one and decide. Absent at that revision is a 404, since "was not
 * there" and "was empty" are different facts.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { gitFileAt } from "recipe-editor/controller/curation/git";
import {
  GitFileQuerySchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const url = new URL(request.url);
    const ref = parseInput(GitFileQuerySchema, {
      type: url.searchParams.get("type") ?? undefined,
      slug: url.searchParams.get("slug") ?? undefined,
      rev: url.searchParams.get("rev") ?? undefined,
    });
    return Response.json(await gitFileAt(ctx, ref));
  } catch (error) {
    return errorResponse(error);
  }
}
