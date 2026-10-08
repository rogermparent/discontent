/**
 * `POST /api/git/sync {remote?}` — sync with a mirror (epic 28, D3).
 *
 * Fetch, merge the mirror's commits in, push ours back. Always 200 with an
 * `outcome` for the expected failures (`conflict`, `mirror_dirty`, `raced`,
 * `unreachable`, `blocked`); errors are misuse: 403 on a mirror, 422 for an
 * unknown remote. A merge rebuilds every index and fires `onBulkChange`. 28c
 * makes this the endpoint a mirror pings after its own commits.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitSync } from "recipe-editor/controller/curation/sync";
import {
  GitSyncSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request, { optional: true });
    const options = parseInput(GitSyncSchema, body ?? {});
    return Response.json(await gitSync(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
