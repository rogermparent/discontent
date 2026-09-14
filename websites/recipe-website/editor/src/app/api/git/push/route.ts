/**
 * `POST /api/git/push {remote?, setUpstream?}` — send the branch upstream
 * (23d/D23).
 *
 * The one git write with no clean-tree preflight and no revalidation: nothing
 * local changes, so there is nothing to rebuild and no cache to expire (T47,
 * T50). The body is optional — a bare POST pushes the configured upstream,
 * which is what the `/git` page's button does.
 *
 * A non-fast-forward rejection is 409 `git_conflict` with the page's own
 * sentence; pulling the remote's commits is a decision for a person in `/git`.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitPush } from "recipe-editor/controller/curation/git";
import {
  GitPushSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request, { optional: true });
    const options = parseInput(GitPushSchema, body ?? {});
    return Response.json(await gitPush(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
