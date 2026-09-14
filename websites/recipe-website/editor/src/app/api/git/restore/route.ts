/**
 * `POST /api/git/restore {type, slug, rev}` — put one item back (23d/D23).
 *
 * The narrow half of the rewind pair. A revert replays a patch and can
 * conflict; this makes one item's files match a revision whatever happened in
 * between, uploads included. Restoring to the revision the tree already holds
 * answers `{commit: null}` rather than making an empty commit, and rebuilds
 * nothing — there was nothing to rebuild.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitRestore } from "recipe-editor/controller/curation/git";
import {
  GitRestoreSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const ref = parseInput(GitRestoreSchema, await readJsonBody(request));
    return Response.json(await gitRestore(ctx, ref));
  } catch (error) {
    return errorResponse(error);
  }
}
