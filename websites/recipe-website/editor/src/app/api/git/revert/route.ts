/**
 * `POST /api/git/revert {hash}` — undo one commit with a new commit (23d/D23).
 *
 * No `revalidateDerivedState` here, unlike `/api/reindex`: a revert moves data
 * files the engine never wrote, so `gitRevert` rebuilds the indexes itself and
 * fires `ctx.onBulkChange` for the Next half (D20). The route stays thin (T17)
 * and the invalidation lives in one place — `curationContextFor` — rather than
 * in each of the two routes that need it.
 *
 * 409 when the tree is dirty or the patch conflicts, 422 for a hash that names
 * nothing or names a merge.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitRevert } from "recipe-editor/controller/curation/git";
import {
  GitRevertSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const { hash } = parseInput(GitRevertSchema, await readJsonBody(request));
    return Response.json(await gitRevert(ctx, hash));
  } catch (error) {
    return errorResponse(error);
  }
}
