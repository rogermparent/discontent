/**
 * `POST /api/git/fetch {remote?}` — refresh the remote-tracking refs (27b/D4).
 *
 * Moves `refs/remotes/*` and `FETCH_HEAD` and nothing else: no content, no
 * index, no cache. So it needs only a `read` token (D6) and no revalidation,
 * and it answers with what it was for — ahead/behind against the upstream,
 * now current.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitFetch } from "recipe-editor/controller/curation/git";
import {
  GitFetchSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const body = await readJsonBody(request, { optional: true });
    const options = parseInput(GitFetchSchema, body ?? {});
    return Response.json(await gitFetch(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
