/**
 * `POST /api/git/pull {remote?}` — fetch and merge the upstream (27b/D4).
 *
 * Merge, never rebase; a conflict is aborted and answered with 409
 * `git_conflict` naming the files, so the tree is left exactly as it was and a
 * person resolves it from `/git`. A dirty tree is 409 `dirty_tree`. On success
 * every index is rebuilt and, through the context's `onBulkChange`, every
 * rendered page and derived tag expires — the same pair a revert fires.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitPull } from "recipe-editor/controller/curation/git";
import {
  GitPullSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request, { optional: true });
    const options = parseInput(GitPullSchema, body ?? {});
    return Response.json(await gitPull(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
