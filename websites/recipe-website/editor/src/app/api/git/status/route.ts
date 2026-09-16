/**
 * `GET /api/git/status` — is the content directory a repository, and where is
 * it (23d/D23).
 *
 * Authenticated like every other git route: a repository's branches, remotes
 * and recent commit subjects describe the deployment rather than the content,
 * and history is not public the way a recipe page is.
 *
 * `export const runtime = "nodejs"` on this and its seven siblings is the first
 * such declaration in the tree (T23): `simple-git` spawns a child process and
 * LMDB maps files, neither of which the edge runtime can do.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { gitStatus } from "recipe-editor/controller/curation/git";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    return Response.json(await gitStatus(ctx));
  } catch (error) {
    return errorResponse(error);
  }
}
